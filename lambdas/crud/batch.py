"""
batch.py — Handles Batch Creation, Presigned S3 Upload URLs,
Batch Execution Start, and Batch Progress Status API (DPI Requirements).

Endpoints handled:
- POST /batches
- POST /batches/{batchId}/start
- GET  /batches/{batchId}
"""
import json
import os
import uuid
import boto3
from datetime import datetime
import database

try:
    from config import AWS_REGION, ALLOWED_EXTENSIONS
except ImportError:
    AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")
    ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"}


def _cors_headers():
    return {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    }


def _detect_content_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower() if filename else ""
    if ext == ".pdf":
        return "application/pdf"
    elif ext == ".csv":
        return "text/csv"
    elif ext in [".xlsx", ".xls"]:
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif ext in [".docx", ".doc"]:
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif ext in [".png", ".jpg", ".jpeg"]:
        return f"image/{ext.replace('.', '')}"
    elif ext == ".txt":
        return "text/plain"
    return "application/octet-stream"


def handler(event, context):
    print(f"Received batch event: {event}")
    http_method = event.get("httpMethod") or "GET"
    path = event.get("path") or ""
    path_params = event.get("pathParameters") or {}
    batch_id = path_params.get("batchId")

    headers = _cors_headers()

    if http_method == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        # Route 1: POST /batches — Create batch & generate presigned URLs
        if http_method == "POST" and (not batch_id or path.endswith("/batches")):
            return handle_create_batch(event, headers)

        # Route 2: POST /batches/{batchId}/start — Start EnrollUBatchWorkflow
        elif http_method == "POST" and (path.endswith("/start") or "start" in path):
            if not batch_id:
                return {
                    "statusCode": 400,
                    "headers": headers,
                    "body": json.dumps({"error": "Missing batchId parameter"}, ensure_ascii=False)
                }
            return handle_start_batch(batch_id, event, headers)

        # Route 3: GET /batches/{batchId} — Batch Progress API
        elif http_method == "GET" and batch_id:
            return handle_get_batch_progress(batch_id, headers)

        else:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"error": f"Route not found: {http_method} {path}"}, ensure_ascii=False)
            }

    except Exception as e:
        print(f"[ERROR] Batch handler failed: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}, ensure_ascii=False)
        }


