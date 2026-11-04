import * as path from 'path';
import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends StackProps {
  readonly mysqlSecret: secretsmanager.ISecret;
  readonly vpc: ec2.IVpc;
  readonly writerLambdaSecurityGroup: ec2.ISecurityGroup;
}

export class DatabaseStack extends Stack {
  public readonly databaseSecurityGroup: ec2.SecurityGroup;
  public readonly writerRole: iam.Role;
  public readonly mysqlWriterFn: lambda.Function;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.databaseSecurityGroup = new ec2.SecurityGroup(this, 'MysqlSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group placeholder for future MySQL resources.',
      allowAllOutbound: true,
    });

    this.databaseSecurityGroup.addIngressRule(
      props.writerLambdaSecurityGroup,
      ec2.Port.tcp(3306),
      'Allow MySQL connections from the writer Lambda placeholder.',
    );

    this.writerRole = new iam.Role(this, 'MysqlWriterRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
      ],
    });

    this.mysqlWriterFn = new lambda.Function(this, 'MysqlWriterFunction', {
      functionName: 'EnrollU-MySqlWriter',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'writer.handler',
      code: lambda.Code.fromAsset(path.resolve(process.cwd(), 'build', 'lambdas', 'mysql_writer')),
      role: this.writerRole,
      environment: {
        PROJECT_NAME: 'EnrollU',
        ENVIRONMENT: 'POC',
        MYSQL_SECRET_ARN: props.mysqlSecret.secretArn,
      },
      vpc: props.vpc,
      securityGroups: [props.writerLambdaSecurityGroup],
      timeout: Duration.seconds(30),
      memorySize: 512,
    });

    props.mysqlSecret.grantRead(this.mysqlWriterFn);

    new CfnOutput(this, 'DatabaseSecurityGroupId', { value: this.databaseSecurityGroup.securityGroupId });
  }
}
