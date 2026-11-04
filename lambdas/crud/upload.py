import json
import uuid
import os
import boto3
import database

try:
    from config import ALLOWED_EXTENSIONS
except ImportError:
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "layers" / "common"))
    from config import ALLOWED_EXTENSIONS

def handler(event, context):
    print(f"Received event: {event}")

    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
    }

    try:
        body = event.get("body")
        is_base64 = event.get("isBase64Encoded", False)

        if not body:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "No file body received"}, ensure_ascii=False)
            }

        headers_dict = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
        content_type = headers_dict.get("content-type", "")

        document_id = str(uuid.uuid4())
        filename = None
        doc_type = "unknown"
        file_bytes = None

        user_info = database.extract_user_info(event)
        uploader = user_info.get("email") or user_info.get("user_id")

        if "application/json" in content_type:
            try:
                import base64
                decoded_body = base64.b64decode(body).decode("utf-8") if is_base64 else body
                json_data = json.loads(decoded_body)
                if isinstance(json_data, dict):
                    # ── Bulk Batch Payload Handling ─────────────────────────
                    if json_data.get("batch") is True and isinstance(json_data.get("files"), list):
                        files_list = json_data["files"]
                        bucket = os.environ.get("INGEST_BUCKET_NAME")
                        if not bucket:
                            return {
                                "statusCode": 500,
                                "headers": headers,
                                "body": json.dumps({"error": "INGEST_BUCKET_NAME environment variable not set"}, ensure_ascii=False)
                            }
                        
                        s3 = boto3.client("s3")
                        documents_batch = []

                        for file_item in files_list:
                            fname = file_item.get("filename") or "uploaded_file"
                            b64_content = file_item.get("base64") or file_item.get("content") or ""
                            file_doc_id = str(uuid.uuid4())
                            
                            f_ext = os.path.splitext(fname)[1].lower() if fname else ""
                            if f_ext not in ALLOWED_EXTENSIONS:
                                print(f"[WARN] Skipping file with disallowed extension: {fname}")
                                continue
                            
                            f_doc_type = f_ext.replace(".", "") if f_ext else "unknown"
                            f_bytes = base64.b64decode(b64_content) if b64_content else b""
                            
                            s3_key = f"uploads/{file_doc_id}/{fname}"
                            
                            s3_content_type = "application/octet-stream"
                            if f_doc_type == "pdf":
                                s3_content_type = "application/pdf"
                            elif f_doc_type == "csv":
                                s3_content_type = "text/csv"
                            elif f_doc_type == "xlsx":
                                s3_content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            elif f_doc_type in ["docx", "doc"]:
                                s3_content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                            elif f_doc_type == "txt":
                                s3_content_type = "text/plain"

                            s3.put_object(
                                Bucket=bucket,
                                Key=s3_key,
                                Body=f_bytes,
                                ContentType=s3_content_type,
                            )
                            
                            database.create_staging_record(
                                document_id=file_doc_id,
                                filename=fname,
                                file_path=f"s3://{bucket}/{s3_key}",
                                doc_type=f_doc_type,
                                s3_key=s3_key,
                                uploaded_by=uploader,
                            )
                            
                            documents_batch.append({
                                "bucket": bucket,
                                "key": s3_key,
                                "document_id": file_doc_id,
                                "filename": fname,
                                "file_path": f"s3://{bucket}/{s3_key}",
                                "extraction_method": f_doc_type
                            })

                        # Trigger Step Functions execution with batch documents array
                        sfn_arn = os.environ.get("STEP_FUNCTIONS_ARN")
                        if sfn_arn and documents_batch:
                            try:
                                sfn_client = boto3.client("stepfunctions")
                                sfn_client.start_execution(
                                    stateMachineArn=sfn_arn,
                                    input=json.dumps({"documents": documents_batch})
                                )
                                print(f"[SUCCESS] Triggered Step Functions batch execution for {len(documents_batch)} documents.")
                            except Exception as sfn_err:
                                print(f"[WARN] Failed to trigger Step Functions batch execution: {sfn_err}")

                        return {
                            "statusCode": 200,
                            "headers": headers,
                            "body": json.dumps({
                                "batch": True,
                                "count": len(documents_batch),
                                "documents": documents_batch,
                                "message": f"Bulk upload successful. {len(documents_batch)} documents queued."
                            }, ensure_ascii=False)
                        }

                    elif "text" in json_data:
                        file_bytes = json_data["text"].encode("utf-8")
                        filename = "pasted_text.txt"
                        doc_type = "txt"
            except Exception as e:
                print(f"[WARN] Failed to parse JSON payload: {e}")

        # ── Single File Raw Binary Fallback ──────────────────────────────────
        if file_bytes is None:
            import base64
            file_bytes = base64.b64decode(body) if is_base64 else body.encode("utf-8")

            query_params = event.get("queryStringParameters") or {}
            filename = query_params.get("filename") or query_params.get("fileName")
            
            if not filename:
                if "application/pdf" in content_type:
                    filename = f"{document_id}.pdf"
                elif "text/csv" in content_type:
                    filename = f"{document_id}.csv"
                elif "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in content_type:
                    filename = f"{document_id}.xlsx"
                elif "text/plain" in content_type:
                    filename = f"{document_id}.txt"
                elif "image/png" in content_type:
                    filename = f"{document_id}.png"
                elif "image/jpeg" in content_type or "image/jpg" in content_type:
                    filename = f"{document_id}.jpg"
                elif "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in content_type:
                    filename = f"{document_id}.docx"
                else:
                    return {
                        "statusCode": 400,
                        "headers": headers,
                        "body": json.dumps({
                            "error": "Cannot determine file type. Please provide a filename parameter or use a supported Content-Type."
                        }, ensure_ascii=False)
                    }

        # Validate extension
        ext = os.path.splitext(filename)[1].lower() if filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": f"File extension '{ext}' is not allowed. Allowed extensions: {sorted(list(ALLOWED_EXTENSIONS))}"}, ensure_ascii=False)
            }
        doc_type = ext.replace(".", "") if ext else "unknown"

        s3_key = f"uploads/{document_id}/{filename}"

        s3 = boto3.client("s3")
        bucket = os.environ.get("INGEST_BUCKET_NAME")

        if not bucket:
            return {
                "statusCode": 500,
                "headers": headers,
                "body": json.dumps({"error": "INGEST_BUCKET_NAME environment variable not set"}, ensure_ascii=False)
            }

        s3_content_type = "application/octet-stream"
        if doc_type == "pdf":
            s3_content_type = "application/pdf"
        elif doc_type == "csv":
            s3_content_type = "text/csv"
        elif doc_type == "xlsx":
            s3_content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        elif doc_type in ["docx", "doc"]:
            s3_content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        elif doc_type == "txt":
            s3_content_type = "text/plain"

        s3.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=file_bytes,
            ContentType=s3_content_type,
        )
        print(f"[SUCCESS] Uploaded single file to s3://{bucket}/{s3_key}")

        database.create_staging_record(
            document_id=document_id,
            filename=filename,
            file_path=f"s3://{bucket}/{s3_key}",
            doc_type=doc_type,
            s3_key=s3_key,
            uploaded_by=uploader,
        )

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "document_id": document_id,
                "filename": filename,
                "s3_key": s3_key,
                "status": "processing",
                "message": "Document uploaded successfully"
            }, ensure_ascii=False)
        }

    except Exception as e:
        print(f"[ERROR] Failed to upload document: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }
