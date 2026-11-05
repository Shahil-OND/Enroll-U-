import json
import database

def handler(event, context):
    print(f"Received event: {event}")

    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "PATCH,OPTIONS"
    }

    try:
        # Get document ID from path
        path_params = event.get("pathParameters") or {}
        document_id = path_params.get("documentId")

        if not document_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Missing documentId in path parameters"}, ensure_ascii=False)
            }

        # Parse updated JSON from request body
        body_str = event.get("body")
        if not body_str:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Missing request body"}, ensure_ascii=False)
            }

        try:
            updated_json = json.loads(body_str)
        except Exception as e:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": f"Invalid JSON in request body: {e}"}, ensure_ascii=False)
            }

        if not isinstance(updated_json, dict):
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "Request body must be a JSON object"}, ensure_ascii=False)
            }

        # Verify document exists before updating
        doc = database.get_document(document_id)
        if not doc:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"error": f"Document {document_id} not found"}, ensure_ascii=False)
            }

        # Only allow edits on pending_review or rejected documents
        current_status = doc.get("status")
        if current_status not in ("pending_review", "rejected"):
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({
                    "error": f"Document is in status '{current_status}' — only pending_review or rejected documents can be edited"
                }, ensure_ascii=False)
            }

        # Save operator edits to DynamoDB
        database.update_extracted_json(document_id, updated_json)
        print(f"[SUCCESS] Updated extracted_json for document_id: {document_id}")

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "document_id": document_id,
                "status": "saved",
                "message": "Extracted JSON updated successfully"
            }, ensure_ascii=False)
        }

    except Exception as e:
        print(f"[ERROR] Failed to update document JSON: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
