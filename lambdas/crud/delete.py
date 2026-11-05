import json
import database

def handler(event, context):
    print(f"Received delete event: {event}")
    
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "DELETE,OPTIONS"
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
            
        # Delete document record from DynamoDB (S3 object preserved)
        database.delete_document(document_id)
        
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "document_id": document_id,
                "status": "deleted",
                "message": "Document record deleted from staging"
            }, ensure_ascii=False)
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to delete document: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
