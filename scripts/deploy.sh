#!/usr/bin/env bash

set -e

# 1. Run the lambda builder
echo "Building and packaging Lambda functions..."
bash "$(dirname "$0")/build_lambdas.sh"

# 2. Compile TypeScript stack code
echo "Compiling CDK TypeScript code..."
npm run build

# 3. Deploy CDK stacks
echo "Deploying CDK stacks..."
npx cdk deploy --all
