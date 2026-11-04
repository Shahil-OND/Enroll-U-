"""
writer.py — Writes an approved, normalized document record into the real
18-table MySQL schema, in strict foreign-key dependency order.

Also provides preview_mapping() — a read-only function that runs the same
mapping logic without writing anything, returning human-readable column names
for the reviewer to inspect before committing.

Insert order (matches FK dependency chain):
  1. academic_institutions  (composite PK: id, lat — lat NEVER NULL)
  2. academic_institution_zones  (per institution — city/state as zone name)
  3. institution_administrators  (per institution — only if contact name present)
  4. campuses
  5. academic_periods        (per program — uses extracted dates, falls back to year range)
  6. academic_programs       (per program)
  7. academic_period_programs (junction, per program)
  8. academic_period_scheduled_payments (per program — installments OR lump-sum, not both)
  9. periods                 (per curriculum subject, per program)

FIXES APPLIED (vs. original version):
- academic_institutions: now writes country_id resolved from address.
- academic_institution_zones: new INSERT per institution (city/state as zone name).
- institution_administrators: new INSERT per institution if contact name available.
- campuses: idempotency now checks (institution_id, name) not just institution_id.
- academic_periods: now uses AI-extracted start/end dates; populates
  start_registration_at and end_registration_at; falls back to year range with a note.
- academic_programs: redirect_payment now NULL (was hardcoded 'url').
- periods: new INSERT per curriculum subject (was completely missing — data was lost).
- _write_payments: installments (concept_type=3) and lump-sum tuition (concept_type=2)
  are now mutually exclusive to prevent double-counting. Installment zero-amount guard
  now matches enrollment/tuition guard logic.
- mapper fallback IDs: each resolver now raises RuntimeError if the fallback seed row
  is missing from the DB, instead of silently returning None and crashing on INSERT.
"""
import os
import re
import json
import datetime
import boto3
import pymysql

from mapper import (
    build_full_mapping,
    resolve_institution_lat,
    resolve_country_id,
)


def get_connection():
    """Open a pymysql connection using Lambda environment variables or Secrets Manager."""
    host = os.environ.get("MYSQL_HOST", "localhost")
    port = int(os.environ.get("MYSQL_PORT", 3306))
    user = os.environ.get("MYSQL_USER", "enrollu")
    password = os.environ.get("MYSQL_PASSWORD")
    database = os.environ.get("MYSQL_DATABASE", "enrollu")

    secret_arn = os.environ.get("MYSQL_SECRET_ARN") or os.environ.get("APP_SECRET_ARN")
    if secret_arn and not password:
        try:
            sm_client = boto3.client("secretsmanager")
            res = sm_client.get_secret_value(SecretId=secret_arn)
            secret_data = json.loads(res.get("SecretString", "{}"))
            password = secret_data.get("password") or secret_data.get("MYSQL_PASSWORD") or ""
            if secret_data.get("username"):
                user = secret_data.get("username")
            if secret_data.get("host"):
                host = secret_data.get("host")
            if secret_data.get("dbname") or secret_data.get("database") or secret_data.get("MYSQL_DATABASE"):
                database = secret_data.get("dbname") or secret_data.get("database") or secret_data.get("MYSQL_DATABASE")
        except Exception as e:
            print(f"[WARN] Failed to fetch DB credentials from Secrets Manager: {e}")

    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password or "",
        database=database,
        charset="utf8mb4",
        autocommit=False,
    )


def _format_address(address_obj) -> str | None:
    """Convert the AI-extracted address dict or string to a single string for storage."""
    if isinstance(address_obj, str):
        return address_obj.strip() or None
    if not address_obj or not isinstance(address_obj, dict):
        return None
    parts = filter(None, [
        address_obj.get("street"),
        address_obj.get("city"),
        address_obj.get("state"),
        address_obj.get("country"),
        address_obj.get("zip_code"),
    ])
    result = ", ".join(parts)
    return result or None


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — write_record()
# ─────────────────────────────────────────────────────────────────────────────

