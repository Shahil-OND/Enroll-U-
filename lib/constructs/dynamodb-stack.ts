import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DynamoDBStack extends Stack {
  public readonly stagingTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    this.stagingTable = new dynamodb.Table(this, 'StagingTable', {
      tableName: 'EnrollUStaging',
      partitionKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'stage', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
