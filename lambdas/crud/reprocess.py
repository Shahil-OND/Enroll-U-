import json
import os
import boto3
from datetime import datetime
import database

sfn_client = boto3.client("stepfunctions")

def handler(event, context):
    print(f"Received event: {event}")
    
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
    }
    
    try:
        path_params = event.get("pathParameters") or {}
        document_id = path_params.get("documentId")
        
        if not document_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Missing documentId in path parameters"}, ensure_ascii=False)
            }
            
        # Retrieve the document details
        doc = database.get_document(document_id)
        if not doc:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"error": f"Document {document_id} not found"}, ensure_ascii=False)
            }
            
        # Determine bucket and key
        bucket_name = os.environ.get("INGEST_BUCKET_NAME")
        s3_key = doc.get("s3_key")
        
        original_path = doc.get("original_file_path", "")
        if original_path.startswith("s3://"):
            parts = original_path.replace("s3://", "").split("/", 1)
            if len(parts) > 1:
                if not bucket_name:
                    bucket_name = parts[0]
                if not s3_key:
                    s3_key = parts[1]
        elif not s3_key:
            s3_key = original_path
            
        if not bucket_name or not s3_key:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Unable to determine S3 bucket or key for reprocessing"}, ensure_ascii=False)
            }
            
        # Issue 4: Read ARN directly from env — no slow list_state_machines() API call
        state_machine_arn = os.environ.get("STEP_FUNCTIONS_ARN")
        if not state_machine_arn:
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"error": "STEP_FUNCTIONS_ARN environment variable not configured"}, ensure_ascii=False)
            }
            
        # Update staging status to processing
        database.update_staging_status(document_id, "processing")
        
        # Trigger the state machine execution
        execution_name = f"{document_id}_{int(datetime.utcnow().timestamp() * 1000)}"
        execution_input = {
            "bucket": bucket_name,
            "key": s3_key,
            "document_id": document_id
        }
        
        sfn_response = sfn_client.start_execution(
            stateMachineArn=state_machine_arn,
            name=execution_name,
            input=json.dumps(execution_input)
        )
        
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "document_id": document_id,
                "status": "processing",
                "execution_arn": sfn_response.get("executionArn"),
                "message": "Reprocessing started successfully"
            }, ensure_ascii=False)
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to reprocess document: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
