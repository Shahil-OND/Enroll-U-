import { Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class IAMStack extends Stack {
  public readonly workflowRole: iam.Role;

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    this.workflowRole = new iam.Role(this, 'WorkflowRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    });

    // Required for Step Functions to deliver execution logs to CloudWatch
    this.workflowRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'logs:CreateLogDelivery',
        'logs:GetLogDelivery',
        'logs:UpdateLogDelivery',
        'logs:DeleteLogDelivery',
        'logs:ListLogDeliveries',
        'logs:PutResourcePolicy',
        'logs:DescribeResourcePolicies',
        'logs:DescribeLogGroups',
      ],
      resources: ['*'],
    }));

    // Required for Step Functions X-Ray tracing (tracingEnabled: true in state machine)
    this.workflowRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'xray:PutTraceSegments',
        'xray:PutTelemetryRecords',
        'xray:GetSamplingRules',
        'xray:GetSamplingTargets',
      ],
      resources: ['*'],
    }));

    // Required for Step Functions to execute nested state machines (.sync / RUN_JOB)
    this.workflowRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'states:StartExecution',
        'states:DescribeExecution',
        'states:StopExecution',
        'events:PutTargets',
        'events:PutRule',
        'events:DescribeRule',
      ],
      resources: ['*'],
    }));
  }
}