# ─────────────────────────────────────────────────────────────────────────────
# 1. Create Batch (POST /batches)
# ─────────────────────────────────────────────────────────────────────────────
def handle_create_batch(event, headers):
    body_str = event.get("body") or "{}"
    try:
        body = json.loads(body_str) if isinstance(body_str, str) else body_str
    except Exception as e:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": f"Invalid JSON payload: {e}"}, ensure_ascii=False)
        }

    files = body.get("files") or []
    if not isinstance(files, list) or len(files) == 0:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": "Request must include 'files' array with at least 1 document"}, ensure_ascii=False)
        }

    bucket = os.environ.get("INGEST_BUCKET_NAME")
    if not bucket:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "INGEST_BUCKET_NAME environment variable not configured"}, ensure_ascii=False)
        }

    batch_id = str(uuid.uuid4())
    s3_client = boto3.client("s3", region_name=AWS_REGION)

    documents_res = []
    groups_map = {}
    standalone_count = 0

    for idx, f in enumerate(files):
        filename = f.get("filename") or f"file_{idx+1}.pdf"
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({
                    "error": f"File '{filename}' has invalid extension. Allowed: {sorted(list(ALLOWED_EXTENSIONS))}"
                }, ensure_ascii=False)
            }

        doc_id = str(uuid.uuid4())
        processing_mode = f.get("processingMode") or f.get("processing_mode") or "standalone"
        group_id = f.get("groupId") or f.get("group_id")
        inst_name = f.get("institutionName") or f.get("institution_name")

        if processing_mode == "grouped":
            if not group_id and inst_name:
                # Deterministic or new group ID per institution name
                slug = "".join(c if c.isalnum() else "_" for c in inst_name.lower())[:32]
                group_id = f"grp_{slug}_{batch_id[:8]}"
            elif not group_id:
                group_id = f"grp_{batch_id[:8]}"

            if group_id not in groups_map:
                groups_map[group_id] = {
                    "groupId": group_id,
                    "institutionName": inst_name or "Unknown Institution",
                    "documents": []
                }
            groups_map[group_id]["documents"].append(doc_id)
        else:
            processing_mode = "standalone"
            group_id = None
            standalone_count += 1

        s3_key = f"batches/{batch_id}/{doc_id}/{filename}"
        content_type = f.get("contentType") or _detect_content_type(filename)

        # Generate S3 presigned PUT URL
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": s3_key,
                "ContentType": content_type,
            },
            ExpiresIn=900  # 15 minutes
        )

        doc_type = ext.replace(".", "")
        file_path = f"s3://{bucket}/{s3_key}"

        # Register document in DynamoDB staging table
        database.create_staging_record(
            document_id=doc_id,
            filename=filename,
            file_path=file_path,
            doc_type=doc_type,
            s3_key=s3_key,
            batch_id=batch_id,
            group_id=group_id,
            processing_mode=processing_mode,
            institution_name=inst_name
        )

        documents_res.append({
            "documentId": doc_id,
            "filename": filename,
            "s3Key": s3_key,
            "uploadUrl": presigned_url,
            "contentType": content_type,
            "processingMode": processing_mode,
            "groupId": group_id,
            "institutionName": inst_name,
        })

    # Register top-level batch record
    database.create_batch_record(
        batch_id=batch_id,
        total_documents=len(files),
        standalone_count=standalone_count,
        groups_count=len(groups_map),
        groups_info=groups_map,
        metadata={"created_via": "batch_api"}
    )

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps({
            "batchId": batch_id,
            "totalDocuments": len(documents_res),
            "standaloneCount": standalone_count,
            "groupsCount": len(groups_map),
            "groups": list(groups_map.values()),
            "documents": documents_res,
            "message": f"Batch {batch_id} created successfully with {len(documents_res)} presigned upload URLs."
        }, ensure_ascii=False)
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Start Batch Execution (POST /batches/{batchId}/start)
# ─────────────────────────────────────────────────────────────────────────────
def handle_start_batch(batch_id: str, event, headers):
    batch_record = database.get_batch_record(batch_id)
    if not batch_record:
        return {
            "statusCode": 404,
            "headers": headers,
            "body": json.dumps({"error": f"Batch {batch_id} not found"}, ensure_ascii=False)
        }

    # Fetch all documents registered under this batch
    docs = database.get_documents_by_batch(batch_id)
    if not docs:
        return {
            "statusCode": 400,
            "headers": headers,
            "body": json.dumps({"error": f"No documents found registered for batch {batch_id}"}, ensure_ascii=False)
        }

    sfn_arn = os.environ.get("STEP_FUNCTIONS_BATCH_ARN") or os.environ.get("STEP_FUNCTIONS_ARN")
    if not sfn_arn:
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": "Step Functions ARN not configured in environment"}, ensure_ascii=False)
        }

    bucket = os.environ.get("INGEST_BUCKET_NAME")

    # Format input documents for Step Functions state machine
    input_documents = []
    groups_dict = {}

    for d in docs:
        doc_id = d.get("documentId") or d.get("document_id")
        s3_key = d.get("s3_key") or ""
        mode = d.get("processing_mode") or "standalone"
        gid = d.get("groupId") or d.get("group_id")
        inst_name = d.get("institutionName") or d.get("institution_name")

        doc_item = {
            "document_id": doc_id,
            "documentId": doc_id,
            "bucket": bucket,
            "key": s3_key,
            "filename": d.get("filename") or "document",
            "processing_mode": mode,
            "processingMode": mode,
            "group_id": gid,
            "groupId": gid,
            "institution_name": inst_name,
            "institutionName": inst_name,
            "batch_id": batch_id,
            "batchId": batch_id,
        }
        input_documents.append(doc_item)

        if mode == "grouped" and gid:
            if gid not in groups_dict:
                groups_dict[gid] = {
                    "group_id": gid,
                    "institution_name": inst_name,
                    "documents": []
                }
            groups_dict[gid]["documents"].append(doc_item)

    execution_input = {
        "batch_id": batch_id,
        "batchId": batch_id,
        "documents": input_documents,
        "groups": list(groups_dict.values()),
        "max_concurrency": 3,
    }

    sfn_client = boto3.client("stepfunctions", region_name=AWS_REGION)
    execution_name = f"batch_{batch_id}_{int(datetime.utcnow().timestamp())}"[:80]

    sfn_res = sfn_client.start_execution(
        stateMachineArn=sfn_arn,
        name=execution_name,
        input=json.dumps(execution_input)
    )
    execution_arn = sfn_res.get("executionArn")

    # Update batch status in DynamoDB
    database.update_batch_status(
        batch_id=batch_id,
        status="processing",
        execution_arn=execution_arn
    )

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps({
            "batchId": batch_id,
            "status": "processing",
            "executionArn": execution_arn,
            "totalDocuments": len(input_documents),
            "groupsCount": len(groups_dict),
            "message": f"Batch workflow started successfully for batch {batch_id}."
        }, ensure_ascii=False)
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Batch Progress Status API (GET /batches/{batchId})
# ─────────────────────────────────────────────────────────────────────────────
def handle_get_batch_progress(batch_id: str, headers):
    batch_record = database.get_batch_record(batch_id)
    if not batch_record:
        return {
            "statusCode": 404,
            "headers": headers,
            "body": json.dumps({"error": f"Batch {batch_id} not found"}, ensure_ascii=False)
        }

    docs = database.get_documents_by_batch(batch_id)

    total_docs = len(docs)
    completed_docs = 0
    processing_docs = 0
    failed_docs = 0

    standalone_list = []
    groups_dict = {}

    for d in docs:
        doc_id = d.get("documentId") or d.get("document_id")
        status = d.get("status") or "processing"
        mode = d.get("processing_mode") or "standalone"
        gid = d.get("groupId") or d.get("group_id")
        inst = d.get("institutionName") or d.get("institution_name")
        filename = d.get("filename") or "document"
        conf = d.get("confidence_score")

        if status in ["pending_review", "partial", "approved"]:
            completed_docs += 1
        elif status == "failed":
            failed_docs += 1
        else:
            processing_docs += 1

        doc_summary = {
            "documentId": doc_id,
            "filename": filename,
            "status": status,
            "confidenceScore": float(conf) if conf is not None else None,
            "errorMessage": d.get("error_message"),
        }

        if mode == "grouped" and gid:
            if gid not in groups_dict:
                groups_dict[gid] = {
                    "groupId": gid,
                    "institutionName": inst or "Unknown Institution",
                    "status": "processing",
                    "documents": [],
                    "consolidatedDocumentId": None,
                }
            groups_dict[gid]["documents"].append(doc_summary)
        else:
            standalone_list.append(doc_summary)

    # Check for consolidated records created for groups in this batch
    all_table_items = database.list_documents()
    for item in all_table_items:
        if item.get("is_consolidated") and (item.get("batchId") == batch_id or item.get("batch_id") == batch_id):
            item_gid = item.get("groupId") or item.get("group_id")
            if item_gid in groups_dict:
                groups_dict[item_gid]["consolidatedDocumentId"] = item.get("documentId")
                groups_dict[item_gid]["status"] = item.get("status", "pending_review")

    # Evaluate group status based on constituent documents & consolidation
    consolidation_statuses = []
    for gid, g_info in groups_dict.items():
        if g_info.get("consolidatedDocumentId"):
            g_info["status"] = "consolidated"
            consolidation_statuses.append("completed")
        else:
            g_statuses = [d["status"] for d in g_info["documents"]]
            if any(s == "failed" for s in g_statuses):
                g_info["status"] = "partial_with_errors"
                consolidation_statuses.append("failed")
            elif all(s == "partial" for s in g_statuses):
                g_info["status"] = "ready_for_consolidation"
                consolidation_statuses.append("pending")
            else:
                g_info["status"] = "processing"
                consolidation_statuses.append("processing")

    overall_consolidation_status = "not_applicable"
    if groups_dict:
        if all(s == "completed" for s in consolidation_statuses):
            overall_consolidation_status = "completed"
        elif any(s == "processing" for s in consolidation_statuses):
            overall_consolidation_status = "processing"
        elif any(s == "failed" for s in consolidation_statuses):
            overall_consolidation_status = "completed_with_errors"
        else:
            overall_consolidation_status = "pending"

    # Compute overall batch status
    if processing_docs > 0 or (groups_dict and overall_consolidation_status in ["processing", "pending"]):
        overall_status = "processing"
    elif failed_docs > 0:
        overall_status = "completed_with_errors" if completed_docs > 0 else "failed"
    else:
        overall_status = "completed"

    # Sync back to batch record
    database.update_batch_status(batch_id, overall_status)

    return {
        "statusCode": 200,
        "headers": headers,
        "body": json.dumps({
            "batchId": batch_id,
            "overallBatchStatus": overall_status,
            "totalDocuments": total_docs,
            "completedDocuments": completed_docs,
            "processingDocuments": processing_docs,
            "failedDocuments": failed_docs,
            "standaloneProcessingStatus": "completed" if all(d["status"] in ["pending_review", "approved", "failed"] for d in standalone_list) else "processing",
            "standaloneDocuments": standalone_list,
            "institutionGroups": list(groups_dict.values()),
            "consolidationStatus": overall_consolidation_status,
        }, ensure_ascii=False)
    }

