"""
database.py — DynamoDB storage layer for EnrollU Document Intelligence Bridge.
All document staging and retrieval goes through DynamoDB.
"""
import os
import json
from datetime import datetime
import boto3

# ─────────────────────────────────────────────────────────────────────────────
# DynamoDB client (lazy singleton) — BUG-13 FIX: cache the Table object too
# ─────────────────────────────────────────────────────────────────────────────
_dynamodb = None
_dynamo_table = None  # BUG-13: cache Table, not just the resource


def _get_dynamo_table():
    global _dynamodb, _dynamo_table
    table_name = os.environ.get("STAGING_TABLE_NAME", "EnrollUStaging")
    # BUG-13: only re-create if the resource or table name changed
    if _dynamo_table is None:
        if _dynamodb is None:
            region = os.environ.get("AWS_REGION")
            _dynamodb = boto3.resource("dynamodb", region_name=region) if region else boto3.resource("dynamodb")
        _dynamo_table = _dynamodb.Table(table_name)
    return _dynamo_table


# ─────────────────────────────────────────────────────────────────────────────
# Startup — no-op for DynamoDB (table provisioned via Terraform/CDK)
# ─────────────────────────────────────────────────────────────────────────────
def init_db():
    """No-op. DynamoDB table is provisioned externally."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Staging helpers
# ─────────────────────────────────────────────────────────────────────────────

def create_staging_record(document_id: str, filename: str, file_path: str,
                          doc_type: str, s3_key: str = None,
                          batch_id: str = None, group_id: str = None,
                          processing_mode: str = "standalone", institution_name: str = None):
    item = {
        "documentId": document_id,
        "stage": "current",
        "document_id": document_id,  # for backward compatibility
        "filename": filename,
        "original_file_path": file_path,
        "document_type": doc_type,
        "status": "processing",
        "processing_mode": processing_mode or "standalone",
        "extraction_timestamp": datetime.utcnow().isoformat(),
    }
    if s3_key:
        item["s3_key"] = s3_key
    if batch_id:
        item["batchId"] = batch_id
        item["batch_id"] = batch_id
    if group_id:
        item["groupId"] = group_id
        item["group_id"] = group_id
    if institution_name:
        item["institutionName"] = institution_name
        item["institution_name"] = institution_name
    try:
        _get_dynamo_table().put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(documentId)",
        )
    except Exception as e:
        from botocore.exceptions import ClientError
        if isinstance(e, ClientError) and e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Record already exists (created by upload.py) — update status only, do not overwrite
            update_staging_status(document_id, "processing_extraction")
            return
        raise


def update_staging_status(document_id: str, status: str, error_message: str = None):
    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression="SET #s = :s, error_message = :e",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": status, ":e": error_message or ""},
    )


def save_raw_text(document_id: str, raw_text: str, doc_type: str,
                  method: str, language: str):
    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression=(
            "SET raw_text = :rt, document_type = :dt, "
            "extraction_method = :em, language_detected = :ld, #s = :s"
        ),
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":rt": raw_text,
            ":dt": doc_type,
            ":em": method,
            ":ld": language,
            ":s": "processing_normalization",
        },
    )


def save_extraction_result(document_id: str, raw_text: str, method: str,
                           language: str, extracted_json: dict,
                           confidence: float, warnings: list):
    now = datetime.utcnow().isoformat()
    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression=(
            "SET raw_text = :rt, extraction_method = :em, "
            "language_detected = :ld, extracted_json = :ej, "
            "confidence_score = :cs, warnings = :w, "
            "#s = :s, processed_timestamp = :pt"
        ),
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":rt": raw_text,
            ":em": method,
            ":ld": language,
            ":ej": json.dumps(extracted_json, ensure_ascii=False),
            ":cs": str(confidence),   # DynamoDB stores as string to avoid Decimal issues
            ":w": json.dumps(warnings, ensure_ascii=False),
            ":s": "pending_review",
            ":pt": now,
        },
    )


def update_extracted_json(document_id: str, updated_json: dict):
    """Operator edited the extracted JSON — persist their changes."""
    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression="SET extracted_json = :ej",
        ExpressionAttributeValues={
            ":ej": json.dumps(updated_json, ensure_ascii=False)
        },
    )


def _normalize_document_item(item: dict | None) -> dict | None:
    if not item:
        return None
    if "document_id" not in item:
        item["document_id"] = item.get("documentId")

    # Safely parse extracted_json if it was stored as a JSON string
    if "extracted_json" in item and isinstance(item["extracted_json"], str):
        try:
            parsed = json.loads(item["extracted_json"])
            if isinstance(parsed, str):
                parsed = json.loads(parsed)
            item["extracted_json"] = parsed
        except Exception:
            pass

    # Safely parse warnings if it was stored as a JSON string
    if "warnings" in item and isinstance(item["warnings"], str):
        try:
            item["warnings"] = json.loads(item["warnings"])
        except Exception:
            pass

    # Safely parse conflicts if it was stored as a JSON string
    if "conflicts" in item and isinstance(item["conflicts"], str):
        try:
            item["conflicts"] = json.loads(item["conflicts"])
        except Exception:
            pass

    # Safely parse source_documents if it was stored as a JSON string
    if "source_documents" in item and isinstance(item["source_documents"], str):
        try:
            item["source_documents"] = json.loads(item["source_documents"])
        except Exception:
            pass

    return item


def get_document(document_id: str) -> dict | None:
    response = _get_dynamo_table().get_item(Key={"documentId": document_id, "stage": "current"})
    return _normalize_document_item(response.get("Item"))


def list_documents(status: str = None) -> list[dict]:
    # BUG-09 FIX: paginate scan — DynamoDB returns max 1MB per call
    table = _get_dynamo_table()
    items = []
    scan_kwargs = {}
    if status:
        scan_kwargs["FilterExpression"] = "attribute_exists(documentId) AND #s = :s"
        scan_kwargs["ExpressionAttributeNames"] = {"#s": "status"}
        scan_kwargs["ExpressionAttributeValues"] = {":s": status}

    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    normalized_items = [_normalize_document_item(item) for item in items if item and not item.get("documentId", "").startswith("batch#")]
    return sorted(normalized_items, key=lambda x: x.get("extraction_timestamp", ""), reverse=True)


def get_dashboard_stats() -> dict:
    response = _get_dynamo_table().scan(
        ProjectionExpression="documentId, #s, confidence_score",
        ExpressionAttributeNames={"#s": "status"},
    )
    items = response.get("Items", [])
    stats = {}
    for item in items:
        s = item.get("status", "unknown")
        stats[s] = stats.get(s, 0) + 1
        
    scores = []
    for item in items:
        score_val = item.get("confidence_score")
        if score_val:
            try:
                scores.append(float(score_val))
            except ValueError:
                pass
                
    avg_conf = sum(scores) / len(scores) if scores else 0
    return {
        "total": len(items),
        "pending_review": stats.get("pending_review", 0),
        "processing": stats.get("processing", 0),
        "approved": stats.get("approved", 0),
        "rejected": stats.get("rejected", 0),
        "failed": stats.get("failed", 0),
        "avg_confidence": round(avg_conf, 3),
    }


def approve_document(document_id: str, final_json: dict) -> dict:
    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression="SET #s = :s, extracted_json = :ej, processed_timestamp = :pt",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={
            ":s": "approved",
            ":ej": json.dumps(final_json, ensure_ascii=False),
            ":pt": datetime.utcnow().isoformat(),
        },
    )
    # BUG-01 FIX: count programs from campuses[].academic_programs[], fall back to legacy programs[]
    campuses = final_json.get("campuses", []) or []
    if campuses:
        programs_count = sum(len(c.get("academic_programs", []) or []) for c in campuses)
    else:
        programs_count = len(final_json.get("programs", []) or [])
    return {
        "document_id": document_id,
        "status": "approved",
        "programs_count": programs_count,
    }


def reject_document(document_id: str, reason: str):
    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression="SET #s = :s, error_message = :e",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":s": "rejected", ":e": reason},
    )


def delete_document(document_id: str):
    """Deletes a document record from DynamoDB staging table (S3 object preserved)."""
    _get_dynamo_table().delete_item(
        Key={"documentId": document_id, "stage": "current"}
    )


# ─────────────────────────────────────────────────────────────────────────────
# Batch & Institution Group Helpers (DPI Requirements)
# ─────────────────────────────────────────────────────────────────────────────

def create_batch_record(batch_id: str, total_documents: int, standalone_count: int = 0,
                        groups_count: int = 0, groups_info: dict = None, metadata: dict = None):
    """Creates a top-level batch metadata record in EnrollUStaging."""
    now = datetime.utcnow().isoformat()
    item = {
        "documentId": f"batch#{batch_id}",
        "stage": "metadata",
        "batchId": batch_id,
        "batch_id": batch_id,
        "type": "batch_metadata",
        "status": "pending_upload",
        "total_documents": total_documents,
        "standalone_count": standalone_count,
        "groups_count": groups_count,
        "groups_info": json.dumps(groups_info or {}, ensure_ascii=False),
        "created_at": now,
        "updated_at": now,
    }
    if metadata:
        item["metadata"] = json.dumps(metadata, ensure_ascii=False)
    _get_dynamo_table().put_item(Item=item)
    return item


def get_batch_record(batch_id: str) -> dict | None:
    """Retrieves top-level batch metadata."""
    res = _get_dynamo_table().get_item(Key={"documentId": f"batch#{batch_id}", "stage": "metadata"})
    item = res.get("Item")
    if not item:
        return None
    if "groups_info" in item and isinstance(item["groups_info"], str):
        try:
            item["groups_info"] = json.loads(item["groups_info"])
        except Exception:
            pass
    if "metadata" in item and isinstance(item["metadata"], str):
        try:
            item["metadata"] = json.loads(item["metadata"])
        except Exception:
            pass
    return item


def update_batch_status(batch_id: str, status: str, error_message: str = None, execution_arn: str = None):
    """Updates batch execution status and timestamp."""
    expr = "SET #s = :s, updated_at = :u"
    names = {"#s": "status"}
    vals = {":s": status, ":u": datetime.utcnow().isoformat()}
    if error_message:
        expr += ", error_message = :e"
        vals[":e"] = error_message
    if execution_arn:
        expr += ", execution_arn = :arn"
        vals[":arn"] = execution_arn

    _get_dynamo_table().update_item(
        Key={"documentId": f"batch#{batch_id}", "stage": "metadata"},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=vals,
    )


def get_documents_by_batch(batch_id: str) -> list[dict]:
    """Retrieves all documents associated with a batchId using GSI or fallback scan."""
    table = _get_dynamo_table()
    items = []
    try:
        from boto3.dynamodb.conditions import Key
        res = table.query(
            IndexName="byBatchId",
            KeyConditionExpression=Key("batchId").eq(batch_id)
        )
        items = res.get("Items", [])
    except Exception as e:
        print(f"[WARN] GSI byBatchId query failed ({e}), falling back to scan...")
        scan_res = table.scan(
            FilterExpression="batchId = :b AND stage = :st",
            ExpressionAttributeValues={":b": batch_id, ":st": "current"}
        )
        items = scan_res.get("Items", [])

    return [_normalize_document_item(i) for i in items if i and i.get("documentId", "").startswith("batch#") is False]


def get_documents_by_group(group_id: str) -> list[dict]:
    """Retrieves all documents associated with an institution groupId using GSI or fallback scan."""
    table = _get_dynamo_table()
    items = []
    try:
        from boto3.dynamodb.conditions import Key
        res = table.query(
            IndexName="byGroupId",
            KeyConditionExpression=Key("groupId").eq(group_id)
        )
        items = res.get("Items", [])
    except Exception as e:
        print(f"[WARN] GSI byGroupId query failed ({e}), falling back to scan...")
        scan_res = table.scan(
            FilterExpression="groupId = :g AND stage = :st",
            ExpressionAttributeValues={":g": group_id, ":st": "current"}
        )
        items = scan_res.get("Items", [])

    return [_normalize_document_item(i) for i in items if i and not i.get("is_consolidated")]


def save_consolidated_record(consolidated_doc_id: str, group_id: str, batch_id: str,
                             institution_name: str, consolidated_json: dict,
                             conflicts: list, source_documents: list,
                             confidence: float = 1.0, raw_text: str = ""):
    """
    Saves a consolidated record for an institution group in EnrollUStaging
    with status='pending_review' and is_consolidated=True.
    """
    now = datetime.utcnow().isoformat()
    from decimal import Decimal
    decimal_conf = Decimal(str(round(confidence, 4))) if confidence is not None else Decimal("1.0")

    item = {
        "documentId": consolidated_doc_id,
        "stage": "current",
        "document_id": consolidated_doc_id,
        "groupId": group_id,
        "group_id": group_id,
        "batchId": batch_id or "",
        "batch_id": batch_id or "",
        "institutionName": institution_name or "",
        "institution_name": institution_name or "",
        "status": "pending_review",
        "is_consolidated": True,
        "processing_mode": "grouped",
        "filename": f"Consolidated — {institution_name or group_id}",
        "extracted_json": json.dumps(consolidated_json, ensure_ascii=False),
        "conflicts": json.dumps(conflicts or [], ensure_ascii=False),
        "source_documents": json.dumps(source_documents or [], ensure_ascii=False),
        "confidence_score": decimal_conf,
        "raw_text": raw_text or "",
        "extraction_timestamp": now,
        "processed_timestamp": now,
        "warnings": json.dumps([f"[CONSOLIDATION] {len(conflicts)} conflict(s) detected across {len(source_documents)} source documents."] if conflicts else [], ensure_ascii=False),
    }

    _get_dynamo_table().put_item(Item=item)
    print(f"[SUCCESS] Saved consolidated record {consolidated_doc_id} for group {group_id}")
    return item


