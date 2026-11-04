import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaStackProps extends StackProps {
  readonly ingestBucket: s3.IBucket;
  readonly stagingTable: dynamodb.ITable;
  readonly appSecret: secretsmanager.ISecret;
  readonly mysqlSecret: secretsmanager.ISecret;
  readonly stateMachineArn: string;
  readonly batchStateMachineArn?: string;
}

export class LambdaStack extends Stack {
  public readonly executionRole: iam.Role;
  public readonly extractFn: lambda.Function;
  public readonly normalizeFn: lambda.Function;
  public readonly validateFn: lambda.Function;
  public readonly approveFn: lambda.Function;
  public readonly rejectFn: lambda.Function;
  public readonly reprocessFn: lambda.Function;
  public readonly deleteFn: lambda.Function;
  public readonly getDocumentsFn: lambda.Function;
  public readonly uploadFn: lambda.Function;
  public readonly updateJsonFn: lambda.Function;
  public readonly translateFn: lambda.Function;
  public readonly batchFn: lambda.Function;
  public readonly consolidationFn: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    this.executionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Issue 1: Explicit scoped IAM policies — no generic wildcard fallbacks
    // S3 presigned URL generation (grantReadWrite doesn't cover GeneratePresignedUrl)
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:GetBucketLocation'],
      resources: [
        props.ingestBucket.bucketArn,
        `${props.ingestBucket.bucketArn}/*`,
      ],
    }));

    // Amazon Textract — AWS does not support resource-level ARNs for Textract
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'textract:StartDocumentTextDetection',
        'textract:GetDocumentTextDetection',
        'textract:DetectDocumentText',
      ],
      resources: ['*'],
    }));

    // Note: bedrock:InvokeModel is handled by bedrock-stack.ts (InvokeModel + Converse + ConverseStream)

    // Step Functions — reprocess Lambda needs StartExecution + DescribeStateMachine
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:StartExecution',
        'states:DescribeStateMachine',
        'states:ListExecutions',
      ],
      resources: [props.stateMachineArn],
    }));

    // Lambda self-invoke (kept for forward compatibility)
    this.executionRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: ['*'],
    }));

    const sharedWorkflowLayer = new lambda.LayerVersion(this, 'WorkflowLayer', {
      code: lambda.Code.fromAsset(path.resolve(process.cwd(), 'build', 'layers', 'common')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Shared workflow layer containing common config and modules.',
    });

    const sharedCrudLayer = new lambda.LayerVersion(this, 'CrudLayer', {
      code: lambda.Code.fromAsset(path.resolve(process.cwd(), 'build', 'layers', 'common')),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: 'Shared CRUD layer containing common config and modules.',
    });

    const workflowEnv = {
      PROJECT_NAME: 'EnrollU',
      ENVIRONMENT: 'POC',
      INGEST_BUCKET_NAME: props.ingestBucket.bucketName,
      STAGING_TABLE_NAME: props.stagingTable.tableName,
      APP_SECRET_ARN: props.appSecret.secretArn,
      MYSQL_SECRET_ARN: props.mysqlSecret.secretArn,
      BEDROCK_MODEL_ID: 'us.amazon.nova-pro-v1:0',
      LLM_PROVIDER: 'bedrock',
    };

    const crudEnv = {
      PROJECT_NAME: 'EnrollU',
      ENVIRONMENT: 'POC',
      INGEST_BUCKET_NAME: props.ingestBucket.bucketName,
      STAGING_TABLE_NAME: props.stagingTable.tableName,
      APP_SECRET_ARN: props.appSecret.secretArn,
      BEDROCK_MODEL_ID: 'us.amazon.nova-pro-v1:0',
      LLM_PROVIDER: 'bedrock',
    };

    // Issue 2: extractFn gets an explicit 2-minute timeout to support Textract async polling
    this.extractFn = this.createFunction('ExtractFunction', 'EnrollU-Extract', 'extract.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'extract'), sharedWorkflowLayer, workflowEnv, Duration.minutes(2));
    this.normalizeFn = this.createFunction('NormalizeFunction', 'EnrollU-Normalize', 'normalize.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'normalize'), sharedWorkflowLayer, workflowEnv, Duration.minutes(3));
    this.validateFn = this.createFunction('ValidateFunction', 'EnrollU-Validate', 'validate.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'validate'), sharedWorkflowLayer, workflowEnv);
    this.approveFn = this.createFunction('ApproveFunction', 'EnrollU-Approve', 'approve.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, crudEnv);
    this.rejectFn = this.createFunction('RejectFunction', 'EnrollU-Reject', 'reject.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, crudEnv);
    // Issue 4: Pass state machine ARN directly — no dynamic list_state_machines() lookup
    this.reprocessFn = this.createFunction('ReprocessFunction', 'EnrollU-Reprocess', 'reprocess.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, { ...crudEnv, STEP_FUNCTIONS_ARN: props.stateMachineArn });
    this.deleteFn = this.createFunction('DeleteFunction', 'EnrollU-Delete', 'delete.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, crudEnv);

    this.getDocumentsFn = this.createFunction('GetDocumentsFunction', 'EnrollU-GetDocuments', 'get_documents.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, crudEnv);
    this.uploadFn = this.createFunction('UploadFunction', 'EnrollU-Upload', 'upload.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, { ...crudEnv, STEP_FUNCTIONS_ARN: props.stateMachineArn });
    this.updateJsonFn = this.createFunction('UpdateJsonFunction', 'EnrollU-UpdateJson', 'update_json.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, crudEnv);
    this.translateFn = this.createFunction('TranslateFunction', 'EnrollU-Translate', 'translate.handler', path.resolve(process.cwd(), 'build', 'lambdas', 'crud'), sharedCrudLayer, crudEnv);

    this.batchFn = this.createFunction(
      'BatchFunction',
      'EnrollU-Batch',
      'batch.handler',
      path.resolve(process.cwd(), 'build', 'lambdas', 'crud'),
      sharedCrudLayer,
      {
        ...crudEnv,
        STEP_FUNCTIONS_ARN: props.stateMachineArn,
        STEP_FUNCTIONS_BATCH_ARN: props.batchStateMachineArn || props.stateMachineArn,
      },
      Duration.minutes(1),
    );

    this.consolidationFn = this.createFunction(
      'ConsolidationFunction',
      'EnrollU-Consolidation',
      'consolidation.handler',
      path.resolve(process.cwd(), 'build', 'lambdas', 'consolidation'),
      sharedWorkflowLayer,
      workflowEnv,
      Duration.minutes(3),
    );

    props.ingestBucket.grantReadWrite(this.executionRole);
    props.stagingTable.grantReadWriteData(this.executionRole);
    props.appSecret.grantRead(this.executionRole);
    props.mysqlSecret.grantRead(this.executionRole);
  }

  private createFunction(
    constructId: string,
    functionName: string,
    handler: string,
    assetPath: string,
    layer: lambda.LayerVersion,
    environment: Record<string, string>,
    timeout: Duration = Duration.seconds(30),
  ): lambda.Function {
    return new lambda.Function(this, constructId, {
      functionName,
      runtime: lambda.Runtime.PYTHON_3_12,
      handler,
      code: lambda.Code.fromAsset(assetPath),
      role: this.executionRole,
      layers: [layer],
      environment,
      timeout,
      memorySize: 512,
    });
  }
}
