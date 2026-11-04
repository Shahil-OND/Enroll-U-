Enroll-U Document Intelligence Pipeline

Overview

Enroll-U is a serverless, AWS-native document intelligence pipeline for extracting, validating, reviewing, and storing academic institution data.

The solution ingests academic institution brochures in PDF, DOCX, XLSX, CSV, and TXT formats. It extracts text using native document parsing or OCR, converts the extracted content into a standardized JSON structure using Amazon Bedrock Nova Pro, validates the result, and provides an operator review workflow before approved records are written to the production MySQL database.

The infrastructure is managed using AWS CDK with TypeScript.

Architecture

                         ┌─────────────────────┐
                         │   Operator Browser   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Amazon CloudFront    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Frontend S3 Bucket   │
                         │    React Application │
                         └──────────┬──────────┘
                                    │
                              REST API
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Amazon API Gateway │
                         └──────────┬──────────┘
                                    │
                       ┌────────────┴────────────┐
                       │                         │
                       ▼                         ▼
              ┌─────────────────┐       ┌──────────────────┐
              │  Upload Lambda  │       │ Review / CRUD    │
              │ EnrollU-Upload  │       │    Lambdas       │
              └────────┬────────┘       └────────┬─────────┘
                       │                         │
                       ▼                         │
              ┌─────────────────┐                │
              │ S3 Ingest Bucket│                │
              │ uploads/{id}/   │                │
              └────────┬────────┘                │
                       │                         │
                Object Created                  │
                       │                         │
                       ▼                         │
              ┌─────────────────┐                │
              │ Amazon          │                │
              │ EventBridge     │                │
              └────────┬────────┘                │
                       │                         │
                       ▼                         │
              ┌─────────────────────────────┐    │
              │ AWS Step Functions          │    │
              │     EnrollUWorkflow         │    │
              └────────────┬────────────────┘    │
                           │                     │
                    ┌──────┼──────┐              │
                    ▼      ▼      ▼              │
                 Extract Normalize Validate      │
                  Lambda  Lambda    Lambda        │
                    │       │        │            │
                    │       │        ▼            │
                    │       │   ┌─────────────┐   │
                    │       │   │  DynamoDB   │◄──┘
                    │       │   │EnrollUStaging│
                    │       │   └──────┬──────┘
                    │       │          │
                    │       │    Manual Review
                    │       │          │
                    │       ▼          ▼
                    │  Amazon Bedrock  Approve
                    │    Nova Pro        │
                    │                   ▼
                    │             Approve Lambda
                    │                   │
                    ▼                   ▼
              Amazon Textract    MySQL Writer Lambda
                                      │
                                      ▼
                              Production MySQL

End-to-End Processing Workflow

The operator uploads an academic document through the React application.

The Upload Lambda stores the document in the S3 ingest bucket.

Amazon EventBridge detects the S3 Object Created event.

EventBridge starts the EnrollUWorkflow Step Functions state machine.

Step Functions executes:

Extract

Normalize

Validate

The Validate Lambda stores the processed document in DynamoDB with a pending_review status.

The operator reviews the extracted information through the frontend.

The operator can edit, approve, reject, reprocess, or translate content.

When approved, API Gateway invokes the Approve Lambda.

The Approve Lambda invokes the MySQL Writer Lambda.

The MySQL Writer retrieves database credentials from AWS Secrets Manager.

The MySQL Writer securely connects to the production MySQL database.

Approved academic institution, campus, and program data is inserted into MySQL.

Only approved documents are written to MySQL. Pending and rejected documents remain in DynamoDB.

Supported Document Extraction

The Extract Lambda selects the extraction method based on the uploaded file type.

File Type

Extraction Method

Digital PDF

PyMuPDF

Scanned PDF

Amazon Textract asynchronously

DOCX

python-docx

XLSX

openpyxl

CSV

Direct parsing

TXT

Direct reading

Amazon Textract is used when native text extraction is insufficient, reducing unnecessary OCR processing for digitally generated documents.

Amazon Bedrock Integration

Amazon Bedrock is responsible for converting unstructured extracted text into structured JSON.

The Normalize Lambda:

Receives extracted text from the Extract Lambda.

Builds a prompt using the project prompt builder.

Sends the prompt to Amazon Bedrock Nova Pro.

Receives the model response.

Parses the JSON output.

Returns the normalized document to the Step Functions workflow.

