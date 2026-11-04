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

    // GSI1: Query all documents and partial results by institution groupId
    this.stagingTable.addGlobalSecondaryIndex({
      indexName: 'byGroupId',
      partitionKey: { name: 'groupId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Query all documents and metadata by batchId
    this.stagingTable.addGlobalSecondaryIndex({
      indexName: 'byBatchId',
      partitionKey: { name: 'batchId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
