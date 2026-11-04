import re
from typing import Optional


# ── Fallback row keys — these MUST exist in each lookup table after seeding ──
FALLBACK_DEGREE_KEY      = "unclassified"
FALLBACK_PERIODICITY_KEY = "not-specified"
FALLBACK_MODALITY_KEY    = "not-specified"
FALLBACK_CURRENCY_ISO    = "USD"
FALLBACK_COUNTRY_ISO     = None      # country_id IS nullable — no fallback needed
FALLBACK_LAT             = 0.000000  # academic_institutions.lat is NOT NULL


# ── Keyword maps (English + Spanish) — SECONDARY fallback only ──────────────
# Primary matching for degree/modality/periodicity now uses the LLM's own
# already-classified enum fields (level/modality/period_type) via a direct
# key-or-name DB lookup. These keyword maps are kept as a fallback path only,
# for cases where the enum field came through null or didn't match directly.

DEGREE_KEYWORDS = {
    "phd":           ["phd", "doctorado", "doctorate", "doctor of"],
    "master":        ["master", "maestria", "maestría", "msc", "mba", "posgrado", "postgraduate"],
    "bachelor":      ["bachelor", "licenciatura", "undergraduate", "b.sc", "b.a.", "grado", "licence"],
    "specialization":["especialidad", "specialization", "especialización"],
    "diploma":       ["diploma", "diplomado", "graduate diploma", "pgdip"],
    "certificate":   ["certificate", "certificado", "certification"],
    "technical":     ["técnico", "tecnico", "technical", "technician", "tsu"],
    "high_school":   ["preparatoria", "bachillerato", "high school", "a-level"],
    "secondary":     ["secundaria", "secondary school", "middle school"],
    "primary":       ["primaria", "primary school", "elementary"],
    "unclassified":  [],  # fallback seed row — never matched via keywords
}

MODALITY_KEYWORDS = {
    "on-campus": ["presencial", "on-campus", "on campus", "in-person", "escolarizado", "on-site", "onsite"],
    "online":    ["online", "en linea", "en línea", "virtual", "distance", "a distancia"],
    "hybrid":    ["hibrido", "híbrido", "hybrid", "blended", "mixto", "semi-presencial"],
    "executive": ["ejecutivo", "executive", "sabatino"],
}

STUDY_AREA_KEYWORDS = {
    "business":    ["business", "negocios", "administracion", "administración", "mba", "marketing", "finance"],
    "technology":  ["technology", "tecnologia", "tecnología", "computer", "software", "systems", "sistemas"],
    "health":      ["health", "salud", "medicine", "medicina", "nursing", "enfermeria", "mbbs"],
    "law":         ["law", "derecho", "legal", "juridico"],
    "engineering": ["engineering", "ingenieria", "ingeniería", "civil", "mechanical", "industrial"],
    "arts":        ["art", "arte", "design", "diseño", "music", "musica", "film"],
    "sciences":    ["science", "ciencias", "biology", "chemistry", "physics", "mathematics"],
    "humanities":  ["humanities", "humanidades", "history", "philosophy", "literature"],
    "education":   ["education", "educacion", "educación", "pedagogy", "teaching"],
}

PERIODICITY_KEYWORDS = {
    "monthly":   ["month", "mensual", "monthly", "mensualidad"],
    "semester":  ["semester", "semestral", "semestre", "cuatrimestre", "cuatrimestral"],
    "annual":    ["year", "annual", "anual", "yearly", "año"],
    "quarterly": ["quarter", "trimestral", "trimestre"],
    "bimonthly": ["bimestral", "bimestre"],
}

CURRENCY_KEYWORDS = {
    "MXN": ["mxn", "mexico", "méxico", "pesos", "peso mexicano"],
    "USD": ["usd", "dollar", "dolar", "us$", "united states"],
    "EUR": ["eur", "euro", "€"],
    "GBP": ["gbp", "pound", "sterling", "£", "united kingdom"],
    "CAD": ["cad", "canadian", "canada"],
    "AUD": ["aud", "australian", "australia"],
    "NZD": ["nzd", "new zealand"],
    "INR": ["inr", "rupee", "india", "₹"],
    "BRL": ["brl", "real", "brasil", "brazil"],
    "COP": ["cop", "colombia"],
    "ARS": ["ars", "argentina"],
}

COUNTRY_KEYWORDS = {
    "MX": ["mexico", "méxico", "cdmx"],
    "US": ["united states", "usa", "boston", "chicago", "austin"],
    "GB": ["united kingdom", "britain", "london", "manchester"],
    "CA": ["canada", "toronto", "vancouver", "ontario"],
    "AU": ["australia", "sydney", "melbourne"],
    "ES": ["spain", "españa", "madrid"],
    "CO": ["colombia", "bogota"],
    "AR": ["argentina", "buenos aires"],
    "BR": ["brazil", "brasil"],
    "IN": ["india", "mumbai", "delhi"],
    "IE": ["ireland", "dublin"],
    "NZ": ["new zealand", "auckland"],
}


