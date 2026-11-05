#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AccountStack } from '../lib/constructs/account-stack';
import { ApiGatewayStack } from '../lib/constructs/apigateway-stack';
import { BedrockStack } from '../lib/constructs/bedrock-stack';
import { CloudFrontStack } from '../lib/constructs/cloudfront-stack';
import { DatabaseStack } from '../lib/constructs/database-stack';
import { DynamoDBStack } from '../lib/constructs/dynamodb-stack';
import { EventBridgeStack } from '../lib/constructs/eventbridge-stack';
import { IAMStack } from '../lib/constructs/iam-stack';
import { LambdaStack } from '../lib/constructs/lambda-stack';
import { MonitoringStack } from '../lib/constructs/monitoring-stack';
import { NetworkingStack } from '../lib/constructs/networking-stack';
import { S3Stack } from '../lib/constructs/s3-stack';
import { SecretsStack } from '../lib/constructs/secrets-stack';
import { StepFunctionsStack } from '../lib/constructs/stepfunctions-stack';
import { TextractStack } from '../lib/constructs/textract-stack';

const app = new cdk.App();

cdk.Tags.of(app).add('Project', 'EnrollU');
cdk.Tags.of(app).add('Environment', 'POC');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('aws-apn-id', 'pc:7t8pxq5dh89gbwotrt59s3ugj');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const networkingStack = new NetworkingStack(app, 'NetworkingStack', { env });
const s3Stack = new S3Stack(app, 'S3Stack', { env });
const dynamodbStack = new DynamoDBStack(app, 'DynamoDBStack', { env });
const secretsStack = new SecretsStack(app, 'SecretsStack', { env });
const iamStack = new IAMStack(app, 'IAMStack', { env });
const lambdaStack = new LambdaStack(app, 'LambdaStack', {
  env,
  ingestBucket: s3Stack.ingestBucket,
  stagingTable: dynamodbStack.stagingTable,
  appSecret: secretsStack.appSecret,
  mysqlSecret: secretsStack.mysqlSecret,
  // Deterministic CDK token — resolves to the actual ARN at deploy time
  stateMachineArn: `arn:${cdk.Aws.PARTITION}:states:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stateMachine:EnrollUWorkflow`,
  batchStateMachineArn: `arn:${cdk.Aws.PARTITION}:states:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:stateMachine:EnrollUBatchWorkflow`,
});

const textractStack = new TextractStack(app, 'TextractStack', {
  env,
  lambdaExecutionRole: lambdaStack.executionRole,
});

const bedrockStack = new BedrockStack(app, 'BedrockStack', {
  env,
  lambdaExecutionRole: lambdaStack.executionRole,
});
const stepFunctionsStack = new StepFunctionsStack(app, 'StepFunctionsStack', {
  env,
  extractFn: lambdaStack.extractFn,
  normalizeFn: lambdaStack.normalizeFn,
  validateFn: lambdaStack.validateFn,
  consolidationFn: lambdaStack.consolidationFn,
  workflowRole: iamStack.workflowRole,
});
const eventBridgeStack = new EventBridgeStack(app, 'EventBridgeStack', {
  env,
  stateMachine: stepFunctionsStack.stateMachine,
  ingestBucket: s3Stack.ingestBucket,
});
const apiGatewayStack = new ApiGatewayStack(app, 'ApiGatewayStack', {
  env,
  approveFn: lambdaStack.approveFn,
  rejectFn: lambdaStack.rejectFn,
  reprocessFn: lambdaStack.reprocessFn,
  deleteFn: lambdaStack.deleteFn,
  getDocumentsFn: lambdaStack.getDocumentsFn,
  uploadFn: lambdaStack.uploadFn,
  updateJsonFn: lambdaStack.updateJsonFn,
  translateFn: lambdaStack.translateFn,
  batchFn: lambdaStack.batchFn,
});
const cloudFrontStack = new CloudFrontStack(app, 'CloudFrontStack', { env });
const databaseStack = new DatabaseStack(app, 'DatabaseStack', {
  env,
  mysqlSecret: secretsStack.mysqlSecret,
  stagingMysqlSecret: secretsStack.stagingMysqlSecret,
  vpc: networkingStack.vpc,
  writerLambdaSecurityGroup: networkingStack.writerLambdaSecurityGroup,
});
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  env,
  extractFn: lambdaStack.extractFn,
  normalizeFn: lambdaStack.normalizeFn,
  validateFn: lambdaStack.validateFn,
  approveFn: lambdaStack.approveFn,
  rejectFn: lambdaStack.rejectFn,
  reprocessFn: lambdaStack.reprocessFn,
  getDocumentsFn: lambdaStack.getDocumentsFn,
  mysqlWriterFn: databaseStack.mysqlWriterFn,
  stateMachine: stepFunctionsStack.stateMachine,
});
const accountStack = new AccountStack(app, 'AccountStack', { env });

void networkingStack;
void textractStack;
void bedrockStack;
void eventBridgeStack;
void apiGatewayStack;
void cloudFrontStack;
void monitoringStack;
void accountStack;

app.synth();
