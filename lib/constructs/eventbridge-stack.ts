import { Stack, StackProps } from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface EventBridgeStackProps extends StackProps {
  readonly stateMachine: sfn.IStateMachine;
  readonly ingestBucket: s3.IBucket;
}

export class EventBridgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EventBridgeStackProps) {
    super(scope, id, props);

    // Trigger the state machine when an object is created under uploads/ in the ingest bucket
    const s3UploadRule = new events.Rule(this, 'S3UploadTriggerRule', {
      ruleName: 'EnrollUS3UploadTrigger',
      description: 'Triggers the Step Functions pipeline when a new document is uploaded to the Ingest bucket.',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [props.ingestBucket.bucketName],
          },
          object: {
            key: [{ prefix: 'uploads/' }],
          },
        },
      },
    });

    s3UploadRule.addTarget(new targets.SfnStateMachine(props.stateMachine));
  }
}