def _match(text: str, keyword_map: dict) -> Optional[str]:
    if not text:
        return None
    lowered = text.lower()
    for key, patterns in keyword_map.items():
        for p in patterns:
            if p in lowered:
                return key
    return None


def _lookup_id(cursor, table: str, key_value: str, key_column: str = "key") -> Optional[int]:
    cursor.execute(f"SELECT id FROM `{table}` WHERE `{key_column}` = %s LIMIT 1", (key_value,))
    row = cursor.fetchone()
    return row[0] if row else None


def _lookup_id_by_iso(cursor, table: str, iso_value: str) -> Optional[int]:
    cursor.execute(f"SELECT id FROM `{table}` WHERE `iso_code` = %s LIMIT 1", (iso_value,))
    row = cursor.fetchone()
    return row[0] if row else None


def _lookup_id_by_name(cursor, table: str, name_value: str) -> Optional[int]:
    cursor.execute(f"SELECT id FROM `{table}` WHERE `name` = %s LIMIT 1", (name_value,))
    row = cursor.fetchone()
    return row[0] if row else None


def _get_name(cursor, table: str, row_id) -> Optional[str]:
    if row_id is None:
        return None
    cursor.execute(f"SELECT name FROM `{table}` WHERE id = %s", (row_id,))
    row = cursor.fetchone()
    return row[0] if row else None


def _resolve_via_key_or_name(cursor, table: str, value: str) -> Optional[int]:
    if not value:
        return None

    # Try exact match on `key` column (case-insensitive, common slug variants)
    for candidate in (value, value.lower(), value.lower().replace(" ", "-"), value.lower().replace(" ", "_")):
        row_id = _lookup_id(cursor, table, candidate)
        if row_id:
            return row_id

    # Try exact match on `name` column (in case the table stores display names)
    row_id = _lookup_id_by_name(cursor, table, value)
    if row_id:
        return row_id

    # Try case-insensitive name match as a last resort
    cursor.execute(f"SELECT id FROM `{table}` WHERE LOWER(`name`) = LOWER(%s) LIMIT 1", (value,))
    row = cursor.fetchone()
    return row[0] if row else None


# ── Public resolver functions — ALL required lookups return a guaranteed non-null int ──
def resolve_degree_id(level: str, program_name: str, cursor, notes: list) -> int:
    if level:
        row_id = _resolve_via_key_or_name(cursor, "academic_degrees", level)
        if row_id:
            return row_id

    # Secondary fallback: keyword match against program name (legacy path)
    matched = _match(program_name, DEGREE_KEYWORDS)
    if matched:
        row_id = _lookup_id(cursor, "academic_degrees", matched)
        if row_id:
            return row_id

    fallback_id = _lookup_id(cursor, "academic_degrees", FALLBACK_DEGREE_KEY)
    if fallback_id is None:
        raise RuntimeError(
            f"Fallback seed row key='{FALLBACK_DEGREE_KEY}' is missing from academic_degrees table. "
            "Run seed_fallbacks.sql or insert the row manually before using mysql_writer."
        )
    notes.append(f"academic_degree_id: could not match level='{level}' or name='{program_name}' — used fallback 'Unclassified'")
    return fallback_id


def resolve_modality_id(modality: str, program_name: str, cursor, notes: list) -> int:
    if modality:
        row_id = _resolve_via_key_or_name(cursor, "modalities", modality)
        if row_id:
            return row_id

    matched = _match(modality or "", MODALITY_KEYWORDS) or _match(program_name, MODALITY_KEYWORDS)
    if matched:
        row_id = _lookup_id(cursor, "modalities", matched)
        if row_id:
            return row_id

    fallback_id = _lookup_id(cursor, "modalities", FALLBACK_MODALITY_KEY)
    if fallback_id is None:
        raise RuntimeError(
            f"Fallback seed row key='{FALLBACK_MODALITY_KEY}' is missing from modalities table. "
            "Run seed_fallbacks.sql or insert the row manually before using mysql_writer."
        )
    notes.append(f"modality_id: could not match modality='{modality}' — used fallback 'Not specified'")
    return fallback_id


def resolve_periodicity_id(period_type: str, cursor, notes: list) -> int:
    if period_type:
        row_id = _resolve_via_key_or_name(cursor, "periodicities", period_type)
        if row_id:
            return row_id

    matched = _match(period_type or "", PERIODICITY_KEYWORDS)
    if matched:
        row_id = _lookup_id(cursor, "periodicities", matched)
        if row_id:
            return row_id

    fallback_id = _lookup_id(cursor, "periodicities", FALLBACK_PERIODICITY_KEY)
    if fallback_id is None:
        raise RuntimeError(
            f"Fallback seed row key='{FALLBACK_PERIODICITY_KEY}' is missing from periodicities table. "
            "Run seed_fallbacks.sql or insert the row manually before using mysql_writer."
        )
    notes.append(f"periodicity_id: could not match period_type='{period_type}' — used fallback 'Not specified'")
    return fallback_id