def write_record(normalized_data: dict, record_id: str) -> dict:
    """
    Writes institution + zones + admins + campus + approved programs
    + payments + curriculum subjects (periods).

    Idempotent: checks for an existing academic_institutions row via the
    bridge_record:{record_id} marker embedded in the description column before
    inserting a new one. Already-written programs (prog["_written"] == True)
    are skipped, enabling safe re-runs for partial approval flows.

    The entire operation runs inside a single transaction; any exception rolls
    back all changes made during this call.

    Returns a summary dict with per-program mapping notes for the preview layer.
    """
    print("[INFO] Attempting MySQL connection...")
    conn = get_connection()
    print("[INFO] MySQL connection established successfully.")
    cursor = conn.cursor()
    all_notes = []

    try:
        institution_data = normalized_data.get("institution", {}) or {}
        # BUG-02 FIX: removed dead `programs_data` variable (unused since campus refactor)

        # ── 1. academic_institutions (composite PK: id, lat) ────────────────
        print(f"[INFO] Starting Institution insert/lookup section for record_id: {record_id}...")
        cursor.execute(
            "SELECT id FROM academic_institutions WHERE description LIKE %s LIMIT 1",
            (f"%bridge_record:{record_id}%",),
        )
        existing = cursor.fetchone()

        if existing:
            institution_id = existing[0]
            print(f"[INFO] Found existing Institution: institution_id = {institution_id}")
        else:
            lat_notes = []
            lat_value = resolve_institution_lat(institution_data, lat_notes)
            all_notes.extend(lat_notes)

            # Resolve country_id for institution from address
            inst_addr = institution_data.get("address", {}) or {}
            if isinstance(inst_addr, str):
                inst_country = ""
                inst_addr_text = inst_addr
            else:
                inst_country = inst_addr.get("country", "") or ""
                inst_addr_text = " ".join(filter(None, [
                    inst_addr.get("city"),
                    inst_addr.get("state"),
                    inst_addr.get("country"),
                ]))
            country_notes = []
            country_id = resolve_country_id(inst_country, inst_addr_text, cursor, country_notes)
            all_notes.extend(country_notes)

            cursor.execute(
                """INSERT INTO academic_institutions
                   (name, short_name, email, address, url, lat, country_id,
                    is_active, description, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s, NOW(), NOW())""",
                (
                    institution_data.get("name", "Unknown Institution"),
                    (institution_data.get("name") or "")[:191],
                    (institution_data.get("contact") or {}).get("email"),
                    _format_address(institution_data.get("address")),
                    institution_data.get("website"),
                    lat_value,
                    country_id,
                    f"[bridge_record:{record_id}] Imported via Document Intelligence Bridge",
                ),
            )
            institution_id = cursor.lastrowid
            print(f"[INFO] Inserted new Institution: institution_id = {institution_id}")

            # ── 2. academic_institution_zones ────────────────────────────────
            _write_institution_zones(cursor, institution_id, institution_data, all_notes)

            # ── 3. institution_administrators (only if contact name present) ─
            _write_administrators(cursor, institution_id, institution_data, all_notes)

        print(f"[INFO] Completed Institution section: institution_id = {institution_id}")

        # ── 4. campuses & nested academic_programs ───────────────────────────
        campuses_data = normalized_data.get("campuses", []) or []
        if not campuses_data:
            # Fallback for legacy format with flat programs array
            legacy_programs = normalized_data.get("programs", []) or []
            if legacy_programs:
                campuses_data = [
                    {
                        "name": institution_data.get("name") or "Main Campus",
                        "address": _format_address(institution_data.get("address")),
                        "email": (institution_data.get("contact") or {}).get("email"),
                        "academic_programs": legacy_programs
                    }
                ]

        programs_written = 0
        program_summaries = []
        last_campus_id = None

        for campus_item in campuses_data:
            campus_name = campus_item.get("name") or institution_data.get("name") or "Main Campus"
            campus_email = campus_item.get("email") or (institution_data.get("contact") or {}).get("email")
            campus_address = campus_item.get("address") or _format_address(institution_data.get("address"))

            print(f"[INFO] Starting Campus insert/lookup section for institution_id: {institution_id}, name: {campus_name}...")
            cursor.execute(
                "SELECT id FROM campuses WHERE academic_institution_id = %s AND name = %s LIMIT 1",
                (institution_id, campus_name),
            )
            existing_campus = cursor.fetchone()

            if existing_campus:
                campus_id = existing_campus[0]
                print(f"[INFO] Found existing Campus: campus_id = {campus_id}")
            else:
                cursor.execute(
                    """INSERT INTO campuses
                       (academic_institution_id, name, email, address, is_active,
                        created_at, updated_at)
                       VALUES (%s, %s, %s, %s, 1, NOW(), NOW())""",
                    (
                        institution_id,
                        campus_name,
                        campus_email,
                        campus_address,
                    ),
                )
                campus_id = cursor.lastrowid
                print(f"[INFO] Inserted new Campus: campus_id = {campus_id}")

            last_campus_id = campus_id
            print(f"[INFO] Completed Campus section: campus_id = {campus_id}")

            # Iterate over the academic programs of this campus
            programs_data = campus_item.get("academic_programs", []) or []
            for prog in programs_data:
                # Only write approved programs that haven't been written yet
                if prog.get("approved") is False or prog.get("_written") is True:
                    print(f"[INFO] Skipping program '{prog.get('name')}': approved={prog.get('approved')}, _written={prog.get('_written')}")
                    continue

                mapping = build_full_mapping(prog, institution_data, cursor)
                all_notes.extend([f"'{prog.get('name')}' (Campus: {campus_name}): {n}" for n in mapping["notes"]])

                # ── 5. academic_periods ─────────────────────────────────────────
                print(f"[INFO] Starting Academic Period insert for program '{prog.get('name')}' under campus_id = {campus_id}...")
                acad_period = prog.get("academic_period", {}) or {}
                start_date = acad_period.get("start_date") or acad_period.get("start_at")
                end_date   = acad_period.get("end_date")   or acad_period.get("end_at")
                start_reg  = acad_period.get("start_registration_date") or acad_period.get("start_registration_at")
                end_reg    = acad_period.get("end_registration_date")   or acad_period.get("end_registration_at")

                # Fall back to current-year range only if AI did not extract dates
                year = datetime.datetime.now().year
                if not start_date:
                    start_date = f"{year}-01-01"
                    all_notes.append(
                        f"'{prog.get('name')}': academic_period.start_date not extracted — defaulted to {year}-01-01"
                    )
                if not end_date:
                    end_date = f"{year}-12-31"
                    all_notes.append(
                        f"'{prog.get('name')}': academic_period.end_date not extracted — defaulted to {year}-12-31"
                    )

                cursor.execute(
                    """INSERT INTO academic_periods
                       (campus_id, periodicity_id, title,
                        start_registration_at, end_registration_at,
                        start_at, end_at, is_active, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, 1, NOW(), NOW())""",
                    (
                        campus_id,
                        mapping["periodicity_id"],
                        f"{(prog.get('name') or '')[:150]} — {year}",
                        start_reg,
                        end_reg,
                        start_date,
                        end_date,
                    ),
                )
                period_id = cursor.lastrowid
                print(f"[INFO] Completed Academic Period insert: period_id = {period_id}")

                # ── 6. academic_programs ────────────────────────────────────────
                print(f"[INFO] Starting Academic Program insert for '{prog.get('name')}' under campus_id = {campus_id}...")
                requirements_text = None
                if prog.get("requirements"):
                    req = prog["requirements"]
                    requirements_text = "\n".join(req) if isinstance(req, list) else str(req)

                financials = prog.get("financials", {}) or {}
                scholarships = financials.get("scholarships", []) or []

                cursor.execute(
                    """INSERT INTO academic_programs
                       (academic_institution_id, campus_id, academic_degree_id,
                        periodicity_id, study_area_id, modality_id, name, short_name,
                        duration, rvoe, requirements, has_scholarship, is_active,
                        redirect_payment, created_at, updated_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, NULL, NOW(), NOW())""",
                    (
                        institution_id,
                        campus_id,
                        mapping["academic_degree_id"],
                        mapping["periodicity_id"],
                        mapping["study_area_id"],       # nullable — fine
                        mapping["modality_id"],
                        prog.get("name", "Unknown Program"),
                        (prog.get("name") or "")[:191],
                        prog.get("duration"),
                        prog.get("rvoe"),               # nullable
                        requirements_text,
                        1 if scholarships else 0,
                    ),
                )
                program_id = cursor.lastrowid
                print(f"[INFO] Completed Academic Program insert: program_id = {program_id}")

                # ── 7. academic_period_programs — junction table ─────────────────
                cursor.execute(
                    """INSERT INTO academic_period_programs
                       (academic_period_id, academic_program_id) VALUES (%s, %s)""",
                    (period_id, program_id),
                )

                # ── 8. academic_period_scheduled_payments ─────────────────────────
                print(f"[INFO] Starting Payments insert for program_id = {program_id}, period_id = {period_id}...")
                _write_payments(cursor, period_id, program_id, mapping["currency_id"], prog)
                print(f"[INFO] Completed Payments insert for program_id = {program_id}")

                # ── 9. periods — curriculum subjects ──────────────────────────────
                print(f"[INFO] Starting Curriculum (Periods) insert for program_id = {program_id}...")
                _write_periods(cursor, program_id, prog)
                print(f"[INFO] Completed Curriculum (Periods) insert for program_id = {program_id}")

                # Mark as written — idempotent re-run guard
                prog["_written"] = True
                programs_written += 1
                program_summaries.append({
                    "name": prog.get("name"),
                    "program_id": program_id,
                    "period_id": period_id,
                    "mapping": mapping,
                })

        print("[INFO] Executing conn.commit()...")
        conn.commit()
        print("[INFO] conn.commit() completed successfully.")

        return {
            "institution_id": institution_id,
            "campus_id": last_campus_id,
            "programs_written": programs_written,
            "program_summaries": program_summaries,
            "notes": all_notes,
        }

    except Exception as e:
        print(f"[INFO] Executing conn.rollback() due to exception: {e}")
        conn.rollback()
        print("[INFO] conn.rollback() completed.")
        raise
    finally:
        cursor.close()
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Per-record write helpers
# ─────────────────────────────────────────────────────────────────────────────

