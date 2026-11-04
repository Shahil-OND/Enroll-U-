import { RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class SecretsStack extends Stack {
  public readonly appSecret: secretsmanager.Secret;
  public readonly mysqlSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    this.appSecret = new secretsmanager.Secret(this, 'AppSecret', {
      secretName: 'enrollu/poc/app',
      description: 'Placeholder app secret for the Enroll-U scaffold.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ service: 'EnrollU' }),
        generateStringKey: 'token',
        excludePunctuation: true,
        includeSpace: false,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.mysqlSecret = new secretsmanager.Secret(this, 'MysqlSecret', {
      secretName: 'enrollu/poc/mysql',
      description: 'Placeholder MySQL credential secret for future deployment.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'enrollu' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        includeSpace: false,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