def resolve_currency_id(currency_code: str, address_text: str, cursor, notes: list) -> int:
    if currency_code:
        row_id = _lookup_id_by_iso(cursor, "currencies", currency_code.upper())
        if row_id:
            return row_id
    matched = _match(f"{currency_code or ''} {address_text or ''}", CURRENCY_KEYWORDS)
    if matched:
        row_id = _lookup_id_by_iso(cursor, "currencies", matched)
        if row_id:
            return row_id
    fallback_id = _lookup_id_by_iso(cursor, "currencies", FALLBACK_CURRENCY_ISO)
    if fallback_id is None:
        raise RuntimeError(
            f"Fallback seed row iso_code='{FALLBACK_CURRENCY_ISO}' is missing from currencies table. "
            "Run seed_fallbacks.sql or insert the row manually before using mysql_writer."
        )
    notes.append(f"currency_id: could not resolve '{currency_code}' — defaulted to USD, VERIFY MANUALLY")
    return fallback_id


def resolve_study_area_id(program_name: str, cursor, notes: list) -> Optional[int]:
    matched = _match(program_name, STUDY_AREA_KEYWORDS)
    if matched:
        row_id = _lookup_id(cursor, "study_areas", matched)
        if row_id:
            return row_id
    notes.append(f"study_area_id: could not match '{program_name}' — left NULL (this field is optional)")
    return None


def resolve_country_id(country: str, address_text: str, cursor, notes: list) -> Optional[int]:
    if country:
        row_id = _lookup_id_by_name(cursor, "countries", country)
        if row_id:
            return row_id
        # Case-insensitive fallback attempt
        cursor.execute("SELECT id FROM `countries` WHERE LOWER(`name`) = LOWER(%s) LIMIT 1", (country,))
        row = cursor.fetchone()
        if row:
            return row[0]

    matched = _match(address_text or "", COUNTRY_KEYWORDS)
    if matched:
        row_id = _lookup_id_by_iso(cursor, "countries", matched)
        if row_id:
            return row_id

    notes.append(f"country_id: could not resolve country='{country}' from address '{address_text}' — left NULL")
    return None


def resolve_institution_lat(institution_data: dict, notes: list) -> float:
    lat = institution_data.get("lat")
    if lat is not None:
        try:
            return float(lat)
        except (TypeError, ValueError):
            pass
    notes.append(
        "lat: not present in extracted data — defaulted to 0.000000, "
        "MUST be corrected manually before this institution is geolocated correctly"
    )
    return FALLBACK_LAT


def build_full_mapping(program: dict, institution: dict, cursor) -> dict:
    notes = []
    program_name = program.get("name", "")
    level        = program.get("level", "") or ""
    modality     = program.get("modality", "") or ""

    addr_obj     = institution.get("address", {}) or {}
    country      = addr_obj.get("country", "") or ""
    address_text = " ".join(filter(None, [
        addr_obj.get("city"),
        addr_obj.get("state"),
        addr_obj.get("country"),
    ]))

    academic_period = program.get("academic_period", {}) or {}
    period_type   = academic_period.get("period_type", "") or ""
    financials    = program.get("financials", {}) or {}
    currency_code = financials.get("currency", "") or ""

    mapping = {
        "academic_degree_id": resolve_degree_id(level, program_name, cursor, notes),
        "modality_id":        resolve_modality_id(modality, program_name, cursor, notes),
        "periodicity_id":     resolve_periodicity_id(period_type, cursor, notes),
        "currency_id":        resolve_currency_id(currency_code, address_text, cursor, notes),
        "study_area_id":      resolve_study_area_id(program_name, cursor, notes),
        "country_id":         resolve_country_id(country, address_text, cursor, notes),
        "lat":                resolve_institution_lat(institution, notes),
        "notes":              notes,
    }

    # Human-readable names for the preview layer — resolved from the same cursor,
    # no extra connection needed since these are tiny lookup tables.
    mapping["academic_degree_name"] = _get_name(cursor, "academic_degrees", mapping["academic_degree_id"])
    mapping["modality_name"]        = _get_name(cursor, "modalities",       mapping["modality_id"])
    mapping["periodicity_name"]     = _get_name(cursor, "periodicities",    mapping["periodicity_id"])
    mapping["study_area_name"]      = _get_name(cursor, "study_areas",      mapping["study_area_id"])
    mapping["country_name"]         = _get_name(cursor, "countries",        mapping["country_id"])
    cursor.execute("SELECT name FROM `currencies` WHERE id = %s", (mapping["currency_id"],))
    _cur_row = cursor.fetchone()
    mapping["currency_name"] = _cur_row[0] if _cur_row else None

    return mapping