def _write_institution_zones(cursor, institution_id: int, institution_data: dict, notes: list):
    """
    Inserts a row into academic_institution_zones.
    BUG-04 FIX: checks for an existing zone row before inserting to prevent
    duplicate rows on retry/re-run.
    """
    addr = institution_data.get("address", {}) or {}
    zone_name = addr.get("city") or addr.get("state") or addr.get("country")
    if not zone_name:
        notes.append("academic_institution_zones: skipped — no city/state/country in extracted address")
        return
    # Idempotency: skip if a zone with this name already exists for this institution
    cursor.execute(
        "SELECT id FROM academic_institution_zones WHERE academic_institution_id = %s AND name = %s LIMIT 1",
        (institution_id, str(zone_name)[:191]),
    )
    if cursor.fetchone():
        notes.append(f"academic_institution_zones: skipped — zone '{zone_name}' already exists")
        return
    cursor.execute(
        """INSERT INTO academic_institution_zones
           (academic_institution_id, name, created_at, updated_at)
           VALUES (%s, %s, NOW(), NOW())""",
        (institution_id, str(zone_name)[:191]),
    )


def _write_administrators(cursor, institution_id: int, institution_data: dict, notes: list):
    """
    Inserts a row into institution_administrators if the brochure extracted
    a contact person with a name AND email (both NOT NULL in schema).
    Splits 'Full Name' into first_name and last_name on the first space.
    Skips gracefully on duplicate email (UNIQUE KEY constraint).
    """
    contact = institution_data.get("contact", {}) or {}
    email = contact.get("email")
    contact_name = contact.get("name") or contact.get("contact_name")

    if not email or not contact_name:
        notes.append(
            "institution_administrators: skipped — contact name or email not present in extracted data"
        )
        return

    name_parts = str(contact_name).strip().split(" ", 1)
    first_name = name_parts[0][:191]
    last_name  = (name_parts[1] if len(name_parts) > 1 else ".")[:191]

    try:
        cursor.execute(
            """INSERT INTO institution_administrators
               (academic_institution_id, first_name, last_name, email,
                is_active, type_user, created_at, updated_at)
               VALUES (%s, %s, %s, %s, 1, 1, NOW(), NOW())""",
            (institution_id, first_name, last_name, email),
        )
    except Exception as e:
        # Duplicate email is common across documents — skip gracefully
        notes.append(f"institution_administrators: skipped for '{email}' — {e}")


