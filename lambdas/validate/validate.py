"""
validate.py — Entry orchestration for the validate Lambda.

Migrated from backend/validator.py into the CDK lambda structure.
Rule functions now live in validators.py (CDK common dir pattern).
validate_extracted() is the public entrypoint — its signature and return
type are unchanged from the prototype.
"""
# BUG-03 FIX: all standard library and AWS imports moved to top of file
import os
import re
import json
import boto3
from decimal import Decimal

from validators import (
    run_schema_validation,
    check_fees,
    check_dates,
    check_required_fields,
    check_currency_resolvable,
    compute_confidence,
    deduplicate_warnings,
    get_nested,
    OPTIONAL_BUT_EXPECTED,
)


def validate_extracted(data: dict) -> tuple[list[str], dict, float]:
    """
    Run JSON schema validation + business rules.
    Returns: (warnings, cleaned_data, confidence_score 0-1)
    """
    warnings = []

    # ── 1. Schema validation ──────────────────────────────────────────────────
    schema_warnings, schema_errors = run_schema_validation(data)
    warnings.extend(schema_warnings)

    # ── 2. Business rules & Nested validations ────────────────────────────────
    programs = data.get("programs", []) or []
    if not programs:
        for campus in data.get("campuses", []) or []:
            if isinstance(campus, dict):
                for prog in campus.get("academic_programs", []) or []:
                    if isinstance(prog, dict):
                        programs.append(prog)

    for prog in programs:
        warnings.extend(check_fees(prog))
        warnings.extend(check_dates(prog))
        warnings.extend(check_required_fields(prog))
        # New: hard warning for MySQL-schema-critical unresolvable currencies
        warnings.extend(check_currency_resolvable(prog))

    # ── 3. Missing optional-but-expected fields (Global checks) ───────────────
    for path in OPTIONAL_BUT_EXPECTED:
        value = get_nested(data, path.split("."))
        if value is None or (isinstance(value, list) and not value):
            warnings.append(f"[MISSING] {path} is null or empty")

    # ── 4. Confidence score ───────────────────────────────────────────────────
    confidence = compute_confidence(data, schema_errors, warnings)

    # Persist confidence back into metadata
    meta = data.setdefault("metadata", {})
    meta["confidence_score"] = confidence

    # Review priority flag
    if confidence >= 0.80:
        meta["review_priority"] = "low"
    elif confidence >= 0.50:
        meta["review_priority"] = "normal"
    else:
        meta["review_priority"] = "high"

    # Warning deduplication
    all_warnings = meta.get("warnings", []) + warnings
    deduped_warnings = deduplicate_warnings(all_warnings)
    meta["warnings"] = deduped_warnings

    return deduped_warnings, data, confidence


def _get_nested(data: dict, keys: list):
    """Backward-compat alias — use get_nested from validators.py directly."""
    return get_nested(data, keys)