The normalized JSON follows the application's predefined schema before validation and storage.

Human Review

The React operator dashboard provides a review workflow.

Upload Page

Upload academic brochures.

Submit pasted document content.

Display upload status.

Review Page

Retrieve pending-review documents.

Display extracted JSON.

Edit extracted fields.

Approve documents.

Reject documents.

Reprocess failed documents.

Translate extracted content.

The frontend communicates with the backend exclusively through Amazon API Gateway.

DynamoDB

The EnrollUStaging DynamoDB table stores documents awaiting manual review.

Records contain:

Document ID

Processing status

Extracted text

Normalized JSON

Validation results

Confidence score

Review metadata

Original S3 object location

Review States

Pending Review
      │
      ├── Approve ──► MySQL Writer ──► Production MySQL
      │
      └── Reject

The table uses PAY_PER_REQUEST billing and Point-in-Time Recovery.

Amazon S3

The solution uses two S3 buckets.

Ingest Bucket

Used to:

Store uploaded source documents.

Provide input documents for the processing pipeline.

Trigger EventBridge notifications.

Features:

Versioning enabled

EventBridge notifications enabled

SSL enforced

Bucket Owner Enforced

S3-managed encryption

Auto-delete objects enabled for the POC environment

Documents are stored under:

uploads/{documentId}/{filename}

Frontend Bucket

Hosts the compiled React application and serves static website assets through Amazon CloudFront.

Features:

Private bucket

CloudFront Origin Access Control (OAC)

Automated deployment through AWS CDK Bucket Deployment

API Gateway

The REST API exposes the following operations:

Method

Endpoint

Purpose

POST

/upload

Upload a document into the processing pipeline

POST

/paste

Submit pasted document text

GET

/documents

Retrieve processed documents

GET

/documents/{documentId}/file

Download the original uploaded file

POST

/documents/{documentId}/approve

Approve a reviewed document

POST

/documents/{documentId}/reject

Reject a reviewed document

POST

/documents/{documentId}/reprocess

Restart processing for a document

PATCH

/documents/{documentId}/json

Save reviewer modifications

POST

/translate

Translate extracted content

GET

/health

Health check

Lambda Functions

Function

Trigger

Responsibility

EnrollU-Upload

API Gateway

Receives uploaded files or pasted content and stores them in S3

EnrollU-Extract

Step Functions

Extracts text using document parsers or Textract

EnrollU-Normalize

Step Functions

Uses Bedrock Nova Pro to create standardized JSON

EnrollU-Validate

Step Functions

Validates JSON and stores the result in DynamoDB

EnrollU-GetDocuments

API Gateway

Retrieves document metadata and review information

EnrollU-UpdateJson

API Gateway

Saves reviewer edits

EnrollU-Approve

API Gateway

Approves a document and invokes MySQL Writer

EnrollU-Reject

API Gateway

Marks a document as rejected

EnrollU-Reprocess

API Gateway

Starts a new Step Functions execution

EnrollU-Translate

API Gateway

Translates document content

EnrollU-MySqlWriter

Lambda invocation

Writes approved academic program data to production MySQL

Step Functions

The EnrollUWorkflow state machine orchestrates the core document-processing pipeline.

Execution Order

Extract
   ↓
Normalize
   ↓
Validate
   ↓
Success

Failure Handling

Automatic retries for transient Lambda failures.

Exponential backoff.

Persistent failures transition to PipelineFailed.

Catch blocks direct failed executions to the failure state.

Configuration

Timeout: 900 seconds / 15 minutes

AWS X-Ray tracing enabled

CloudWatch execution logging enabled

Retry policy configured for Lambda service exceptions

Catch blocks configured for failure handling

MySQL Integration

Approved documents are written to the production MySQL database.

The integration sequence is:

Operator Approval
       ↓
API Gateway
       ↓
Approve Lambda
       ↓
MySQL Writer Lambda
       ↓
AWS Secrets Manager
       ↓
Secure MySQL Connection
       ↓
Production MySQL

The MySQL Writer:

Retrieves database credentials from AWS Secrets Manager.

Connects securely to the production MySQL database in the client environment.

Inserts academic institution, campus, and program data.

Sensitive database credentials are not stored in application source code.

AWS CDK Infrastructure

All infrastructure is deployed using AWS CDK into the account and region defined by:

CDK_DEFAULT_ACCOUNT
CDK_DEFAULT_REGION

CDK Stacks

Stack

