import { Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface TextractStackProps extends StackProps {
  readonly lambdaExecutionRole: iam.IRole;
}

export class TextractStack extends Stack {
  constructor(scope: Construct, id: string, props: TextractStackProps) {
    super(scope, id, props);

    const textractPolicy = new iam.Policy(this, 'TextractPolicy', {
      statements: [
        new iam.PolicyStatement({
          actions: [
            'textract:AnalyzeDocument',
            'textract:DetectDocumentText',
            'textract:AnalyzeExpense',
            'textract:StartDocumentAnalysis',
            'textract:StartDocumentTextDetection',
            'textract:GetDocumentAnalysis',
            'textract:GetDocumentTextDetection',
          ],
          resources: ['*'],
        }),
      ],
    });

    props.lambdaExecutionRole.attachInlinePolicy(textractPolicy);
  }
}
