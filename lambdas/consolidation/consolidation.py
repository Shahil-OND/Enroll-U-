"""
consolidation.py — Merges partial document results belonging to the same
institution group, identifies conflicts, preserves source documents,
and creates a consolidated review record (DPI Requirement 8).
"""
import json
import os
import re
import uuid
import boto3
from datetime import datetime

try:
    from config import AWS_REGION, BEDROCK_MODEL_ID, LLM_PROVIDER
except ImportError:
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "layers" / "common"))
    from config import AWS_REGION, BEDROCK_MODEL_ID, LLM_PROVIDER

import database


def _clean_str(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', (s or '').lower())


def _match_program_names(name1: str, name2: str) -> bool:
    """Check if two program names match (exact, sanitized, or substring)."""
    if not name1 or not name2:
        return False
    c1, c2 = _clean_str(name1), _clean_str(name2)
    if c1 == c2:
        return True
    if len(c1) > 6 and len(c2) > 6:
        if c1 in c2 or c2 in c1:
            return True
    return False


def consolidate_institution_group(group_id: str, batch_id: str = None, institution_name: str = None) -> dict:
    """
    Main consolidation engine.
    Retrieves all partial documents for group_id, merges information,
    detects conflicts without auto-resolving business values,
    and writes a consolidated pending_review record.
    """
    print(f"[INFO] Consolidating institution group: {group_id}")
    docs = database.get_documents_by_group(group_id)

    if not docs:
        raise ValueError(f"No documents found for institution group '{group_id}'")

    source_docs_info = []
    parsed_docs = []

    for d in docs:
        doc_id = d.get("documentId") or d.get("document_id")
        fname = d.get("filename") or "document"
        stat = d.get("status")

        source_docs_info.append({
            "document_id": doc_id,
            "filename": fname,
            "status": stat,
            "original_file_path": d.get("original_file_path"),
            "confidence_score": float(d.get("confidence_score", 1.0)) if d.get("confidence_score") is not None else 1.0
        })

        ej = d.get("extracted_json")
        if isinstance(ej, str):
            try:
                ej = json.loads(ej)
            except Exception:
                ej = {}

        if isinstance(ej, dict) and ej:
            parsed_docs.append({
                "document_id": doc_id,
                "filename": fname,
                "data": ej,
                "raw_text": d.get("raw_text") or ""
            })

    if not parsed_docs:
        raise ValueError(f"No parsed extraction results available for group '{group_id}'")

    conflicts = []

    # 1. Merge Institution Header
    inst_name = institution_name
    merged_institution = {
        "name": inst_name,
        "website": None,
        "address": {},
        "contact": {},
        "_sources": {}
    }

    for p in parsed_docs:
        doc_id = p["document_id"]
        fname = p["filename"]
        inst_data = p["data"].get("institution") or {}
        if not isinstance(inst_data, dict):
            continue

        if not merged_institution["name"] and inst_data.get("name"):
            merged_institution["name"] = inst_data.get("name")
            merged_institution["_sources"]["name"] = {"document_id": doc_id, "filename": fname}

        if not merged_institution["website"] and inst_data.get("website"):
            merged_institution["website"] = inst_data.get("website")
            merged_institution["_sources"]["website"] = {"document_id": doc_id, "filename": fname}

        addr = inst_data.get("address")
        if isinstance(addr, dict):
            for k in ["street", "city", "state", "country", "zip_code"]:
                if addr.get(k) and not merged_institution["address"].get(k):
                    merged_institution["address"][k] = addr[k]
                    merged_institution["_sources"][f"address.{k}"] = {"document_id": doc_id, "filename": fname}
        elif isinstance(addr, str) and addr and not merged_institution["address"].get("street"):
            merged_institution["address"]["street"] = addr
            merged_institution["_sources"]["address.street"] = {"document_id": doc_id, "filename": fname}

        contact = inst_data.get("contact")
        if isinstance(contact, dict):
            for k in ["email", "phone"]:
                if contact.get(k) and not merged_institution["contact"].get(k):
                    merged_institution["contact"][k] = contact[k]
                    merged_institution["_sources"][f"contact.{k}"] = {"document_id": doc_id, "filename": fname}

    # 2. Merge Campuses and Academic Programs
    merged_campuses = []
    all_programs_collector = []

    for p in parsed_docs:
        doc_id = p["document_id"]
        fname = p["filename"]
        campuses = p["data"].get("campuses") or []
        for campus in campuses:
            if not isinstance(campus, dict):
                continue
            campus_progs = campus.get("academic_programs") or []
            for prog in campus_progs:
                if isinstance(prog, dict) and prog.get("name"):
                    all_programs_collector.append({
                        "source_doc_id": doc_id,
                        "source_filename": fname,
                        "campus_name": campus.get("name") or "Main Campus",
                        "program": prog
                    })

    # Group programs by matching name
    grouped_programs = []
    for item in all_programs_collector:
        prog = item["program"]
        matched_group = None
        for g in grouped_programs:
            if _match_program_names(g["name"], prog.get("name")):
                matched_group = g
                break

        if matched_group is None:
            matched_group = {
                "name": prog.get("name"),
                "entries": []
            }
            grouped_programs.append(matched_group)
        matched_group["entries"].append(item)

    # Merge each program across documents & record conflicts
    consolidated_programs = []
    for g in grouped_programs:
        entries = g["entries"]
        base_item = entries[0]
        base_prog = dict(base_item["program"])
        prog_name = g["name"]

        base_sources = {
            "name": {"document_id": base_item["source_doc_id"], "filename": base_item["source_filename"]}
        }
        base_prog["_sources"] = base_sources

        # Merge scalar attributes & detect conflicts
        for field in ["level", "modality", "duration", "field_of_study", "has_admission_test", "has_scholarship"]:
            values_seen = []
            for e in entries:
                v = e["program"].get(field)
                if v is not None and v != "":
                    values_seen.append({
                        "value": v,
                        "document_id": e["source_doc_id"],
                        "filename": e["source_filename"]
                    })

            if len(values_seen) > 1:
                # Check for conflict
                first_val = values_seen[0]["value"]
                is_conflicting = any(x["value"] != first_val for x in values_seen)
                if is_conflicting:
                    conflicts.append({
                        "field": f"Program '{prog_name}'.{field}",
                        "program_name": prog_name,
                        "property": field,
                        "description": f"Conflicting values for {field} in program '{prog_name}'",
                        "values": values_seen,
                        "selected_value": first_val  # Default to first document, but flagged for operator review
                    })

            if values_seen:
                base_prog[field] = values_seen[0]["value"]
                base_sources[field] = {
                    "document_id": values_seen[0]["document_id"],
                    "filename": values_seen[0]["filename"]
                }

        # Merge Curriculum (deduplicate)
        curriculum_set = set()
        merged_curriculum = []
        for e in entries:
            curr = e["program"].get("curriculum") or []
            for sub in curr:
                if isinstance(sub, str) and sub.strip() and sub.strip().lower() not in curriculum_set:
                    curriculum_set.add(sub.strip().lower())
                    merged_curriculum.append(sub.strip())
        if merged_curriculum:
            base_prog["curriculum"] = merged_curriculum

        # Merge Requirements (deduplicate)
        reqs_set = set()
        merged_reqs = []
        for e in entries:
            reqs = e["program"].get("requirements") or []
            for r in reqs:
                if isinstance(r, str) and r.strip() and r.strip().lower() not in reqs_set:
                    reqs_set.add(r.strip().lower())
                    merged_reqs.append(r.strip())
        if merged_reqs:
            base_prog["requirements"] = merged_reqs

        # Merge Financials & Detect Fee Conflicts (Crucial Business Rule)
        merged_fin = dict(base_prog.get("financials") or {})
        costs_seen = {"tuition_fee": [], "enrollment_fee": []}
        currency_seen = []

        for e in entries:
            fin = e["program"].get("financials") or {}
            c_val = fin.get("currency")
            if c_val:
                currency_seen.append({
                    "value": c_val,
                    "document_id": e["source_doc_id"],
                    "filename": e["source_filename"]
                })

            costs = fin.get("costs") or {}
            for fee_key in ["tuition_fee", "enrollment_fee"]:
                fee_val = costs.get(fee_key)
                if fee_val is not None:
                    try:
                        num_val = float(fee_val)
                        costs_seen[fee_key].append({
                            "value": num_val,
                            "document_id": e["source_doc_id"],
                            "filename": e["source_filename"]
                        })
                    except (ValueError, TypeError):
                        pass

        # Currency conflict check
        if len(currency_seen) > 1 and any(c["value"] != currency_seen[0]["value"] for c in currency_seen):
            conflicts.append({
                "field": f"Program '{prog_name}'.financials.currency",
                "program_name": prog_name,
                "property": "currency",
                "description": f"Conflicting currency for program '{prog_name}'",
                "values": currency_seen,
                "selected_value": currency_seen[0]["value"]
            })
        if currency_seen:
            merged_fin["currency"] = currency_seen[0]["value"]
            base_sources["financials.currency"] = {
                "document_id": currency_seen[0]["document_id"],
                "filename": currency_seen[0]["filename"]
            }

        # Tuition / Enrollment Fee conflict checks
        merged_costs = dict(merged_fin.get("costs") or {})
        for fee_key in ["tuition_fee", "enrollment_fee"]:
            vals = costs_seen[fee_key]
            if len(vals) > 1:
                first_num = vals[0]["value"]
                if any(v["value"] != first_num for v in vals):
                    conflicts.append({
                        "field": f"Program '{prog_name}'.financials.costs.{fee_key}",
                        "program_name": prog_name,
                        "property": fee_key,
                        "description": f"Conflicting {fee_key.replace('_', ' ')} for program '{prog_name}'",
                        "values": vals,
                        "selected_value": first_num  # Crucial: Preserved for operator decision
                    })
            if vals:
                merged_costs[fee_key] = vals[0]["value"]
                base_sources[f"financials.costs.{fee_key}"] = {
                    "document_id": vals[0]["document_id"],
                    "filename": vals[0]["filename"]
                }

        merged_fin["costs"] = merged_costs

        # Installments & Scholarships
        all_installments = []
        for e in entries:
            fin = e["program"].get("financials") or {}
            for inst in (fin.get("payment_installments") or []):
                if isinstance(inst, dict):
                    all_installments.append(inst)
        if all_installments:
            merged_fin["payment_installments"] = all_installments

        all_scholarships = []
        for e in entries:
            fin = e["program"].get("financials") or {}
            for sch in (fin.get("scholarships") or []):
                if isinstance(sch, dict):
                    all_scholarships.append(sch)
        if all_scholarships:
            merged_fin["scholarships"] = all_scholarships

        base_prog["financials"] = merged_fin
        consolidated_programs.append(base_prog)

    # Attach programs to campus
    merged_campuses.append({
        "name": "Main Campus",
        "academic_programs": consolidated_programs
    })

    combined_raw_text = "\n\n=== SOURCE DOCUMENT ===\n\n".join(
        f"--- {p['filename']} ({p['document_id']}) ---\n{p['raw_text']}"
        for p in parsed_docs
    )

    consolidated_json = {
        "institution": merged_institution,
        "campuses": merged_campuses,
        "conflicts": conflicts,
        "source_documents": source_docs_info,
        "metadata": {
            "is_consolidated": True,
            "group_id": group_id,
            "batch_id": batch_id,
            "institution_name": merged_institution["name"] or institution_name or group_id,
            "source_documents_count": len(source_docs_info),
            "conflicts_count": len(conflicts),
            "consolidation_timestamp": datetime.utcnow().isoformat() + "Z"
        }
    }

    consolidated_doc_id = f"cons_{group_id}_{str(uuid.uuid4())[:8]}"

    # Save to DynamoDB with pending_review status and is_consolidated=True
    database.save_consolidated_record(
        consolidated_doc_id=consolidated_doc_id,
        group_id=group_id,
        batch_id=batch_id,
        institution_name=merged_institution["name"] or institution_name,
        consolidated_json=consolidated_json,
        conflicts=conflicts,
        source_documents=source_docs_info,
        confidence=0.90 if not conflicts else 0.70,
        raw_text=combined_raw_text
    )

    return {
        "status": "consolidated",
        "consolidated_document_id": consolidated_doc_id,
        "group_id": group_id,
        "batch_id": batch_id,
        "conflicts_count": len(conflicts),
        "source_documents_count": len(source_docs_info)
    }


def handler(event, context):
    """
    AWS Lambda entrypoint for Consolidation Lambda.
    Triggered by Step Functions EnrollUBatchWorkflow or direct invoke.
    """
    print(f"Received consolidation event: {event}")
    try:
        group_id = event.get("group_id") or event.get("groupId")
        batch_id = event.get("batch_id") or event.get("batchId")
        inst_name = event.get("institution_name") or event.get("institutionName")

        if not group_id and "groups" in event and isinstance(event["groups"], list):
            # Batch mode: consolidate each group in array
            results = []
            for g in event["groups"]:
                gid = g.get("group_id") or g.get("groupId")
                g_inst = g.get("institution_name") or g.get("institutionName")
                if gid:
                    res = consolidate_institution_group(gid, batch_id=batch_id, institution_name=g_inst)
                    results.append(res)
            return {
                "statusCode": 200,
                "status": "batch_consolidated",
                "groups": results
            }

        if not group_id:
            raise ValueError("Missing 'group_id' parameter in consolidation event.")

        res = consolidate_institution_group(group_id, batch_id=batch_id, institution_name=inst_name)
        return {
            "statusCode": 200,
            **res
        }

    except Exception as e:
        print(f"[ERROR] Consolidation failed: {e}")
        return {
            "statusCode": 500,
            "status": "failed",
            "error": str(e)
        }

