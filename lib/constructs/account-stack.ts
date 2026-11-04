import { Stack, StackProps } from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class AccountStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    const topic = new sns.Topic(this, 'BudgetAlertsTopic', {
      displayName: 'EnrollU Budget Alerts',
    });

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'EnrollUMonthlyBudget',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 100,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'ACTUAL',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              address: topic.topicArn,
              subscriptionType: 'SNS',
            },
          ],
        },
      ],
    });
  }
}
