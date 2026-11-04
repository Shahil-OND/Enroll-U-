"""
normalize.py — Sends extracted text to an LLM with a strict prompt.
Active provider: AWS Bedrock (Nova Pro 2).
Returns a parsed JSON dict matching the AcademicProgramCostUpdate schema.

Migrated from backend/normalizer.py into the CDK lambda structure.
Prompt strings now live in prompt_builder.py (CDK common dir pattern).
"""
import json
import re
import time
import random
import warnings as py_warnings
from datetime import datetime  # BUG-08 FIX: moved from inside normalize() function body
from json_repair import repair_json
import logging
from botocore.exceptions import ClientError

try:
    from config import (
        LLM_PROVIDER, LLM_TEMPERATURE,
        LLM_MAX_INPUT_TOKENS, LLM_MAX_OUTPUT_TOKENS,
        BEDROCK_MODEL_ID, AWS_REGION,
    )
except ImportError:
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "layers" / "common"))
    from config import (
        LLM_PROVIDER, LLM_TEMPERATURE,
        LLM_MAX_INPUT_TOKENS, LLM_MAX_OUTPUT_TOKENS,
        BEDROCK_MODEL_ID, AWS_REGION,
    )

from prompt_builder import SYSTEM_PROMPT, build_user_message

# ─────────────────────────────────────────────────────────────────────────────
# Exponential Backoff Retry Logic
# Handles boto3 ClientError (error code in e.response['Error']['Code']).
# ─────────────────────────────────────────────────────────────────────────────
_RETRYABLE_BEDROCK_CODES = {
    "ThrottlingException",
    "ModelTimeoutException",
    "ServiceUnavailableException",
    "InternalServerException",
}

def _call_with_retry(func, *args, max_retries=3, initial_delay=2.0, backoff_factor=2.0, **kwargs):
    """Call a function with exponential backoff and random jitter.
    Handles Bedrock ClientError."""
    delay = initial_delay
    last_err = None
    for attempt in range(max_retries + 1):
        try:
            return func(*args, **kwargs)
        except ClientError as e:
            last_err = e
            error_code = e.response.get("Error", {}).get("Code", "")

            if error_code not in _RETRYABLE_BEDROCK_CODES:
                logging.error(f"[ABORT] Non-retryable Bedrock error: {error_code}")
                raise e

            if attempt == max_retries:
                break

            jitter = random.uniform(0.5, 1.5)
            sleep_time = delay * jitter
            logging.warning(
                f"[RETRY] Bedrock {error_code}. Attempt {attempt + 1}/{max_retries + 1}. "
                f"Retrying in {sleep_time:.2f}s..."
            )
            time.sleep(sleep_time)
            delay *= backoff_factor

        except Exception as e:
            last_err = e
            if attempt == max_retries:
                break

            jitter = random.uniform(0.5, 1.5)
            sleep_time = delay * jitter
            logging.warning(
                f"[RETRY] LLM call failed with {type(e).__name__}. "
                f"Attempt {attempt + 1}/{max_retries + 1}. Retrying in {sleep_time:.2f}s..."
            )
            time.sleep(sleep_time)
            delay *= backoff_factor

    raise last_err

# ─────────────────────────────────────────────────────────────────────────────
# Page-Aware Truncation (Issue 6)
# ─────────────────────────────────────────────────────────────────────────────
def _truncate_text(text: str, max_chars: int) -> str:
    """Page-aware truncation of raw text to respect token budget."""
    max_chars = min(max_chars, LLM_MAX_INPUT_TOKENS * 4)
    if len(text) <= max_chars:
        return text

    # Split by form feed / page breaks (inserted by extractor)
    pages = text.split("\f")
    if len(pages) > 1:
        truncated_parts = []
        current_len = 0
        for page in pages:
            page_len = len(page) + 1  # +1 for separator
            if current_len + page_len <= max_chars:
                truncated_parts.append(page)
                current_len += page_len
            else:
                break
        if truncated_parts:
            return "\f".join(truncated_parts) + "\n\n...[TRUNCATED ADDITIONAL PAGES]"

    # Fallback to line-by-line truncation if no page breaks or single page too long
    lines = text.split("\n")
    if len(lines) > 1:
        truncated_lines = []
        current_len = 0
        for line in lines:
            line_len = len(line) + 1
            if current_len + line_len <= max_chars:
                truncated_lines.append(line)
                current_len += line_len
            else:
                break
        if truncated_lines:
            return "\n".join(truncated_lines) + "\n...[TRUNCATED]"

    # Absolute fallback
    return text[:max_chars] + "\n...[TRUNCATED]"

