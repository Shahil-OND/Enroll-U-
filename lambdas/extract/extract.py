"""
extract.py — Text extraction from documents.
Primary OCR engine: PyTesseract.
Supports: PDF (digital + scanned), DOCX, XLSX, images, plain text.

Migrated from backend/extractor.py into the CDK lambda structure.
Import path updated: config is now resolved from the shared Lambda layer (/opt/python).
"""
import os
import re
from docx import Document as DocxDocument
from openpyxl import load_workbook

try:
    from config import ALLOWED_EXTENSIONS, AWS_REGION
except ImportError:
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "layers" / "common"))
    from config import ALLOWED_EXTENSIONS, AWS_REGION
def clean_whitespace(text: str) -> str:
    if not text:
        return ""
    # Collapses tabs and multiple horizontal spaces into a single space
    text = re.sub(r"[ \t]+", " ", text)
    # Strip leading/trailing whitespaces from each line
    lines = [line.strip() for line in text.splitlines()]
    # Keep at most one blank line as a paragraph separator
    cleaned_lines = []
    for line in lines:
        if line:
            cleaned_lines.append(line)
        elif cleaned_lines and cleaned_lines[-1] != "":
            cleaned_lines.append("")
    # Join lines back with single newlines
    text = "\n".join(cleaned_lines)
    # Collapse 3 or more newlines to exactly 2 newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

# Minimum text chars to consider a PDF page "digital" (not scanned)
DIGITAL_TEXT_THRESHOLD = 50

