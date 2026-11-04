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
        region = os.environ.get("AWS_REGION")
        _dynamodb = boto3.resource("dynamodb", region_name=region) if region else boto3.resource("dynamodb")
        _dynamo_table = _dynamodb.Table(table_name)
    return _dynamo_table


# ─────────────────────────────────────────────────────────────────────────────
# Cognito Claims & Traceability Helper
# ─────────────────────────────────────────────────────────────────────────────
def extract_user_info(event: dict) -> dict:
    """Extract authenticated user details from API Gateway Cognito authorizer context."""
    if not isinstance(event, dict):
        return {"user_id": "system", "email": "system@enrollu.internal", "groups": [], "is_admin": False}

    auth_ctx = event.get("requestContext", {}).get("authorizer", {}) or {}
    claims = auth_ctx.get("claims", {}) or {}
    user_id = claims.get("sub") or claims.get("username")
    email = claims.get("email") or claims.get("cognito:username")

    groups_claim = claims.get("cognito:groups", [])
    if isinstance(groups_claim, str):
        groups = [g.strip() for g in groups_claim.split(",") if g.strip()]
    elif isinstance(groups_claim, list):
        groups = groups_claim
    else:
        groups = []

    # Case-insensitive admin check
    is_admin = any(g.lower() in ("administrator", "admin") for g in groups)

    return {
        "user_id": user_id or "anonymous",
        "email": email or (f"{user_id}@user" if user_id else "anonymous"),
        "groups": groups,
        "is_admin": is_admin,
    }


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
                          doc_type: str, s3_key: str = None, uploaded_by: str = None):
    now = datetime.utcnow().isoformat()
    item = {
        "documentId": document_id,
        "stage": "current",
        "document_id": document_id,  # for backward compatibility
        "filename": filename,
        "original_file_path": file_path,
        "document_type": doc_type,
        "status": "processing",
        "extraction_timestamp": now,
        "uploaded_at": now,
    }
    if s3_key:
        item["s3_key"] = s3_key
    if uploaded_by:
        item["uploaded_by"] = uploaded_by
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


def update_extracted_json(document_id: str, updated_json: dict, edited_by: str = None):
    """Operator edited the extracted JSON — persist their changes and audit info."""
    now = datetime.utcnow().isoformat()
    update_expr = "SET extracted_json = :ej, edited_at = :ea"
    expr_vals = {
        ":ej": json.dumps(updated_json, ensure_ascii=False),
        ":ea": now,
    }
    if edited_by:
        update_expr += ", edited_by = :eb"
        expr_vals[":eb"] = edited_by

    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression=update_expr,
        ExpressionAttributeValues=expr_vals,
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

    normalized_items = [_normalize_document_item(item) for item in items if item]
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


def approve_document(document_id: str, final_json: dict, approved_by: str = None) -> dict:
    now = datetime.utcnow().isoformat()
    update_expr = "SET #s = :s, extracted_json = :ej, processed_timestamp = :pt, approved_at = :aa"
    expr_vals = {
        ":s": "approved",
        ":ej": json.dumps(final_json, ensure_ascii=False),
        ":pt": now,
        ":aa": now,
    }
    if approved_by:
        update_expr += ", approved_by = :ab"
        expr_vals[":ab"] = approved_by

    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues=expr_vals,
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


def reject_document(document_id: str, reason: str, rejected_by: str = None):
    now = datetime.utcnow().isoformat()
    update_expr = "SET #s = :s, error_message = :e, rejected_at = :ra"
    expr_vals = {
        ":s": "rejected",
        ":e": reason,
        ":ra": now,
    }
    if rejected_by:
        update_expr += ", rejected_by = :rb"
        expr_vals[":rb"] = rejected_by

    _get_dynamo_table().update_item(
        Key={"documentId": document_id, "stage": "current"},
        UpdateExpression=update_expr,
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues=expr_vals,
    )


def delete_document(document_id: str):
    """Deletes a document record from DynamoDB staging table (S3 object preserved)."""
    _get_dynamo_table().delete_item(
        Key={"documentId": document_id, "stage": "current"}
    )