# ─────────────────────────────────────────────────────────────────────────────
# Robust JSON Parsing (Issue 8)
# ─────────────────────────────────────────────────────────────────────────────
def _parse_json_response(raw: str) -> dict:
    """
    Extract the JSON object from the LLM response.
    Uses regex block matching and json_repair as a fallback.
    """
    cleaned = raw.strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    # Try regex match from first { to last }
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        json_str = match.group()
        try:
            return json.loads(json_str)
        except Exception:
            # Try repairing with json_repair
            try:
                repaired = repair_json(json_str)
                return json.loads(repaired)
            except Exception:
                pass

    # Try repair_json on full text as a last resort
    try:
        repaired = repair_json(cleaned)
        return json.loads(repaired)
    except Exception as e:
        raise ValueError(
            f"Failed to parse LLM response as JSON after all attempts. "
            f"Error: {str(e)}\nRaw Response: {raw[:500]}"
        )

# ─────────────────────────────────────────────────────────────────────────────
# Page-level Chunking & Schema Merging
# ─────────────────────────────────────────────────────────────────────────────

def _chunk_text_by_pages(text: str, max_chunk_chars: int = 10000) -> list[str]:
    """Splits raw text into chunks, respecting page breaks where possible."""
    pages = text.split("\f")
    chunks = []
    current_chunk = []
    current_len = 0

    for page in pages:
        page_len = len(page)
        if page_len > max_chunk_chars:
            if current_chunk:
                chunks.append("\f".join(current_chunk))
                current_chunk = []
                current_len = 0

            lines = page.split("\n")
            line_chunk = []
            line_len = 0
            for line in lines:
                if line_len + len(line) + 1 > max_chunk_chars:
                    if line_chunk:
                        chunks.append("\n".join(line_chunk))
                    line_chunk = [line]
                    line_len = len(line)
                else:
                    line_chunk.append(line)
                    line_len += len(line) + 1
            if line_chunk:
                chunks.append("\n".join(line_chunk))
        else:
            separator_len = 1 if current_chunk else 0
            if current_len + page_len + separator_len > max_chunk_chars:
                chunks.append("\f".join(current_chunk))
                current_chunk = [page]
                current_len = page_len
            else:
                current_chunk.append(page)
                current_len += page_len + separator_len

    if current_chunk:
        chunks.append("\f".join(current_chunk))

    return chunks

def _merge_institutions(inst1: dict, inst2: dict) -> dict:
    """Merge two institution dicts, prioritizing non-null values."""
    merged = {}
    for key in ["name", "website"]:
        val1 = inst1.get(key)
        val2 = inst2.get(key)
        merged[key] = val1 if val1 else val2

    # Merge address
    addr1 = inst1.get("address") if isinstance(inst1.get("address"), dict) else {}
    addr2 = inst2.get("address") if isinstance(inst2.get("address"), dict) else {}
    merged_addr = {}
    for key in ["city", "state", "country"]:
        v1 = addr1.get(key)
        v2 = addr2.get(key)
        merged_addr[key] = v1 if v1 else v2
    merged["address"] = merged_addr

    # Merge contact
    c1 = inst1.get("contact") if isinstance(inst1.get("contact"), dict) else {}
    c2 = inst2.get("contact") if isinstance(inst2.get("contact"), dict) else {}
    merged_contact = {}
    for key in ["email", "phone"]:
        v1 = c1.get(key)
        v2 = c2.get(key)
        merged_contact[key] = v1 if v1 else v2
    merged["contact"] = merged_contact

    return merged