def _persist_to_dynamodb(cleaned_data: dict, warnings: list, confidence: float):
    """
    Updates the existing DynamoDB staging item (PK = documentId, SK = 'current')
    with status='pending_review', extracted_json, confidence_score, warnings, etc.
    """
    try:
        table_name = os.environ.get("STAGING_TABLE_NAME", "EnrollUStaging")
        dynamodb = boto3.resource("dynamodb")
        table = dynamodb.Table(table_name)

        meta = cleaned_data.get("metadata", {})
        doc_id = meta.get("document_id")

        # BUG-06 FIX: use regex UUID extraction directly; remove broken underscore-split fallback
        if not doc_id and meta.get("original_file_path"):
            path_base = os.path.basename(meta.get("original_file_path", ""))
            _UUID_PATTERN = re.compile(
                r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
                re.IGNORECASE
            )
            match = _UUID_PATTERN.search(path_base)
            if match:
                doc_id = match.group()

        if not doc_id:
            print("[WARN] DynamoDB persistence skipped: document_id not found in metadata.")
            return

        meta["document_id"] = doc_id

        file_path = meta.get("original_file_path", "")
        base_name = os.path.basename(file_path)
        filename = meta.get("filename") or (base_name.partition("_")[2] if "_" in base_name else base_name)

        def _convert_floats(obj):
            if isinstance(obj, float):
                return Decimal(str(obj))
            elif isinstance(obj, dict):
                return {k: _convert_floats(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [_convert_floats(v) for v in obj]
            return obj

        decimal_confidence = Decimal(str(round(confidence, 4)))
        converted_meta = _convert_floats(meta)

        raw_text = meta.get("raw_text") or (cleaned_data.get("raw_text") if isinstance(cleaned_data, dict) else "")

        update_expr = (
            "SET #stat = :stat, "
            "extracted_json = :json, "
            "confidence_score = :conf, "
            "warnings = :warn, "
            "metadata = :meta, "
            "extraction_timestamp = :ts, "
            "original_file_path = :path, "
            "filename = :fname"
        )
        expr_vals = {
            ':stat': 'pending_review',
            ':json': json.dumps(cleaned_data),
            ':conf': decimal_confidence,
            ':warn': warnings,
            ':meta': converted_meta,
            ':ts': meta.get("extraction_timestamp", ""),
            ':path': file_path,
            ':fname': filename or "document"
        }

        if raw_text:
            update_expr += ", raw_text = :rt"
            expr_vals[':rt'] = raw_text

        table.update_item(
            Key={
                'documentId': doc_id,
                'stage': 'current'
            },
            UpdateExpression=update_expr,
            ExpressionAttributeNames={
                '#stat': 'status'
            },
            ExpressionAttributeValues=expr_vals
        )
        print(f"[SUCCESS] Updated DynamoDB staging item for documentId: {doc_id} with status='pending_review'")
    except Exception as e:
        print(f"[ERROR] Failed to update DynamoDB staging record: {e}")


# =============================================================================
# AWS Lambda Handler
# =============================================================================

def _update_status_failed(doc_id: str, error_message: str):
    if not doc_id:
        return
    try:
        table_name = os.environ.get("STAGING_TABLE_NAME", "EnrollUStaging")
        region = os.environ.get("AWS_REGION", "us-west-2")
        dynamodb = boto3.resource("dynamodb", region_name=region)
        table = dynamodb.Table(table_name)
        table.update_item(
            Key={"documentId": doc_id, "stage": "current"},
            UpdateExpression="SET #s = :s, error_message = :e",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "failed", ":e": str(error_message)},
        )
        print(f"[SUCCESS] Updated documentId '{doc_id}' status to 'failed': {error_message}")
    except Exception as db_err:
        print(f"[ERROR] Could not update DynamoDB status to 'failed': {db_err}")


def handler(event, context):
    """
    Lambda entry point for the Validate step.

    Receives the normalized JSON from Normalize Lambda.
    """
    doc_id = None
    try:
        print(f"Received event: {event}")

        if not isinstance(event, dict):
            raise ValueError("Expected normalized JSON object.")

        # Check for document_id and extracted_json
        extracted_json = event.get("extracted_json") or event
        doc_id = event.get("document_id") or extracted_json.get("metadata", {}).get("document_id")

        # Ensure document_id is propagated if found in parent event
        if doc_id:
            extracted_json.setdefault("metadata", {})["document_id"] = doc_id

        # Extract raw_text from event if available before validation
        raw_text = event.get("raw_text") or extracted_json.get("metadata", {}).get("raw_text") or ""
        if raw_text:
            extracted_json.setdefault("metadata", {})["raw_text"] = raw_text

        warnings, cleaned_data, confidence = validate_extracted(extracted_json)

        # Persist validated output to existing DynamoDB staging item
        _persist_to_dynamodb(cleaned_data, warnings, confidence)

        return {
            "validated_data": cleaned_data,
            "warnings": warnings,
            "confidence_score": confidence,
            "raw_text": raw_text,
        }
    except Exception as e:
        print(f"[ERROR] Validation handler failed: {e}")
        _update_status_failed(doc_id, str(e))
        raise e