Responsibility

NetworkingStack

VPC, two Availability Zones, public and isolated private subnets, and security group for MySQL Writer

S3Stack

Ingest bucket, versioning, EventBridge notifications, SSL enforcement and encryption

DynamoDBStack

EnrollUStaging DynamoDB table

SecretsStack

Application secret and MySQL credentials

IAMStack

Step Functions workflow IAM role, CloudWatch Logs and X-Ray permissions

LambdaStack

Python Lambda functions and shared Lambda layer

TextractStack

Amazon Textract permissions

BedrockStack

Amazon Bedrock Nova Pro inference-profile permissions

StepFunctionsStack

EnrollUWorkflow state machine

EventBridgeStack

S3 Object Created event rule

ApiGatewayStack

REST API, CORS, binary media support and X-Ray tracing

CloudFrontStack

CloudFront distribution, frontend S3 bucket and React deployment

DatabaseStack

MySQL Writer Lambda inside the VPC and its security group

MonitoringStack

CloudWatch log groups, dashboards and alarms

AccountStack

AWS Budget and SNS notification

Security

Implemented security controls include:

AWS Secrets Manager for application secrets and MySQL credentials.

IAM roles with service-specific permissions.

Amazon S3 Block Public Access.

SSL enforcement on S3 buckets.

S3-managed server-side encryption.

Bucket Owner Enforced object ownership.

Lambda execution roles.

VPC networking for MySQL connectivity.

Cross-account connectivity to the production database as described by the handover.

Sensitive database credentials are not stored in application source code.

Monitoring and Logging

Operational monitoring uses AWS-native services:

Amazon CloudWatch Logs

Amazon CloudWatch Metrics

CloudWatch Dashboards

CloudWatch Alarms

AWS X-Ray tracing

Step Functions execution history

These services provide visibility into:

Lambda execution

Workflow progress

API requests

Application health

Deployment

The solution is deployed using AWS CDK.

Deployment Steps

# 1. Install project dependencies

# 2. Build Lambda deployment packages

# 3. Build the React frontend

# 4. Bootstrap the AWS environment
#    First deployment only

# 5. Deploy the CDK stacks

The infrastructure is separated into multiple CDK stacks to support independent deployment and easier management of networking, storage, compute, security, monitoring, and application resources.

Repository Structure

bin/
├── CDK application entry point
└── Initializes and deploys infrastructure stacks

lib/
├── AWS CDK stacks
└── Infrastructure definitions

lambdas/
├── Python Lambda functions
└── Document processing and CRUD operations

layers/
└── Shared Lambda Layer
    ├── Common configuration
    └── Reusable utilities

frontend/
└── React application
    ├── Document upload
    ├── Document review
    └── Document approval

tests/
└── Unit tests for selected Lambda functionality

The repository separates infrastructure, backend services, frontend components, and shared libraries to simplify maintenance and future development.

Key Design Characteristics

Serverless architecture using AWS managed services.

Event-driven document processing.

Support for multiple document formats.

OCR for scanned/image-based documents.

Native extraction for digitally generated documents where possible.

AI-powered normalization using Amazon Bedrock Nova Pro.

Schema validation before manual review.

Human-in-the-loop approval.

Production database writes only after approval.

Secrets managed through AWS Secrets Manager.

VPC-based MySQL connectivity.

AWS-native monitoring and tracing.

Infrastructure as code using AWS CDK.

Modular infrastructure through independent CDK stacks.

Technology Stack

Layer

Technology

Frontend

React

API

Amazon API Gateway

Compute

AWS Lambda

Workflow

AWS Step Functions

Events

Amazon EventBridge

Object Storage

Amazon S3

Database / Staging

Amazon DynamoDB

OCR

Amazon Textract

LLM

Amazon Bedrock Nova Pro

Production Database

MySQL

Secrets

AWS Secrets Manager

CDN

Amazon CloudFront

Monitoring

Amazon CloudWatch

Tracing

AWS X-Ray

IAM

AWS IAM

Infrastructure as Code

AWS CDK / TypeScript

Lambda Runtime

Python 3.12

Conclusion

The Enroll-U Document Intelligence Pipeline provides an automated, serverless workflow for processing academic institution documents using AWS managed services.

The architecture separates document ingestion, extraction, normalization, validation, manual review, and production database updates into independent services. This provides a modular architecture while leveraging AWS-native capabilities throughout the processing pipeline.