"""
validators.py — Individual rule functions for the validate Lambda.

Split from validator.py to match the CDK common dir structure.
validate.py is the Lambda entry orchestration; this module holds
all the rule functions, schema definition, and the confidence scoring logic.

Addition vs. prototype:
- check_currency_resolvable() is a new HARD warning (not just MISSING)
  because currency_id is NOT NULL in the real MySQL schema — an unresolvable
  currency will cause every academic_period_scheduled_payments insert to fail.
"""
from datetime import datetime
from jsonschema import Draft7Validator

# ─────────────────────────────────────────────────────────────────────────────
# Full JSON Schema for validation
# ─────────────────────────────────────────────────────────────────────────────
ACADEMIC_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AcademicProgramCostUpdate",
    "type": "object",
    "properties": {
        "institution": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "address": {
                    "type": "object",
                    "properties": {
                        "street": {"type": ["string", "null"]},
                        "city": {"type": "string"},
                        "state": {"type": ["string", "null"]},
                        "country": {"type": "string"},
                        "zip_code": {"type": ["string", "null"]},
                    },
                    "required": ["city", "country"],
                },
                "website": {"type": ["string", "null"]},
                "contact": {
                    "type": "object",
                    "properties": {
                        "email": {"type": ["string", "null"]},
                        "phone": {"type": ["string", "null"]},
                    },
                },
            },
            "required": ["name"],
        },
        "campuses": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": ["string", "null"]},
                    "short_name": {"type": ["string", "null"]},
                    "address": {"type": ["string", "null"]},
                    "phone": {"type": ["string", "null"]},
                    "email": {"type": ["string", "null"]},
                    "description": {"type": ["string", "null"]},
                    "academic_programs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "approved": {"type": ["boolean", "null"]},
                                "level": {
                                    "type": ["string", "null"],
                                    "enum": ["Undergraduate","Postgraduate","Diploma","Certificate",
                                             "MBA","PhD","Technical","Baccalaureate","Language",
                                             "Course","Primary","Secondary","Preschool","Other", None],
                                },
                                "field_of_study": {"type": ["string", "null"]},
                                "modality": {
                                    "type": ["string", "null"],
                                    "enum": ["On-site", "Online", "Hybrid", None],
                                },
                                "language_of_instruction": {"type": ["string", "null"]},
                                "duration": {"type": ["string", "null"]},
                                "schedule": {"type": ["string", "null"]},
                                "requirements": {"type": "array", "items": {"type": "string"}},
                                "curriculum": {
                                    "type": "array",
                                    "items": {
                                        "anyOf": [
                                            {"type": "string"},
                                            {
                                                "type": "object",
                                                "properties": {
                                                    "term_or_semester": {"type": "string"},
                                                    "courses": {"type": "array", "items": {"type": "string"}},
                                                },
                                                "required": ["term_or_semester", "courses"],
                                            }
                                        ]
                                    },
                                },
                                "academic_period": {
                                    "type": "object",
                                    "properties": {
                                        "period_name": {"type": ["string", "null"]},
                                        "period_type": {
                                            "type": ["string", "null"],
                                            "enum": ["Semester","Trimester","Monthly","Annual","Quarterly","Weekly","Other", None],
                                        },
                                        "start_date": {"type": ["string", "null"]},
                                        "end_date": {"type": ["string", "null"]},
                                        "application_deadline": {"type": ["string", "null"]},
                                    },
                                },
                                "financials": {
                                    "type": "object",
                                    "properties": {
                                        "currency": {
                                            "type": ["string", "null"],
                                            "enum": ["MXN","BRL","USD","EUR","COP","ARS","CLP","PEN", None],
                                        },
                                        "costs": {
                                            "type": "object",
                                            "properties": {
                                                "enrollment_fee": {"type": ["number", "null"]},
                                                "tuition_fee": {"type": ["number", "null"]},
                                                "total_cost": {"type": ["number", "null"]},
                                                "materials_fee": {"type": ["number", "null"]},
                                            },
                                        },
                                        "payment_installments": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "installment_number": {"type": "integer"},
                                                    "amount": {"type": "number"},
                                                    "due_date": {"type": ["string", "null"]},
                                                },
                                                "required": ["installment_number", "amount"],
                                            },
                                        },
                                        "scholarships": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "properties": {
                                                    "title": {"type": ["string", "null"]},
                                                    "description": {"type": ["string", "null"]},
                                                    "discount_percentage": {"type": ["number", "null"]},
                                                },
                                            },
                                        },
                                    },
                                    "required": ["currency"],
                                },
                            },
                            "required": ["name"],
                        },
                    },
                },
            },
        },
        "metadata": {
            "type": "object",
            "properties": {
                "document_id": {"type": "string"},
                "document_type": {
                    "type": "string",
                    # BUG-10 FIX: added 'pdf' to match what the extractor Lambda actually sets
                    "enum": ["pdf", "pdf_digital", "pdf_scanned", "docx", "xlsx", "image"],
                },
                "language_detected": {"type": "string"},
                "extraction_method": {
                    "type": "string",
                    "enum": ["pymupdf","amazon-textract","python-docx","openpyxl","pass-through"],
                },
                "confidence_score": {"type": ["number", "null"], "minimum": 0, "maximum": 1},
                "warnings": {"type": "array", "items": {"type": "string"}},
                "extraction_timestamp": {"type": "string"},
                "original_file_path": {"type": "string"},
            },
            # BUG-11 FIX: removed 'confidence_score' from required[] — it is injected
            # by validate.py AFTER schema validation runs, so it is never present at
            # the moment the schema check executes, causing a guaranteed spurious warning.
            "required": [
                "document_id", "document_type", "language_detected",
                "extraction_timestamp", "original_file_path",
            ],
        },
    },
    "required": ["institution","campuses","metadata"],
}

