import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface StepFunctionsStackProps extends StackProps {
  readonly extractFn: lambda.IFunction;
  readonly normalizeFn: lambda.IFunction;
  readonly validateFn: lambda.IFunction;
  readonly consolidationFn?: lambda.IFunction;
  readonly workflowRole: iam.IRole;
}

export class StepFunctionsStack extends Stack {
  public readonly stateMachine: sfn.StateMachine;
  public readonly batchStateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: StepFunctionsStackProps) {
    super(scope, id, props);

    const workflowLogGroup = new logs.LogGroup(this, 'WorkflowLogGroup', {
      logGroupName: '/aws/vendedlogs/states/EnrollUWorkflow',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const pipelineFailed = new sfn.Fail(this, 'PipelineFailed', {
      stateName: 'PipelineFailed',
      comment: 'One or more pipeline steps failed after retries.',
    });

    const pipelineSucceeded = new sfn.Succeed(this, 'PipelineSucceeded', {
      comment: 'Document processed and validated successfully.',
    });

    const extractTask = new tasks.LambdaInvoke(this, 'ExtractTask', {
      lambdaFunction: props.extractFn,
      outputPath: '$.Payload',
    });
    extractTask.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    const normalizeTask = new tasks.LambdaInvoke(this, 'NormalizeTask', {
      lambdaFunction: props.normalizeFn,
      outputPath: '$.Payload',
    });
    normalizeTask.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    const validateTask = new tasks.LambdaInvoke(this, 'ValidateTask', {
      lambdaFunction: props.validateFn,
      outputPath: '$.Payload',
    });
    validateTask.addRetry({
      errors: ['Lambda.ServiceException', 'Lambda.AWSLambdaException', 'Lambda.SdkClientException'],
      interval: Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2,
    });

    extractTask.addCatch(pipelineFailed, { errors: ['States.ALL'], resultPath: '$.errorInfo' });
    normalizeTask.addCatch(pipelineFailed, { errors: ['States.ALL'], resultPath: '$.errorInfo' });
    validateTask.addCatch(pipelineFailed, { errors: ['States.ALL'], resultPath: '$.errorInfo' });

    const chain = sfn.Chain
      .start(extractTask)
      .next(normalizeTask)
      .next(validateTask)
      .next(pipelineSucceeded);

    this.stateMachine = new sfn.StateMachine(this, 'WorkflowStateMachine', {
      stateMachineName: 'EnrollUWorkflow',
      definitionBody: sfn.DefinitionBody.fromChainable(chain),
      role: props.workflowRole,
      logs: {
        destination: workflowLogGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: Duration.minutes(15),
      tracingEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    props.extractFn.grantInvoke(props.workflowRole);
    props.normalizeFn.grantInvoke(props.workflowRole);
    props.validateFn.grantInvoke(props.workflowRole);

    // ─────────────────────────────────────────────────────────────────────────
    // EnrollUBatchWorkflow (DPI Requirement 5)
    // ─────────────────────────────────────────────────────────────────────────
    const batchLogGroup = new logs.LogGroup(this, 'BatchWorkflowLogGroup', {
      logGroupName: '/aws/vendedlogs/states/EnrollUBatchWorkflow',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const batchFailed = new sfn.Fail(this, 'BatchFailed', {
      stateName: 'BatchFailed',
      comment: 'Batch processing failed.',
    });

    const batchSucceeded = new sfn.Succeed(this, 'BatchSucceeded', {
      comment: 'Batch execution and consolidation completed successfully.',
    });

    // Sub-execution task calling the existing single-file state machine
    const executeSingleDocWorkflow = new tasks.StepFunctionsStartExecution(this, 'ExecuteDocumentWorkflow', {
      stateMachine: this.stateMachine,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      input: sfn.TaskInput.fromObject({
        'bucket.$': '$.bucket',
        'key.$': '$.key',
        'document_id.$': '$.document_id',
        'documentId.$': '$.documentId',
        'processing_mode.$': '$.processing_mode',
        'processingMode.$': '$.processingMode',
        'group_id.$': '$.group_id',
        'groupId.$': '$.groupId',
        'batch_id.$': '$.batch_id',
        'batchId.$': '$.batchId',
        'institution_name.$': '$.institution_name',
        'institutionName.$': '$.institutionName',
      }),
      outputPath: '$.Output',
    });

    // Catch individual document failures so remaining documents continue processing
    const singleDocFailedFallback = new sfn.Pass(this, 'SingleDocFailedFallback', {
      result: sfn.Result.fromObject({ status: 'failed', message: 'Document pipeline failed' }),
    });
    executeSingleDocWorkflow.addCatch(singleDocFailedFallback, {
      errors: ['States.ALL'],
      resultPath: '$.errorInfo',
    });

    // Map state for documents with concurrency control
    const processBatchMap = new sfn.Map(this, 'ProcessDocumentsMap', {
      itemsPath: '$.documents',
      resultPath: '$.processedDocuments',
      maxConcurrency: 3,
      comment: 'Process documents concurrently using existing EnrollUWorkflow',
    });
    processBatchMap.itemProcessor(executeSingleDocWorkflow);

    let batchChain: sfn.Chain;

    if (props.consolidationFn) {
      const consolidationTask = new tasks.LambdaInvoke(this, 'ConsolidationTask', {
        lambdaFunction: props.consolidationFn,
        payload: sfn.TaskInput.fromObject({
          'batch_id.$': '$.batch_id',
          'batchId.$': '$.batchId',
          'groups.$': '$.groups',
        }),
        resultPath: '$.consolidationResult',
      });
      consolidationTask.addCatch(batchFailed, { errors: ['States.ALL'], resultPath: '$.consolidationError' });
      props.consolidationFn.grantInvoke(props.workflowRole);

      batchChain = sfn.Chain.start(processBatchMap)
        .next(consolidationTask)
        .next(batchSucceeded);
    } else {
      batchChain = sfn.Chain.start(processBatchMap).next(batchSucceeded);
    }

    this.batchStateMachine = new sfn.StateMachine(this, 'BatchWorkflowStateMachine', {
      stateMachineName: 'EnrollUBatchWorkflow',
      definitionBody: sfn.DefinitionBody.fromChainable(batchChain),
      role: props.workflowRole,
      logs: {
        destination: batchLogGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: Duration.minutes(30),
      tracingEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
}