def _write_periods(cursor, program_id: int, prog: dict):
    """
    Inserts rows into the `periods` table — one row per curriculum subject.

    Maps prog["curriculum"] (which can be a list of strings OR a list of dicts) to
    individual (period_number, academic_subject) rows.
    """
    curriculum = prog.get("curriculum", []) or []
    if not curriculum:
        return

    for term_entry in curriculum:
        if isinstance(term_entry, dict):
            term_str = str(term_entry.get("term_or_semester", "0"))
            digits = re.findall(r"\d+", term_str)
            period_number = int(digits[0]) if digits else 0

            courses = term_entry.get("courses", []) or []
            for course in courses:
                if not course or not str(course).strip():
                    continue
                cursor.execute(
                    """INSERT INTO periods
                       (academic_program_id, period_number, academic_subject,
                        created_at, updated_at)
                       VALUES (%s, %s, %s, NOW(), NOW())""",
                    (program_id, period_number, str(course).strip()[:191]),
                )
        elif isinstance(term_entry, str):
            if not term_entry.strip():
                continue
            cursor.execute(
                """INSERT INTO periods
                   (academic_program_id, period_number, academic_subject,
                    created_at, updated_at)
                   VALUES (%s, %s, %s, NOW(), NOW())""",
                (program_id, 0, term_entry.strip()[:191]),
            )