def _merge_programs(prog1: dict, prog2: dict) -> dict:
    """Merge two program dicts with the same name, combining their details."""
    merged = dict(prog1)  # start with a copy of prog1

    # Merge simple scalar fields (prefer first non-null)
    for key in ["level", "field_of_study", "modality", "duration"]:
        if not merged.get(key) and prog2.get(key):
            merged[key] = prog2[key]

    # Merge boolean fields (prefer first non-null)
    for key in ["has_admission_test", "has_scholarship"]:
        if merged.get(key) is None and prog2.get(key) is not None:
            merged[key] = prog2[key]

    # Merge classification (prefer first non-null per sub-key)
    cls1 = merged.get("classification") if isinstance(merged.get("classification"), dict) else {}
    cls2 = prog2.get("classification") if isinstance(prog2.get("classification"), dict) else {}
    merged_cls = dict(cls1)
    for key in ["academic_degree_key", "periodicity_key", "modality_key",
                "knowledge_area_key", "study_area_key"]:
        if not merged_cls.get(key) and cls2.get(key):
            merged_cls[key] = cls2[key]
    merged["classification"] = merged_cls

    # Merge requirements (deduplicated list)
    reqs1 = merged.get("requirements")
    reqs1 = reqs1 if isinstance(reqs1, list) else []
    reqs2 = prog2.get("requirements")
    reqs2 = reqs2 if isinstance(reqs2, list) else []

    seen_reqs = set(reqs1)
    merged_reqs = list(reqs1)
    for r in reqs2:
        if r not in seen_reqs:
            merged_reqs.append(r)
            seen_reqs.add(r)
    merged["requirements"] = merged_reqs

    # Merge curriculum — now a flat deduplicated list of subject strings
    curr1 = merged.get("curriculum")
    curr1 = curr1 if isinstance(curr1, list) else []
    curr2 = prog2.get("curriculum")
    curr2 = curr2 if isinstance(curr2, list) else []

    seen_subjects = set(s for s in curr1 if isinstance(s, str))
    merged_curriculum = [s for s in curr1 if isinstance(s, str)]
    for subject in curr2:
        if isinstance(subject, str) and subject not in seen_subjects:
            merged_curriculum.append(subject)
            seen_subjects.add(subject)
    merged["curriculum"] = merged_curriculum

    # Merge academic_period
    ap1 = merged.get("academic_period")
    ap1 = ap1 if isinstance(ap1, dict) else {}
    ap2 = prog2.get("academic_period")
    ap2 = ap2 if isinstance(ap2, dict) else {}

    merged_ap = dict(ap1)
    for key in ["period_name", "period_type", "start_date", "end_date",
                "registration_start_date", "registration_end_date"]:
        if not merged_ap.get(key) and ap2.get(key):
            merged_ap[key] = ap2[key]
    merged["academic_period"] = merged_ap

    # Merge financials
    fin1 = merged.get("financials")
    fin1 = fin1 if isinstance(fin1, dict) else {}
    fin2 = prog2.get("financials")
    fin2 = fin2 if isinstance(fin2, dict) else {}

    merged_fin = dict(fin1)
    if not merged_fin.get("currency") and fin2.get("currency"):
        merged_fin["currency"] = fin2["currency"]

    # Costs
    costs1 = fin1.get("costs") if isinstance(fin1.get("costs"), dict) else {}
    costs2 = fin2.get("costs") if isinstance(fin2.get("costs"), dict) else {}
    merged_costs = dict(costs1)
    for key in ["enrollment_fee", "tuition_fee"]:
        if merged_costs.get(key) is None and costs2.get(key) is not None:
            merged_costs[key] = costs2[key]
    merged_fin["costs"] = merged_costs

    # Payment installments
    inst1 = fin1.get("payment_installments")
    inst1 = list(inst1) if isinstance(inst1, list) else []
    inst2 = fin2.get("payment_installments")
    inst2 = inst2 if isinstance(inst2, list) else []

    inst_map = {}
    for i in inst1:
        if isinstance(i, dict) and i.get("installment_number") is not None:
            inst_map[i["installment_number"]] = i
            
    for i in inst2:
        if not isinstance(i, dict):
            continue
        num = i.get("installment_number")
        if num is None:
            continue
        if num in inst_map:
            if inst_map[num].get("amount") is None and i.get("amount") is not None:
                inst_map[num]["amount"] = i["amount"]
            if not inst_map[num].get("due_date") and i.get("due_date"):
                inst_map[num]["due_date"] = i["due_date"]
        else:
            new_i = dict(i)
            inst1.append(new_i)
            inst_map[num] = new_i

    inst1 = [i for i in inst1 if isinstance(i, dict)]
    inst1.sort(key=lambda x: x.get("installment_number", 0))
    merged_fin["payment_installments"] = inst1

    # Scholarships
    s1 = fin1.get("scholarships")
    s1 = list(s1) if isinstance(s1, list) else []
    s2 = fin2.get("scholarships")
    s2 = s2 if isinstance(s2, list) else []

    seen_s = {}
    for sch in s1:
        if isinstance(sch, dict) and sch.get("title"):
            seen_s[sch["title"]] = sch

    for sch in s2:
        if not isinstance(sch, dict):
            continue
        title = sch.get("title")
        if not title:
            continue
        if title in seen_s:
            if not seen_s[title].get("description") and sch.get("description"):
                seen_s[title]["description"] = sch["description"]
            if seen_s[title].get("discount_percentage") is None and sch.get("discount_percentage") is not None:
                seen_s[title]["discount_percentage"] = sch["discount_percentage"]
        else:
            new_sch = dict(sch)
            s1.append(new_sch)
            seen_s[title] = new_sch

    s1 = [sch for sch in s1 if isinstance(sch, dict)]
    merged_fin["scholarships"] = s1

    merged["financials"] = merged_fin
    return merged

