import { Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BedrockStackProps extends StackProps {
  readonly lambdaExecutionRole: iam.IRole;
}

export class BedrockStack extends Stack {
  constructor(scope: Construct, id: string, props: BedrockStackProps) {
    super(scope, id, props);

    const bedrockPolicy = new iam.Policy(this, 'BedrockPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['bedrock:ListFoundationModels'],
          resources: ['*'],
        }),

        new iam.PolicyStatement({
          actions: [
            'bedrock:InvokeModel',
            'bedrock:InvokeModelWithResponseStream',
            'bedrock:Converse',
            'bedrock:ConverseStream',
          ],
          resources: [
            'arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0',
            `arn:aws:bedrock:us-west-2:${Stack.of(this).account}:inference-profile/us.amazon.nova-pro-v1:0`,
          ],
        }),
      ],
    });

    props.lambdaExecutionRole.attachInlinePolicy(bedrockPolicy);
  }
}
