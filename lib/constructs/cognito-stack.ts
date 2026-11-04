import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface CognitoStackProps extends StackProps {
  readonly callbackUrls?: string[];
  readonly logoutUrls?: string[];
}

export class CognitoStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly operatorGroup: cognito.CfnUserPoolGroup;
  public readonly adminGroup: cognito.CfnUserPoolGroup;
  public readonly userPoolDomain?: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: CognitoStackProps = {}) {
    super(scope, id, props);

    // 1. Amazon Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'EnrollUUserPool', {
      userPoolName: 'EnrollU-UserPool',
      selfSignUpEnabled: false, // Per requirement: Admin creates users; no open sign-up
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
        fullname: {
          required: false,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY, // Suitable for prototyping
    });

    // 2. Cognito User Groups: Operator and Administrator
    this.operatorGroup = new cognito.CfnUserPoolGroup(this, 'OperatorGroup', {
      groupName: 'Operator',
      userPoolId: this.userPool.userPoolId,
      description: 'Operator role: upload, review, edit, approve and reject documents',
      precedence: 10,
    });

    this.adminGroup = new cognito.CfnUserPoolGroup(this, 'AdministratorGroup', {
      groupName: 'Administrator',
      userPoolId: this.userPool.userPoolId,
      description: 'Administrator role: all operator capabilities plus delete documents and manage users',
      precedence: 1,
    });

    const defaultCallbacks = [
      'http://localhost:5173',
      'http://localhost:5173/',
      'http://localhost:3000',
      'http://localhost:3000/',
    ];

    const defaultLogouts = [
      'http://localhost:5173/login',
      'http://localhost:5173',
      'http://localhost:3000/login',
      'http://localhost:3000',
    ];

    const callbackUrls = Array.from(new Set([...defaultCallbacks, ...(props.callbackUrls || [])]));
    const logoutUrls = Array.from(new Set([...defaultLogouts, ...(props.logoutUrls || [])]));

    // 3. User Pool App Client with PKCE / Managed Login & direct auth support
    this.userPoolClient = this.userPool.addClient('EnrollUWebClient', {
      userPoolClientName: 'EnrollU-WebClient',
      generateSecret: false, // Public client for Single Page App (React)
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true, // OAuth 2.0 PKCE flow
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      accessTokenValidity: Duration.hours(8),
      idTokenValidity: Duration.hours(8),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
    });

    // 4. Domain for Cognito Managed Login / Hosted UI
    // Uses a unique prefix based on stack/account
    const domainPrefix = `enrollu-auth-${Stack.of(this).account.substring(0, 8)}`;
    this.userPoolDomain = this.userPool.addDomain('EnrollUAuthDomain', {
      cognitoDomain: {
        domainPrefix,
      },
    });

    // 5. CloudFormation Outputs
    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: 'EnrollU-UserPoolId',
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
      exportName: 'EnrollU-UserPoolClientId',
    });

    new CfnOutput(this, 'CognitoDomain', {
      value: `${domainPrefix}.auth.${Stack.of(this).region}.amazoncognito.com`,
      description: 'Cognito Managed Login Hosted UI Domain',
      exportName: 'EnrollU-CognitoDomain',
    });
  }
}

