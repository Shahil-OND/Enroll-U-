import json
import os
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
            
        # Parse body for final_json
        body_str = event.get("body")
        final_json = None
        if body_str:
            try:
                body_data = json.loads(body_str)
                if isinstance(body_data, dict):
                    if "final_json" in body_data:
                        final_json = body_data["final_json"]
                    else:
                        final_json = body_data
            except Exception as e:
                print(f"[WARN] Failed to parse request body as JSON: {e}")
                
        # If final_json is not provided in body, load it from existing document
        if not final_json:
            doc = database.get_document(document_id)
            if not doc:
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"error": f"Document {document_id} not found"}, ensure_ascii=False)
                }
            
            extracted_json_str = doc.get("extracted_json")
            if extracted_json_str:
                try:
                    final_json = json.loads(extracted_json_str)
                except Exception as e:
                    print(f"[WARN] Failed to parse extracted_json from database: {e}")
            
            if not final_json:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"error": "No valid final_json provided and no existing extraction result found"}, ensure_ascii=False)
                }
                
        # Approve the document with audit traceability
        user_info = database.extract_user_info(event)
        approver = user_info.get("email") or user_info.get("user_id")
        result = database.approve_document(document_id, final_json, approved_by=approver)
        
        # Invoke downstream MySQL Writer Lambda asynchronously
        import boto3
        mysql_writer_invoked = False
        mysql_writer_warning = None
        try:
            lambda_client = boto3.client("lambda")
            payload = dict(final_json)
            payload["document_id"] = document_id
            function_name = os.environ.get("MYSQL_WRITER_FUNCTION_NAME", "EnrollU-MySqlWriter")

            lambda_client.invoke(
                FunctionName=function_name,
                InvocationType="Event",
                Payload=json.dumps(payload, ensure_ascii=False)
            )
            mysql_writer_invoked = True
            print(f"[SUCCESS] Invoked {function_name} for document_id: {document_id}")
        except Exception as e:
            mysql_writer_warning = f"MySQL write not triggered: {e}"
            print(f"[ERROR] Failed to invoke MySqlWriter Lambda: {e}")
            
        response_body = result if isinstance(result, dict) else {}
        response_body["mysql_writer_invoked"] = mysql_writer_invoked
        if mysql_writer_warning:
            response_body["mysql_writer_warning"] = mysql_writer_warning

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(response_body, ensure_ascii=False)
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to approve document: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
