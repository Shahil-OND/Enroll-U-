import { Stack, StackProps } from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends StackProps {
  readonly approveFn: lambda.IFunction;
  readonly rejectFn: lambda.IFunction;
  readonly reprocessFn: lambda.IFunction;
  readonly deleteFn: lambda.IFunction;
  readonly getDocumentsFn: lambda.IFunction;
  readonly uploadFn: lambda.IFunction;
  readonly updateJsonFn: lambda.IFunction;
  readonly translateFn: lambda.IFunction;
  readonly batchFn?: lambda.IFunction;
}

export class ApiGatewayStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const api = new apigateway.RestApi(this, 'EnrollUApi', {
      restApiName: 'EnrollUApi',
      description: 'Enroll-U placeholder API for the scaffold.',
      cloudWatchRole: true,
      binaryMediaTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream',
        'multipart/form-data',
        'image/png',
        'image/jpeg',
        'text/plain'
      ],
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        tracingEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Authorization', 'Content-Type', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
      },
    });

    const documents = api.root.addResource('documents');
    documents.addMethod('GET', new apigateway.LambdaIntegration(props.getDocumentsFn));

    const documentId = documents.addResource('{documentId}');
    documentId.addMethod('DELETE', new apigateway.LambdaIntegration(props.deleteFn));

    const approve = documentId.addResource('approve');
    const reject = documentId.addResource('reject');
    const reprocess = documentId.addResource('reprocess');
    const jsonResource = documentId.addResource('json');
    const file = documentId.addResource('file');


    file.addMethod('GET', new apigateway.LambdaIntegration(props.getDocumentsFn));

    for (const [resource, fn] of [
      [approve, props.approveFn],
      [reject, props.rejectFn],
      [reprocess, props.reprocessFn],
    ] as const) {
      resource.addMethod('POST', new apigateway.LambdaIntegration(fn));
    }

    jsonResource.addMethod('PATCH', new apigateway.LambdaIntegration(props.updateJsonFn));

    const upload = api.root.addResource('upload');
    upload.addMethod('POST', new apigateway.LambdaIntegration(props.uploadFn));

    const paste = api.root.addResource('paste');
    paste.addMethod('POST', new apigateway.LambdaIntegration(props.uploadFn));

    const translate = api.root.addResource('translate');
    translate.addMethod('POST', new apigateway.LambdaIntegration(props.translateFn));

    if (props.batchFn) {
      const batches = api.root.addResource('batches');
      batches.addMethod('POST', new apigateway.LambdaIntegration(props.batchFn));

      const batchId = batches.addResource('{batchId}');
      batchId.addMethod('GET', new apigateway.LambdaIntegration(props.batchFn));

      const batchStart = batchId.addResource('start');
      batchStart.addMethod('POST', new apigateway.LambdaIntegration(props.batchFn));
    }

    const health = api.root.addResource('health');
    health.addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': "'*'",
            },
            responseTemplates: {
              'application/json': '{"status": "ok", "service": "EnrollUApi"}',
            },
          },
        ],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
      }),
      {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      }
    );
  }
}
