import { Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class NetworkingStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly writerLambdaSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.writerLambdaSecurityGroup = new ec2.SecurityGroup(this, 'WriterLambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Security group for the MySQL writer Lambda.',
      allowAllOutbound: true,
    });
  }
}