# Optional fields — generate warnings when these are null
OPTIONAL_BUT_EXPECTED = [
    "institution.address.city",
    "institution.address.country",
    "campuses",
]

# Known currencies that the mapper can resolve to a currency_id.
# Derived dynamically from mapper.CURRENCY_KEYWORDS so this set never drifts
# out of sync when new currencies are added to mapper.py.
try:
    from mapper import CURRENCY_KEYWORDS as _CURRENCY_KEYWORDS
    KNOWN_RESOLVABLE_CURRENCIES = set(_CURRENCY_KEYWORDS.keys())
except ImportError:
    # Fallback if mapper is not on the path (e.g. during unit testing without full Lambda env)
    KNOWN_RESOLVABLE_CURRENCIES = {"MXN", "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "INR", "BRL", "COP", "ARS"}

CURRENCY_RANGES = {
    "MXN": (500, 500_000),
    "COP": (100_000, 50_000_000),
    "BRL": (200, 80_000),
    "USD": (100, 100_000),
    "ARS": (10_000, 5_000_000),
    "EUR": (100, 50_000),
}


def run_schema_validation(data: dict) -> list[str]:
    """Run JSON schema validation and return a list of [SCHEMA] warning strings."""
    validator = Draft7Validator(ACADEMIC_SCHEMA)
    schema_errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    warnings = []
    for err in schema_errors:
        path = " > ".join(str(p) for p in err.path) or "root"
        warnings.append(f"[SCHEMA] {path}: {err.message}")
    return warnings, schema_errors


def check_fees(prog: dict) -> list[str]:
    """Validate fee values: negative amounts, currency ranges, math mismatch."""
    warnings = []
    prog_name = prog.get("name", "Unknown Program")
    p_fin = prog.get("financials", {}) or {}
    p_costs = p_fin.get("costs", {}) or {}

    enrollment = p_costs.get("enrollment_fee")
    tuition = p_costs.get("tuition_fee")
    materials = p_costs.get("materials_fee")
    total = p_costs.get("total_cost")
    currency = p_fin.get("currency")

    # Negative fees
    for fee_name, fee_val in [("enrollment_fee", enrollment), ("tuition_fee", tuition),
                               ("materials_fee", materials), ("total_cost", total)]:
        if fee_val is not None and fee_val < 0:
            warnings.append(f"[BUSINESS] ({prog_name}) {fee_name} is negative ({fee_val})")

    # Currency range validation
    if currency and currency in CURRENCY_RANGES:
        lo, hi = CURRENCY_RANGES[currency]
        for fee_name, fee_val in [("enrollment_fee", enrollment), ("tuition_fee", tuition)]:
            if fee_val is not None:
                if fee_val < lo:
                    warnings.append(f"[BUSINESS] ({prog_name}) {fee_name} ({fee_val} {currency}) seems unusually low")
                if fee_val > hi:
                    warnings.append(f"[BUSINESS] ({prog_name}) {fee_name} ({fee_val} {currency}) seems unusually high")

    # Fee math mismatch
    if all(v is not None for v in [enrollment, tuition, total]):
        computed = (enrollment or 0) + (tuition or 0) + (materials or 0)
        if total and abs(computed - total) > 1.0:
            warnings.append(
                f"[BUSINESS] ({prog_name}) Fee math mismatch: "
                f"enrollment({enrollment}) + tuition({tuition}) + materials({materials}) "
                f"= {computed} != total_cost({total})"
            )

    # Installment sum check
    installments = p_fin.get("payment_installments", [])
    if tuition is not None and installments:
        total_inst_amount = sum(inst.get("amount", 0) for inst in installments if inst.get("amount") is not None)
        expected_tuition = tuition
        expected_total = (tuition or 0) + (enrollment or 0)
        if abs(total_inst_amount - expected_tuition) > 1.0 and abs(total_inst_amount - expected_total) > 1.0:
            warnings.append(
                f"[BUSINESS] ({prog_name}) Installment sum mismatch: sum of installments ({total_inst_amount}) "
                f"does not match tuition_fee ({expected_tuition}) or total_cost ({expected_total})"
            )

    return warnings


def check_dates(prog: dict) -> list[str]:
    """Validate date formats and logical order."""
    warnings = []
    prog_name = prog.get("name", "Unknown Program")
    p_period = prog.get("academic_period", {}) or {}

    start_str = p_period.get("start_date")
    end_str = p_period.get("end_date")
    deadline_str = p_period.get("application_deadline")

    dates_ok = True
    for date_name, date_str in [("start_date", start_str), ("end_date", end_str), ("application_deadline", deadline_str)]:
        if date_str:
            try:
                datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                warnings.append(f"[BUSINESS] ({prog_name}) {date_name} ({date_str}) is not in YYYY-MM-DD format")
                dates_ok = False

    if dates_ok:
        if start_str and end_str:
            start_dt = datetime.strptime(start_str, "%Y-%m-%d")
            end_dt = datetime.strptime(end_str, "%Y-%m-%d")
            if start_dt >= end_dt:
                warnings.append(f"[BUSINESS] ({prog_name}) start_date ({start_str}) >= end_date ({end_str})")

    return warnings


def check_required_fields(prog: dict) -> list[str]:
    """Warn about expected-but-missing per-program fields."""
    warnings = []
    prog_name = prog.get("name", "Unknown Program")
    p_fin = prog.get("financials", {}) or {}
    p_costs = p_fin.get("costs", {}) or {}
    p_period = prog.get("academic_period", {}) or {}

    if not p_fin or not p_fin.get("currency"):
        warnings.append(f"[MISSING] ({prog_name}) financials.currency is null or empty")
    if p_costs.get("tuition_fee") is None:
        warnings.append(f"[MISSING] ({prog_name}) financials.costs.tuition_fee is null or empty")
    if not p_period or not p_period.get("period_type"):
        warnings.append(f"[MISSING] ({prog_name}) academic_period.period_type is null or empty")

    return warnings


def check_currency_resolvable(prog: dict) -> list[str]:
    """
    HARD WARNING (new in CDK structure): flags currencies that cannot be mapped to
    a currency_id in the real MySQL schema. currency_id is NOT NULL in
    academic_period_scheduled_payments, so an unresolvable currency means the
    mapper will default to USD and the reviewer MUST verify this manually.
    """
    warnings = []
    prog_name = prog.get("name", "Unknown Program")
    p_fin = prog.get("financials", {}) or {}
    currency = p_fin.get("currency")

    if currency and currency.upper() not in KNOWN_RESOLVABLE_CURRENCIES:
        warnings.append(
            f"[HARD-WARNING] ({prog_name}) financials.currency '{currency}' is not in the known "
            f"resolvable set {sorted(KNOWN_RESOLVABLE_CURRENCIES)}. The mapper will fall back to USD. "
            f"VERIFY MANUALLY before writing to DB."
        )

    return warnings


def compute_confidence(data: dict, schema_errors: list, warnings: list) -> float:
    """Compute a 0-1 confidence score for the extracted document."""
    schema_error_count = len(schema_errors)
    business_warn_count = sum(1 for w in warnings if w.startswith("[BUSINESS]"))
    missing_count = sum(1 for w in warnings if w.startswith("[MISSING]"))

    score = 0.0
    inst = data.get("institution", {})

    # BUG-05 FIX: always gather programs from campuses[] first; only fall back to
    # flat programs[] if campuses is absent (legacy format). Previously the code
    # checked programs[] first, so any stale flat key silently bypassed campus data.
    programs = []
    campuses = data.get("campuses", []) or []
    if campuses:
        for campus in campuses:
            if isinstance(campus, dict):
                for prog in campus.get("academic_programs", []) or []:
                    if isinstance(prog, dict):
                        programs.append(prog)
    if not programs:
        programs = data.get("programs", []) or []

    if inst.get("name"):
        score += 0.20

    if programs:
        prog_score_sum = 0.0
        for prog in programs:
            p_costs = prog.get("financials", {}).get("costs", {}) if prog.get("financials") else {}
            p_fin = prog.get("financials", {}) or {}
            p_period = prog.get("academic_period", {}) or {}

            if prog.get("name"):
                prog_score_sum += 0.20
            if any(p_costs.get(f) for f in ["enrollment_fee", "tuition_fee", "total_cost"]):
                prog_score_sum += 0.20
            if p_fin.get("currency"):
                prog_score_sum += 0.10
            if prog.get("modality"):
                prog_score_sum += 0.10
            if prog.get("duration"):
                prog_score_sum += 0.10
            if prog.get("level"):
                prog_score_sum += 0.05
            if p_period.get("period_type"):
                prog_score_sum += 0.05
        score += prog_score_sum / len(programs)

    penalty = (schema_error_count * 0.10 +
               business_warn_count * 0.08 +
               missing_count * 0.05)

    return round(max(0.0, min(1.0, score - penalty)), 3)


def deduplicate_warnings(all_warnings: list) -> list:
    """Deduplicate warnings, preferring more specific (non-MISSING) ones."""
    def get_warning_key(warning: str) -> str:
        warning_lower = warning.lower()
        if warning.startswith("[MISSING]"):
            parts = warning.split(" ")
            if len(parts) > 1:
                return parts[1].strip()
        if warning.startswith("[SCHEMA]"):
            main_part = warning.split(":")[0]
            path_str = main_part.replace("[SCHEMA]", "").strip()
            return ".".join(p.strip() for p in path_str.split(">"))
        if warning.startswith("[BUSINESS]"):
            if "enrollment_fee" in warning_lower:
                return "financials.costs.enrollment_fee"
            if "tuition_fee" in warning_lower:
                return "financials.costs.tuition_fee"
            if "materials_fee" in warning_lower:
                return "financials.costs.materials_fee"
            if "total_cost" in warning_lower:
                return "financials.costs.total_cost"
            if "fee math mismatch" in warning_lower:
                return "financials.costs.total_cost"
            if "installment sum mismatch" in warning_lower:
                return "financials.payment_installments"
            if "start_date" in warning_lower and "end_date" in warning_lower:
                return "academic_period.date_range"
            if "start_date" in warning_lower:
                return "academic_period.start_date"
            if "end_date" in warning_lower:
                return "academic_period.end_date"
            if "application_deadline" in warning_lower:
                return "academic_period.application_deadline"
        return " ".join(warning.strip().split()).lower()

    seen = {}
    for w in all_warnings:
        key = get_warning_key(w)
        if key not in seen or (seen[key].startswith("[MISSING]") and not w.startswith("[MISSING]")):
            seen[key] = w

    return list(seen.values())


def get_nested(data: dict, keys: list):
    """Safely traverse nested dict by key path."""
    val = data
    for key in keys:
        if isinstance(val, dict):
            val = val.get(key)
        else:
            return None
    return val