def _merge_chunk_jsons(json_list: list[dict]) -> dict:
    if not json_list:
        return {
            "institution": {},
            "campuses": [],
            "metadata": {}
        }

    final_json = {
        "institution": json_list[0].get("institution") or {},
        "campuses": [],
        "metadata": json_list[0].get("metadata") or {}
    }

    # merge institution
    for other_json in json_list[1:]:
        inst = other_json.get("institution")
        if isinstance(inst, dict):
            final_json["institution"] = _merge_institutions(
                final_json["institution"], inst
            )

    # merge campuses by name
    campuses_by_name = {}
    for other_json in json_list:
        for campus in (other_json.get("campuses") or []):
            if not isinstance(campus, dict):
                continue
            key = campus.get("name") or "__default__"
            if key not in campuses_by_name:
                campuses_by_name[key] = dict(campus)
                campuses_by_name[key]["academic_programs"] = []
            else:
                for field in ["address", "phone", "email", "description", "short_name"]:
                    new_val = campus.get(field)
                    if new_val:
                        campuses_by_name[key][field] = new_val
            # merge academic_programs inside campus
            programs_by_name = {
                p["name"]: p
                for p in campuses_by_name[key]["academic_programs"]
                if isinstance(p, dict) and p.get("name")
            }
            for prog in (campus.get("academic_programs") or []):
                if not isinstance(prog, dict) or not prog.get("name"):
                    continue
                if prog["name"] in programs_by_name:
                    programs_by_name[prog["name"]] = _merge_programs(
                        programs_by_name[prog["name"]], prog
                    )
                else:
                    programs_by_name[prog["name"]] = dict(prog)
            campuses_by_name[key]["academic_programs"] = list(
                programs_by_name.values()
            )

    final_json["campuses"] = list(campuses_by_name.values())

    # merge warnings
    all_warnings = []
    for other_json in json_list:
        meta = other_json.get("metadata")
        if isinstance(meta, dict):
            for w in (meta.get("warnings") or []):
                if w not in all_warnings:
                    all_warnings.append(w)

    if not isinstance(final_json["metadata"], dict):
        final_json["metadata"] = {}
    final_json["metadata"]["warnings"] = all_warnings

    return final_json


# ─────────────────────────────────────────────────────────────────────────────
# Core entrypoint
# ─────────────────────────────────────────────────────────────────────────────
def normalize(raw_text: str, document_id: str, doc_type: str,
              extraction_method: str, file_path: str) -> dict:
    """
    Send the extracted text to the LLM and return a parsed JSON dict.
    Supports splitting long text into page-level chunks to respect TPM limits,
    sequentially processing each chunk, and merging the resulting parsed structures.
    Raises ValueError if the LLM response cannot be parsed.
    """
    CHUNK_SIZE_LIMIT = 16000  # Optimized character limit (~4k tokens)

    if len(raw_text) <= CHUNK_SIZE_LIMIT:
        chunks = [raw_text]
    else:
        chunks = _chunk_text_by_pages(raw_text, CHUNK_SIZE_LIMIT)

    parsed_jsons = []

    for idx, chunk in enumerate(chunks):
        # Page-aware truncation as a fallback safety
        truncated = _truncate_text(chunk, CHUNK_SIZE_LIMIT)

        chunk_info = f" (Chunk {idx+1}/{len(chunks)})" if len(chunks) > 1 else ""
        logging.info(f"Normalizing document text{chunk_info} with length {len(truncated)} characters.")

        user_message = build_user_message(truncated)

        if LLM_PROVIDER == "bedrock":
            raw_response = _call_bedrock(user_message)
        else:
            raise ValueError(f"Unknown LLM provider: {LLM_PROVIDER}")

        parsed_json = _parse_json_response(raw_response)
        parsed_jsons.append(parsed_json)

    # Merge results from all chunks
    if len(parsed_jsons) == 1:
        final_json = parsed_jsons[0]
    else:
        final_json = _merge_chunk_jsons(parsed_jsons)

    # Post-processing normalization: Ensure valid campuses array and adapt root-level programs
    if not isinstance(final_json.get("campuses"), list) or not final_json.get("campuses"):
        final_json["campuses"] = [{"name": None, "academic_programs": []}]

    for campus in final_json["campuses"]:
        if isinstance(campus, dict):
            if "academic_programs" not in campus or not isinstance(campus.get("academic_programs"), list):
                campus["academic_programs"] = []

    root_progs = final_json.pop("programs", None) or final_json.pop("academic_programs", None)
    if root_progs and isinstance(root_progs, list):
        final_json["campuses"][0]["academic_programs"].extend(root_progs)

    # Override/populate metadata fields to match runtime context before validation
    meta = final_json.setdefault("metadata", {})
    meta["document_id"] = document_id
    meta["document_type"] = doc_type
    meta["extraction_method"] = extraction_method
    meta["original_file_path"] = file_path
                                                                                                                        
    # Detect language basic heuristic fallback
    try:
        from langdetect import detect
        language = detect(raw_text[:2000]) if raw_text.strip() else "unknown"
    except Exception:
        language = "unknown"
    meta["language_detected"] = language

    # BUG-15 FIX: removed trailing whitespace; BUG-08 FIX: datetime already imported at top
    meta["extraction_timestamp"] = datetime.utcnow().isoformat() + "Z"
    # Preserve raw OCR text for downstream persistence and UI rendering
    final_json["raw_text"] = raw_text

    return final_json