def extract(file_path: str, bucket: str = None, key: str = None, context=None) -> tuple[str, str]:
    """
    Main entry point. Returns (raw_text, extraction_method).
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file extension: {ext}")

    if ext == ".pdf":
        raw_text = ""
        method = "unknown"
        # First, try to extract digital text using PyMuPDF (free, fast)
        try:
            raw_text, method = _extract_pdf(file_path)
        except Exception as e:
            print(f"[WARN] PyMuPDF failed to parse PDF ({file_path}): {e}")
            raw_text = ""

        # If extracted text is minimal or PyMuPDF failed, fall back to Amazon Textract
        if len(raw_text.strip()) < DIGITAL_TEXT_THRESHOLD and bucket and key:
            print("PDF text extraction returned minimal/no text or PyMuPDF failed. Falling back to AWS Textract...")
            raw_text = _pdf_textract_async(bucket, key, context=context)
            method = "amazon-textract"
    elif ext == ".docx":
        raw_text, method = _extract_docx(file_path)
    elif ext == ".xlsx":
        if bucket and key:
            raw_text = _extract_excel(bucket, key)
            method = "openpyxl-s3"
        else:
            raw_text = _extract_excel(file_path)
            method = "openpyxl"
    elif ext == ".csv":
        if bucket and key:
            raw_text = _extract_csv(bucket, key)
            method = "csv-s3"
        else:
            raw_text = _extract_csv(file_path)
            method = "csv"
    elif ext == ".txt":
        raw_text, method = _extract_text(file_path)
    else:
        raise ValueError(f"No handler for extension: {ext}")

    return clean_whitespace(raw_text), method


# ─────────────────────────────────────────────────────────────────────────────
# PDF — try digital first, fall back to PyTesseract OCR page by page
# ─────────────────────────────────────────────────────────────────────────────

def _extract_pdf(file_path: str) -> tuple[str, str]:
    """
    Extract text from PDF using PyMuPDF.
    Digital pages are extracted directly. Scanned pages (no extractable text)
    are skipped silently — Textract handles those via the fallback in extract().

    fitz.open() is wrapped in its own try/except so that encrypted, corrupted,
    or image-only PDFs that raise FileDataError are caught here and surface as
    an empty string — triggering the Textract fallback in extract() rather than
    crashing the Lambda with an unhandled FileDataError.
    """
    import fitz
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        # FileDataError (encrypted/corrupted/image-only PDF) — return empty so
        # the caller's Textract fallback fires instead of crashing the workflow.
        print(f"[WARN] fitz.open() failed for '{file_path}': {e} — returning empty text, Textract fallback will handle this.")
        return "", "pymupdf-failed"

    pages_text = []
    for page in doc:
        text = page.get_text("text").strip()
        if len(text) >= DIGITAL_TEXT_THRESHOLD:
            pages_text.append(text)
        # Scanned pages with no text are skipped (Textract handles these)

    doc.close()
    return "\f".join(pages_text), "pymupdf"


# ─────────────────────────────────────────────────────────────────────────────
# DOCX
# ─────────────────────────────────────────────────────────────────────────────

def _extract_docx(file_path: str) -> tuple[str, str]:
    doc = DocxDocument(file_path)
    parts = []
    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text.strip())
    # Also extract tables
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
            if row_text:
                parts.append(row_text)
    return "\n".join(parts), "python-docx"


# ─────────────────────────────────────────────────────────────────────────────
# Plain text — pass-through
# ─────────────────────────────────────────────────────────────────────────────

def _extract_text(file_path: str) -> tuple[str, str]:
    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().strip(), "pass-through"


def _pdf_textract_async(bucket, key=None, context=None, client_request_token=None, max_wait_seconds=120):
    """Optional OCR using Amazon Textract async for scanned PDFs."""
    if key is None:
        return _extract_pdf(bucket)[0]
    import boto3
    import time
    import hashlib
    from botocore.config import Config

    # Configure robust client retries for boto3
    config = Config(
        retries={
            'max_attempts': 5,
            'mode': 'standard'
        }
    )
    textract = boto3.client("textract", region_name=AWS_REGION, config=config)

    # Use a deterministic ClientRequestToken if not provided, to prevent duplicate Textract jobs
    if not client_request_token:
        # Limit token to 64 chars per Textract API limits
        client_request_token = hashlib.sha256(f"{bucket}/{key}".encode("utf-8")).hexdigest()[:64]

    response = textract.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}},
        ClientRequestToken=client_request_token
    )
    job_id = response["JobId"]
    print(f"Textract job started/retrieved: {job_id} with ClientRequestToken: {client_request_token}")

    # Dynamic polling loop
    start_time = time.time()
    wait_interval = 2.0
    safety_buffer = 5.0
    attempt = 0

    while True:
        attempt += 1
        # Calculate remaining time in seconds
        if context is not None and hasattr(context, "get_remaining_time_in_millis"):
            remaining = context.get_remaining_time_in_millis() / 1000.0
        else:
            remaining = max_wait_seconds - (time.time() - start_time)

        # Check if remaining time is below our safety margin
        if remaining <= safety_buffer:
            raise TimeoutError(
                f"Textract job timed out: remaining time ({remaining:.1f}s) is below safety buffer ({safety_buffer}s). Job ID: {job_id}"
            )

        # Sleep logic with backoff, ensuring we don't overrun our time budget
        sleep_time = min(wait_interval, remaining - safety_buffer)
        if sleep_time > 0:
            time.sleep(sleep_time)

        try:
            result = textract.get_document_text_detection(JobId=job_id)
            status = result["JobStatus"]
        except Exception as e:
            # Treat transient errors as IN_PROGRESS to retry next loop
            print(f"Warning: Failed to fetch Textract status (attempt {attempt}): {e}")
            status = "IN_PROGRESS"

        print(f"Textract status: {status} (attempt {attempt}, elapsed: {time.time() - start_time:.1f}s)")

        if status == "SUCCEEDED":
            lines = []
            next_token = None
            max_pages = 50
            page_count = 0

            while page_count < max_pages:
                page_count += 1
                if next_token:
                    result = textract.get_document_text_detection(
                        JobId=job_id,
                        NextToken=next_token
                    )

                for block in result.get("Blocks", []):
                    if block.get("BlockType") != "LINE":
                        continue
                    text = (block.get("Text") or "").strip()
                    if text:
                        lines.append(text)

                new_token = result.get("NextToken")
                # Break if no more tokens exist or if token repeats (prevents infinite loops)
                if not new_token or new_token == next_token:
                    break
                next_token = new_token

            return "\n".join(lines)

        if status == "FAILED":
            status_msg = result.get("StatusMessage", "No status message provided by Textract")
            raise RuntimeError(f"Textract job failed for JobId={job_id}: {status_msg}")

        # Exponential backoff capped at 15 seconds
        wait_interval = min(wait_interval * 1.5, 15.0)

# ----------------------------------------------------------
# Excel
# ----------------------------------------------------------

def _extract_excel(bucket, key=None):
    """Extract text from Excel file (supports local path or S3 bucket/key)."""
    import openpyxl
    if key is not None:
        import boto3
        import io
        s3 = boto3.client("s3", region_name=AWS_REGION)
        obj = s3.get_object(Bucket=bucket, Key=key)
        data = io.BytesIO(obj["Body"].read())
        wb = openpyxl.load_workbook(data)
    else:
        wb = openpyxl.load_workbook(bucket, data_only=True)

    text = []

    for sheet in wb.sheetnames:
        ws = wb[sheet]
        text.append(f"[Sheet: {sheet}]")

        for row in ws.iter_rows(values_only=True):
            vals = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if vals:
                text.append(" | ".join(vals))

    return ("\n".join(text))


# ----------------------------------------------------------
# CSV
# ----------------------------------------------------------

def _extract_csv(bucket, key=None):
    """Extract text from CSV file (supports local path or S3 bucket/key)."""
    import io
    import csv
    if key is not None:
        import boto3
        s3 = boto3.client("s3", region_name=AWS_REGION)
        obj = s3.get_object(Bucket=bucket, Key=key)
        raw = obj["Body"].read().decode("utf-8", errors="replace")
    else:
        with open(bucket, "r", encoding="utf-8", errors="replace") as f:
            raw = f.read()

    lines = []
    try:
        reader = csv.reader(io.StringIO(raw))
        for row in reader:
            vals = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if vals:
                lines.append(" | ".join(vals))
    except Exception as e:
        print(f"  CSV parse failed: {e}")
        return raw.strip()

    return ("\n".join(lines))

import os
import tempfile
import boto3


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
    print(f"Received event: {event}")
    doc_id = None

    try:
        bucket = None
        key = None

        if isinstance(event, dict):
            bucket = event.get("bucket")
            key = event.get("key") or event.get("s3_key")

            # Support S3 Event Notification schema: event['Records'][0]['s3']
            if not bucket and "Records" in event and isinstance(event["Records"], list) and len(event["Records"]) > 0:
                s3_rec = event["Records"][0].get("s3", {})
                bucket = s3_rec.get("bucket", {}).get("name")
                key = s3_rec.get("object", {}).get("key")

            # Support EventBridge schema: event['detail']['bucket']['name']
            if not bucket and "detail" in event and isinstance(event["detail"], dict):
                detail = event["detail"]
                bucket = detail.get("bucket", {}).get("name") or detail.get("bucket")
                key = detail.get("object", {}).get("key") or detail.get("key")

            # Support Step Functions Payload wrapper schema if nested
            if not bucket and "Payload" in event and isinstance(event["Payload"], dict):
                payload = event["Payload"]
                bucket = payload.get("bucket")
                key = payload.get("key")

            # Fallback to environment variable if bucket is missing but key is present
            if not bucket and key:
                bucket = os.environ.get("INGEST_BUCKET_NAME")

        if not bucket or not key:
            raise KeyError(f"Could not extract 'bucket' and 'key' from event input format: {event}")

        ext = os.path.splitext(key)[1].lower()

        # PDF, CSV and XLSX can be processed directly from S3
        s3 = boto3.client("s3")

        if ext == ".pdf":
            filename = os.path.basename(key)
            local_file = os.path.join(tempfile.gettempdir(), filename)

            s3.download_file(bucket, key, local_file)
            if not os.path.exists(local_file) or os.path.getsize(local_file) == 0:
                raise ValueError(f"Downloaded file '{key}' from S3 bucket '{bucket}' is empty (0 bytes).")

            raw_text, extraction_method = extract(local_file, bucket=bucket, key=key, context=context)

        elif ext in [".csv", ".xlsx"]:
            raw_text, extraction_method = extract(
                file_path=key,
                bucket=bucket,
                key=key,
            )

        else:
            filename = os.path.basename(key)
            local_file = os.path.join(tempfile.gettempdir(), filename)

            s3.download_file(bucket, key, local_file)

            # Pass bucket/key so extract() can use the Textract fallback if PyMuPDF
            # fails (e.g. encrypted/scanned PDF that lands in this else-branch).
            raw_text, extraction_method = extract(local_file, bucket=bucket, key=key, context=context)

        doc_id = event.get("document_id") or event.get("documentId") if isinstance(event, dict) else None

        # Extract document_id from S3 key path: uploads/{document_id}/{filename} or batches/{batch_id}/{document_id}/{filename}
        if not doc_id and key:
            parts = key.split("/")
            if len(parts) >= 3 and parts[0] == "uploads":
                doc_id = parts[1]
                print(f"[INFO] Extracted document_id from S3 key path: {doc_id}")
            elif len(parts) >= 4 and parts[0] == "batches":
                doc_id = parts[2]
                print(f"[INFO] Extracted document_id from batches S3 key path: {doc_id}")

        if not doc_id:
            raise ValueError(
                f"document_id missing from event and could not be extracted from S3 key '{key}'. "
                "Expected key format: uploads/{document_id}/{filename} or batches/{batch_id}/{document_id}/{filename}"
            )

        res = {
            "bucket": bucket,
            "key": key,
            "document_id": doc_id,
            "raw_text": raw_text,
            "extraction_method": extraction_method,
        }
        for prop in ["batch_id", "batchId", "group_id", "groupId", "processing_mode", "processingMode", "institution_name", "institutionName"]:
            if isinstance(event, dict) and prop in event:
                res[prop] = event[prop]
        return res
    except Exception as e:
        print(f"[ERROR] Extraction handler failed: {e}")
        # Try to resolve doc_id if key exists
        if not doc_id and 'key' in locals() and key:
            parts = key.split("/")
            if len(parts) >= 3 and parts[0] == "uploads":
                doc_id = parts[1]
        _update_status_failed(doc_id, str(e))
        raise e