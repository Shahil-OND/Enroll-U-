import json
import database

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
            
        # Parse body for reason
        body_str = event.get("body")
        reason = "Rejected by operator"
        if body_str:
            try:
                body_data = json.loads(body_str)
                if isinstance(body_data, dict):
                    reason = body_data.get("reason", reason)
                elif isinstance(body_data, str):
                    reason = body_data
            except Exception as e:
                # If not a JSON string, fallback to using raw body string if it exists
                reason = body_str.strip() or reason
                
        # Reject the document
        database.reject_document(document_id, reason)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "document_id": document_id,
                "status": "rejected",
                "reason": reason
            }, ensure_ascii=False)
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to reject document: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
