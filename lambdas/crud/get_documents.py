import json
import os
import database

try:
    from config import AWS_REGION
except ImportError:
    AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")

from decimal import Decimal

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj) if obj % 1 else int(obj)
        return super().default(obj)

def handler(event, context):
    print(f"Received event: {event}")
    
    # Enable CORS headers in response
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
    }
    
    try:
        path = event.get("path") or ""
        path_params = event.get("pathParameters") or {}
        document_id = path_params.get("documentId")
        
        # Check if requesting the raw file content redirect
        if document_id and path.endswith("/file"):
            doc = database.get_document(document_id)
            if not doc:
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"error": f"Document {document_id} not found"}, ensure_ascii=False)
                }
            
            s3_key = doc.get("s3_key")
            if not s3_key and doc.get("original_file_path"):
                orig_path = doc.get("original_file_path")
                if orig_path.startswith("s3://"):
                    s3_path = orig_path[5:]
                    parts = s3_path.split("/", 1)
                    if len(parts) == 2:
                        s3_key = parts[1]
                        
            bucket_name = os.environ.get("INGEST_BUCKET_NAME")
            if not bucket_name and doc.get("original_file_path"):
                orig_path = doc.get("original_file_path")
                if orig_path.startswith("s3://"):
                    s3_path = orig_path[5:]
                    parts = s3_path.split("/", 1)
                    bucket_name = parts[0]
                    
            if not bucket_name or not s3_key:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"error": f"S3 file details not found for document {document_id}"}, ensure_ascii=False)
                }

            import boto3
            s3_client = boto3.client("s3", region_name=AWS_REGION)
            
            try:
                # Determine content type based on file extension from filename, s3_key, or original_file_path
                file_check = (doc.get("filename") or s3_key or doc.get("original_file_path") or "").lower()

                content_type = "application/octet-stream"
                if file_check.endswith(".pdf"):
                    content_type = "application/pdf"
                elif file_check.endswith(".csv"):
                    content_type = "text/csv"
                elif file_check.endswith((".xlsx", ".xls")):
                    content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                elif file_check.endswith((".docx", ".doc")):
                    content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                elif file_check.endswith(".txt"):
                    content_type = "text/plain"
                elif file_check.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
                    content_type = f"image/{file_check.split('.')[-1]}"

                query_params = event.get("queryStringParameters") or {}
                is_download = query_params.get("download") == "true" or path.endswith("/download")
                orig_filename = doc.get("filename") or os.path.basename(s3_key)

                # Non-PDF binary files (docx, xlsx) should default to attachment disposition on direct GET
                disposition = f'attachment; filename="{orig_filename}"' if (is_download or not file_check.endswith(".pdf")) else 'inline'

                presigned_url = s3_client.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': bucket_name, 
                        'Key': s3_key,
                        'ResponseContentType': content_type,
                        'ResponseContentDisposition': disposition
                    },
                    ExpiresIn=3600
                )
                print(f"[SUCCESS] Generated S3 presigned URL for key: {s3_key} (type: {content_type}, disposition: {disposition})")
                return {
                    "statusCode": 302,
                    "headers": {
                        "Location": presigned_url,
                        "Access-Control-Allow-Origin": "*"
                    },
                    "body": ""
                }
            except Exception as e:
                print(f"[ERROR] Failed to generate S3 presigned URL: {e}")
                return {
                    "statusCode": 500,
                    "headers": headers,
                    "body": json.dumps({"error": f"Failed to generate secure URL: {str(e)}"}, ensure_ascii=False)
                }

        query_params = event.get("queryStringParameters") or {}
        
        # 1. Get dashboard stats
        if query_params.get("stats") == "true":
            stats = database.get_dashboard_stats()
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(stats, ensure_ascii=False, cls=DecimalEncoder)
            }
            
        # 2. Get a single document by document_id
        document_id = query_params.get("document_id") or query_params.get("id")
        if document_id:
            doc = database.get_document(document_id)
            if not doc:
                return {
                    "statusCode": 404,
                    "headers": headers,
                    "body": json.dumps({"error": f"Document {document_id} not found"}, ensure_ascii=False)
                }
            return {
                "statusCode": 200,
                "headers": headers,
                "body": json.dumps(doc, ensure_ascii=False, cls=DecimalEncoder)
            }
            
        # 3. List documents (optionally filtered by status)
        status = query_params.get("status")
        docs = database.list_documents(status=status)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(docs, ensure_ascii=False, cls=DecimalEncoder)
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to retrieve documents: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