def _write_payments(cursor, period_id: int, program_id: int, currency_id: int, prog: dict):
    """
    Inserts rows into academic_period_scheduled_payments.
    currency_id is NOT NULL — guaranteed non-null from mapper.resolve_currency_id().

    concept_type values used:
      1 = Enrollment / Registration fee
      2 = Lump-sum tuition (used only when NO installments are present)
      3 = Individual installment (used instead of lump-sum when installments present)

    FIX: installments and lump-sum tuition are now mutually exclusive —
    if installments exist, write ONLY the installments (concept_type=3).
    If no installments exist, write the lump-sum tuition_fee (concept_type=2).
    This prevents double-counting the tuition amount.
    """
    financials = prog.get("financials", {}) or {}
    costs = financials.get("costs", {}) or {}
    installments = financials.get("payment_installments", []) or []

    enrollment_fee = costs.get("enrollment_fee")
    tuition_fee    = costs.get("tuition_fee")
    scholarships   = financials.get("scholarships", []) or []
    has_scholarship = 1 if scholarships else 0

    # Enrollment fee row (concept_type=1) — always write if present and non-zero
    if enrollment_fee is not None and enrollment_fee > 0:
        cursor.execute(
            """INSERT INTO academic_period_scheduled_payments
               (academic_period_id, academic_program_id, currency_id, concept_type,
                concept, amount, discount_type, discount, has_scholarship,
                created_at, updated_at)
               VALUES (%s, %s, %s, 1, %s, %s, 0, 0, 0, NOW(), NOW())""",
            (period_id, program_id, currency_id,
             "Enrollment / Registration fee",
             enrollment_fee),
        )

    if installments:
        # Installments present — write as concept_type=3 (do NOT also write tuition_fee)
        for inst in installments:
            if not isinstance(inst, dict):
                continue
            amount = inst.get("amount")
            if amount is None or amount <= 0:
                # Skip zero or null installment amounts (matches enrollment/tuition guard)
                continue
            cursor.execute(
                """INSERT INTO academic_period_scheduled_payments
                   (academic_period_id, academic_program_id, currency_id, concept_type,
                    concept, amount, discount_type, discount, has_scholarship,
                    created_at, updated_at)
                   VALUES (%s, %s, %s, 3, %s, %s, 0, 0, %s, NOW(), NOW())""",
                (period_id, program_id, currency_id,
                 f"Installment #{inst.get('installment_number', '?')}",
                 amount,
                 has_scholarship),
            )
    elif tuition_fee is not None and tuition_fee > 0:
        # No installments — write lump-sum tuition as concept_type=2
        cursor.execute(
            """INSERT INTO academic_period_scheduled_payments
               (academic_period_id, academic_program_id, currency_id, concept_type,
                concept, amount, discount_type, discount, has_scholarship,
                created_at, updated_at)
               VALUES (%s, %s, %s, 2, %s, %s, 0, 0, %s, NOW(), NOW())""",
            (period_id, program_id, currency_id,
             "Tuition",
             tuition_fee,
             has_scholarship),
        )


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — preview_mapping()
# ─────────────────────────────────────────────────────────────────────────────

