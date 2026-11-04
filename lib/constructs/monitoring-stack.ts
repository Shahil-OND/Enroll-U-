import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends StackProps {
  readonly extractFn: lambda.IFunction;
  readonly normalizeFn: lambda.IFunction;
  readonly validateFn: lambda.IFunction;
  readonly approveFn: lambda.IFunction;
  readonly rejectFn: lambda.IFunction;
  readonly reprocessFn: lambda.IFunction;
  readonly getDocumentsFn: lambda.IFunction;
  readonly mysqlWriterFn: lambda.IFunction;
  readonly stateMachine: sfn.IStateMachine;
}

export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    this.createLogGroup('ExtractLogs', props.extractFn.functionName);
    this.createLogGroup('NormalizeLogs', props.normalizeFn.functionName);
    this.createLogGroup('ValidateLogs', props.validateFn.functionName);
    this.createLogGroup('ApproveLogs', props.approveFn.functionName);
    this.createLogGroup('RejectLogs', props.rejectFn.functionName);
    this.createLogGroup('ReprocessLogs', props.reprocessFn.functionName);
    this.createLogGroup('GetDocumentsLogs', props.getDocumentsFn.functionName);
    this.createLogGroup('MysqlWriterLogs', props.mysqlWriterFn.functionName);


    new cloudwatch.Alarm(this, 'ExtractErrorAlarm', {
      metric: props.extractFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'WorkflowFailureAlarm', {
      metric: props.stateMachine.metricFailed({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });
    new cloudwatch.Alarm(this, 'MysqlWriterErrorAlarm', {
      metric: props.mysqlWriterFn.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    const dashboard = new cloudwatch.Dashboard(this, 'OperationsDashboard', {
      dashboardName: 'EnrollUOperations',
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Errors',
        left: [
          props.extractFn.metricErrors(),
          props.normalizeFn.metricErrors(),
          props.validateFn.metricErrors(),
          props.approveFn.metricErrors(),
          props.rejectFn.metricErrors(),
          props.reprocessFn.metricErrors(),
          props.getDocumentsFn.metricErrors(),
          props.mysqlWriterFn.metricErrors(),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [
          props.extractFn.metricDuration(),
          props.normalizeFn.metricDuration(),
          props.validateFn.metricDuration(),
          props.approveFn.metricDuration(),
          props.rejectFn.metricDuration(),
          props.reprocessFn.metricDuration(),
          props.getDocumentsFn.metricDuration(),
          props.mysqlWriterFn.metricDuration(),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Workflow Health',
        left: [props.stateMachine.metricFailed(), props.stateMachine.metricSucceeded()],
      }),
    );

    
  }

  private createLogGroup(constructId: string, functionName: string): logs.LogGroup {
    return new logs.LogGroup(this, constructId, {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