def _call_bedrock(user_message: str) -> str:
    import boto3

    def _execute():
        client = boto3.client("bedrock-runtime", region_name="us-west-2")
        body = {
            "messages": [
                {"role": "user", "content": [{"text": user_message}]}
            ],
            "system": [{"text": SYSTEM_PROMPT}],
            "inferenceConfig": {
                "temperature": LLM_TEMPERATURE,
                "maxTokens": LLM_MAX_OUTPUT_TOKENS
            }
        }
        response = client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=json.dumps(body)
        )
        result = json.loads(response["body"].read())
        return result["output"]["message"]["content"][0]["text"].strip()

    return _call_with_retry(_execute)

def translate_text(text: str) -> str:
    """Translate raw text to English using the configured LLM."""
    system_prompt = (
        "You are an expert translator. Translate the given text to English. "
        "Maintain any numeric values, costs, percentages, dates, and proper nouns exactly as they are. "
        "Output ONLY the translated English text. Do not include markdown code fences, headers, intro text, or conversational filler."
    )
    user_message = f"Translate the following text to English:\n\n{text}"

    if LLM_PROVIDER == "bedrock":
        import boto3
        def _execute():
            client = boto3.client("bedrock-runtime", region_name="us-west-2")
            body = {
                "messages": [
                    {"role": "user", "content": [{"text": user_message}]}
                ],
                "system": [{"text": system_prompt}],
                "inferenceConfig": {
                    "temperature": 0,
                    "maxTokens": LLM_MAX_OUTPUT_TOKENS
                }
            }
            response = client.invoke_model(
                modelId=BEDROCK_MODEL_ID,
                body=json.dumps(body)
            )
            result = json.loads(response["body"].read())
            return result["output"]["message"]["content"][0]["text"].strip()
        return _call_with_retry(_execute)
    else:
        raise ValueError(f"Unknown LLM provider: {LLM_PROVIDER}")
# =============================================================================
# AWS Lambda Handler
# =============================================================================

import os

def _update_status_failed(doc_id: str, error_message: str):
    if not doc_id or doc_id == "unknown":
        return
    try:
        import boto3
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
    Lambda entry point for the Normalize step.
    """
    doc_id = None
    try:
        file_path = event.get("file_path") or event.get("key") or ""
        doc_id = event.get("document_id") or (os.path.basename(file_path).split("_")[0] if file_path and "_" in os.path.basename(file_path) else os.path.basename(file_path) if file_path else "unknown")
        raw_text = event.get("raw_text") or ""

        # Issue 5: Guard against empty raw_text — prevents sending blank input to Bedrock
        if not raw_text or not raw_text.strip():
            raise ValueError(
                f"[ERROR] raw_text is empty for document_id={doc_id}. "
                "Extraction likely failed upstream. Aborting normalization."
            )
        doc_type = event.get("doc_type") or (os.path.splitext(file_path)[1].lower().lstrip(".") if file_path else "unknown")
        method = event.get("extraction_method") or "unknown"
        normalized = normalize(
            raw_text=raw_text,
            document_id=doc_id,
            doc_type=doc_type,
            extraction_method=method,
            file_path=file_path,
        )
        # Blocker 3: Return document_id and routing keys at top-level so validate.py
        # can resolve them without relying on the nested metadata fallback path.
        return {
            "document_id": doc_id,
            "file_path": file_path,
            "extraction_method": method,
            **normalized,
        }
    except Exception as e:
        print(f"[ERROR] Normalization handler failed: {e}")
        _update_status_failed(doc_id, str(e))
        raise e