def preview_mapping(normalized_data: dict) -> dict:
    """
    Read-only — runs the SAME mapping logic as write_record but NEVER inserts.
    Used by the frontend preview layer so the reviewer can see exactly
    which table/column each field will land in before committing.

    Resolves raw integer IDs to human-readable names so non-technical
    reviewers can sanity-check the mapping without knowing the DB IDs.
    """
    conn = get_connection()
    cursor = conn.cursor()

    try:
        institution_data = normalized_data.get("institution", {}) or {}

        lat_notes = []
        lat_value = resolve_institution_lat(institution_data, lat_notes)

        inst_addr = institution_data.get("address", {}) or {}
        inst_country = inst_addr.get("country", "") or ""
        inst_addr_text = " ".join(filter(None, [
            inst_addr.get("city"),
            inst_addr.get("state"),
            inst_addr.get("country"),
        ]))
        country_notes = []
        country_id = resolve_country_id(inst_country, inst_addr_text, cursor, country_notes)

        campuses_data = normalized_data.get("campuses", []) or []
        if not campuses_data:
            # Fallback for legacy format with flat programs array
            legacy_programs = normalized_data.get("programs", []) or []
            if legacy_programs:
                campuses_data = [
                    {
                        "name": institution_data.get("name") or "Main Campus",
                        "address": _format_address(institution_data.get("address")),
                        "email": (institution_data.get("contact") or {}).get("email"),
                        "academic_programs": legacy_programs
                    }
                ]

        preview = {
            "academic_institutions": {
                "name": institution_data.get("name"),
                "short_name": (institution_data.get("name") or "")[:191],
                "email": (institution_data.get("contact") or {}).get("email"),
                "address": _format_address(institution_data.get("address")),
                "url": institution_data.get("website"),
                "lat": lat_value,
                "country_id": country_id,
                "_notes": lat_notes + country_notes,
            },
            "academic_institution_zones": {
                "zone_name": inst_addr.get("city") or inst_addr.get("state"),
            },
            "campuses": [
                {
                    "name": c.get("name") or institution_data.get("name") or "Main Campus",
                    "email": c.get("email") or (institution_data.get("contact") or {}).get("email"),
                    "address": c.get("address") or _format_address(institution_data.get("address")),
                }
                for c in campuses_data
            ],
            "programs": [],
        }

        # BUG-14 FIX: define _name_for once outside the program loop, not on every iteration
        def _name_for(table, row_id):
            if row_id is None:
                return None
            cursor.execute(f"SELECT name FROM `{table}` WHERE id = %s", (row_id,))
            row = cursor.fetchone()
            return row[0] if row else f"[unknown id {row_id}]"

        for campus_item in campuses_data:
            campus_name = campus_item.get("name") or institution_data.get("name") or "Main Campus"
            for prog in (campus_item.get("academic_programs", []) or []):
                mapping = build_full_mapping(prog, institution_data, cursor)

                financials  = prog.get("financials", {}) or {}
                costs       = financials.get("costs", {}) or {}
                scholarships = financials.get("scholarships", []) or []
                curriculum  = prog.get("curriculum", []) or []
                acad_period = prog.get("academic_period", {}) or {}

                subjects = []
                for term in curriculum:
                    if isinstance(term, dict):
                        subjects.extend(term.get("courses", []) or [])
                    elif isinstance(term, str):
                        subjects.append(term)

                preview["programs"].append({
                    "name": prog.get("name"),
                    "approved": prog.get("approved"),
                    "academic_programs": {
                        "name": prog.get("name"),
                        "duration": prog.get("duration"),
                        "academic_degree_id": mapping["academic_degree_id"],
                        "academic_degree_name": _name_for("academic_degrees", mapping["academic_degree_id"]),
                        "modality_id": mapping["modality_id"],
                        "modality_name": _name_for("modalities", mapping["modality_id"]),
                        "periodicity_id": mapping["periodicity_id"],
                        "periodicity_name": _name_for("periodicities", mapping["periodicity_id"]),
                        "study_area_id": mapping["study_area_id"],
                        "study_area_name": _name_for("study_areas", mapping["study_area_id"]) if mapping["study_area_id"] else None,
                        "has_scholarship": 1 if scholarships else 0,
                    },
                    "academic_periods": {
                        "start_at": acad_period.get("start_date") or acad_period.get("start_at"),
                        "end_at": acad_period.get("end_date") or acad_period.get("end_at"),
                        "start_registration_at": acad_period.get("start_registration_date"),
                        "end_registration_at": acad_period.get("end_registration_date"),
                    },
                    "academic_period_scheduled_payments": {
                        "currency_id": mapping["currency_id"],
                        "currency_name": _name_for("currencies", mapping["currency_id"]),
                        "enrollment_fee": costs.get("enrollment_fee"),
                        "tuition_fee": costs.get("tuition_fee"),
                        "total_cost": costs.get("total_cost"),
                        "materials_fee": costs.get("materials_fee"),
                        "installment_count": len(financials.get("payment_installments", []) or []),
                    },
                    "periods_curriculum": {
                        "subject_count": len(subjects),
                        "subjects": subjects[:10],  # preview first 10 only
                    },
                    "_notes": [f"Campus: {campus_name}"] + mapping["notes"],
                })

        return preview

    finally:
        cursor.close()
        conn.close()


def handler(event, context):
    """
    AWS Lambda entry point for EnrollU-MySqlWriter.
    Accepts normalized document JSON (or event containing 'document_id' and payload).
    """
    print(f"[EnrollU-MySqlWriter] Received event: {event}")
    document_id = event.get('document_id', 'unknown') if isinstance(event, dict) else 'unknown'
    try:
        res = write_record(event if isinstance(event, dict) else {}, document_id)
        headers = {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "POST,OPTIONS"
        }
        body_str = json.dumps(res, ensure_ascii=False) if not isinstance(res, str) else res
        return {
            'statusCode': 200,
            'headers': headers,
            'body': body_str
        }
    except Exception as e:
        print(f"[EnrollU-MySqlWriter] Error writing record: {e}")
        raise e
