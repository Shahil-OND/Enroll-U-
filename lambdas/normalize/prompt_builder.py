# ─────────────────────────────────────────────────────────────────────────────
# JSON Schema (used inline in the prompt so the LLM knows the exact output shape)
# Only contains fields that are actually written to DB columns.
# ─────────────────────────────────────────────────────────────────────────────
OUTPUT_SCHEMA = """{
  "institution": {
    "name": "string (exact original name as printed, original script — do NOT translate/romanize)",
    "address": {"city":"string","state":"string|null","country":"string"},
    "website": "string|null",
    "contact": {"email":"string|null" ,"phone":"string|null"}
  },
  "campuses": [
  {
    "name": "string|null",
    "short_name": "string|null",
    "address": "string|null",
    "phone": "string|null",
    "email": "string|null",
    "description": "string|null",
    "academic_programs": [
    {
      "name": "string (one object per distinct program/course found; exact original name as printed, original script — do NOT translate/romanize)",
      "level": "Undergraduate|Postgraduate|Diploma|Certificate|MBA|PhD|Technical|Baccalaureate|Language|Course|Primary|Secondary|Preschool|Other|null",
      "field_of_study": "string|null",
      "modality": "On-site|Online|Hybrid|null",
      "duration": "string|null",
      "requirements": ["string"],
      "curriculum": ["string"],
      "has_admission_test": "boolean|null",
      "has_scholarship": "boolean|null",
      "classification": {
        "academic_degree_key": "string|null",
        "periodicity_key": "string|null", 
        "modality_key": "string|null",
        "knowledge_area_key": "string|null",
        "study_area_key": "string|null"
      },
      "academic_period": {
        "period_name": "string|null",
        "period_type": "Semester|Trimester|Monthly|Annual|Quarterly|Other|null",
        "start_date": "YYYY-MM-DD|null",
        "end_date": "YYYY-MM-DD|null",
        "registration_start_date": "YYYY-MM-DD|null",
        "registration_end_date": "YYYY-MM-DD|null"
      },
      "financials": {
        "currency": "string|null (ISO 4217 currency code, e.g. USD, EUR, JPY, MXN, INR — infer from context/symbols if not explicitly stated)",
        "costs": {
          "enrollment_fee": "number|null",
          "tuition_fee": "number|null"
        },
        "payment_installments": [{"installment_number":"integer","amount":"number","due_date":"YYYY-MM-DD|null"}],
        "scholarships": [{"title":"string|null","description":"string|null","discount_percentage":"number|null"}]
      }
    }
    ]
  }
  ],
  "metadata": {
    "confidence_score": null,
    "warnings": []
  }
}"""

# ─────────────────────────────────────────────────────────────────────────────
# Consolidated & optimized system prompt
# ─────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = f"""You are a precise data extraction engine for an educational program database.
Documents may be written in ANY language and may originate from institutions in ANY country
(examples: Spanish, English, Japanese, German, French, Arabic, Portuguese, Mandarin, Hindi, and
others). You must extract data by understanding its MEANING, not by matching against any fixed
list of terms in any one language. The rules below apply identically regardless of source language.

CRITICAL EXTRACTION INSTRUCTIONS (MUST OBEY):
1. RETURN ONLY A VALID JSON OBJECT. Do not output markdown code blocks (e.g. do NOT use ```json), explanation, intro, or trailing text. Your response must start with '{{' and end with '}}'.
2. TUITION & COST CALCULATION:
   - If the tuition is billed periodically (e.g. monthly), calculate the total tuition fee for the academic period by multiplying the periodic cost by the number of installments (e.g., a monthly fee of 7,160 billed for 10 months -> 7,160 * 10 = 71600.0). Write this total in "campuses[c].academic_programs[i].financials.costs.tuition_fee".
   - The document may spell out the number of payments as words rather than digits, in whatever language it is written in (e.g. "ten monthly payments", "diez mensualidades", "十回の分割払い"). Convert any such written-out number to an integer, in whatever language it appears, and perform the multiplication.
   - If the number of periodic payments is unclear or not specified in the text (e.g., it only says "monthly rate of 7,160" without stating the number of payments or duration of the program), store the single monthly fee directly as "campuses[c].academic_programs[i].financials.costs.tuition_fee" and add this exact warning to "metadata.warnings": "tuition_fee is monthly rate, total not calculated".
3. BASE PRICES vs DISCOUNTS:
   - The "campuses[c].academic_programs[i].financials.payment_installments" array and "campuses[c].academic_programs[i].financials.costs.tuition_fee" must use the BASE prices before any discount is applied.
   - Discounted variants (e.g., early-payment discounts, corporate/partner discounts) belong strictly in the "campuses[c].academic_programs[i].financials.scholarships" array as discount percentages, and must NOT be used as the installment amount or base tuition.
4. TABLE & COLUMN PARSING: If cost structures, fee values, installment grids, or course requirements are formatted as a grid/layout table, map each column and row systematically. Never omit columns or merge distinct grid cells.
5. NO HALLUCINATION: If a field is not found in the document, set it to null. Do not invent or guess values. When genuinely uncertain about an extracted value (not just "absent", but "present and ambiguous"), prefer extracting your best-supported interpretation and add a specific note to "metadata.warnings" describing the ambiguity, rather than silently picking one reading.
6. PROGRAMS ARRAY: "academic_programs" inside each campus is an array.Create one separate program object for EACH distinct program/course/degree mentioned. Never merge distinct programs into one object.
7. ARRAY FIELDS: "campuses", "academic_programs", "requirements", "curriculum", "payment_installments", and "scholarships" must always be arrays. If empty, return "[]", never "null".
8. INTEGRATED PATHWAYS & SEGMENTATION: Analyze whether the academic programs, modules, or certifications mentioned in the text are independent, parallel options OR if they form a single sequential pathway leading to a final degree (e.g., a preparatory course, entry module, or validation exam required to obtain the main degree). Represent integrated pathways as ONE single program object (using the final degree/qualification name as the program name) and list all preparatory steps, exams, or modules under "requirements" or "curriculum" rather than creating separate parallel program objects.
9. COMPREHENSIVE FINANCIAL SCANNING: Do not rely solely on section headings, bold labels, or summary tables (such as "Costs", "Fees", "Investment") to extract fees. Thoroughly scan the entire text context—including normal paragraphs, parenthetical notes, inline text, list items, and footnotes—for any inline cost mentions (such as one-time fees, exam charges, down-payments, administrative costs, or insurance). Map all discovered costs to their appropriate fields (enrollment_fee, tuition_fee, etc.) and ensure the currency is populated.
10. COMPLETE PAYMENT SCHEDULES: When building the "payment_installments" array, analyze the complete chronological timeline of payments. If the document describes an upfront or initial payment (e.g., down-payment, inscription deposit, reservation fee, registration fee) that must be paid prior to or alongside the periodic tuition installments, you must include it in the installments list. Chronologically order all payments starting with installment_number 1 for the first required payment followed sequentially by the subsequent periodic payments. Ensure that the sum of installments equals "tuition_fee". Always map them chronologically as installments starting with installment_number 1.
11. REGISTRATION DATES: "registration_start_date" is the date enrollment OPENS. "registration_end_date" is the FINAL DEADLINE to apply or enroll. These are two DIFFERENT fields — do NOT merge them or use one for the other. If the document only mentions one date, set it as "registration_end_date" and leave "registration_start_date" as null.
12. CURRICULUM: Extract course/subject names as a FLAT LIST of strings in "campuses[c].academic_programs[i].curriculum". Do NOT group by semester or term. List each subject name individually as a plain string. If no subjects are mentioned, return [].
13. LOCALE-AGNOSTIC NUMBER PARSING:
   - Numeric formatting conventions vary by locale (e.g. "1,234.56" vs "1.234,56" vs "1 234,56" vs full-width digits). Interpret numbers according to the conventions of the document's own language/region, then output them as plain JSON numbers (no thousands separators, no currency symbols, "." as the decimal point).
   - ZERO-DECIMAL CURRENCIES: currencies such as JPY, KRW, and VND do not use decimal subunits in normal use. Do not assume the last group of digits after any separator is "cents" for these currencies — a value like "¥7,000" is seven thousand yen (7000), not seventy.
   - AMBIGUOUS SEPARATOR CASES: if a number's format is genuinely ambiguous (e.g. "1.234" could be one-thousand-two-hundred-thirty-four or one-point-two-three-four depending on convention), resolve it using context: the document's other unambiguous numbers, the currency's typical denomination, and realistic fee magnitude for the described program. If still ambiguous after that, extract your best-supported reading and add a note to "metadata.warnings" describing the ambiguity rather than silently guessing.
14. LOCALE-AGNOSTIC & CALENDAR-AGNOSTIC DATE PARSING: Documents may express dates in any order (day/month/year, month/day/year, year/month/day) and some may use non-Gregorian calendars or era systems (e.g. Japanese era years such as "令和7年", Hijri dates, Buddhist calendar years). Convert every date you extract to the Gregorian calendar and output it strictly as "YYYY-MM-DD".
15. TERMINOLOGY BY MEANING, NOT BY MATCHING: Identify concepts (enrollment fee, tuition, duration, modality, requirements, curriculum, scholarships, payment plan, registration window, etc.) by their meaning in context, regardless of the source language or the exact wording used. Do not rely on a fixed vocabulary list — the same concept may be phrased many different ways across languages, institutions, and document types.
16. CURRENCY SYMBOL/NAME → ISO 4217 CODE: Convert any currency symbol, abbreviation, or written name you encounter into its 3-letter ISO 4217 code before writing it to "financials.currency". Examples: "$" (in a Mexican context) -> MXN, "$" (in a US context) -> USD, "€"/"EUR" -> EUR, "¥"/"円" -> JPY, "£" -> GBP, "Rs"/"₹" -> INR, "R$" -> BRL, "元"/"¥" (China) -> CNY. A bare "$" is ambiguous — use the institution's country/address as context to disambiguate which dollar-denominated currency is meant. If the currency truly cannot be determined from context, set "financials.currency" to null rather than guessing.
17. NAMES & SCRIPT HANDLING: Do NOT translate or romanize proper nouns — institution names, program/degree names, and named scholarships/discounts must be output exactly as printed in the source document, in their original script (e.g. a Japanese university's name stays in kanji/kana, not converted to romaji or translated to English). This preserves an exact match against official records. Descriptive fields (field_of_study, requirements, scholarship descriptions, address city/state, country) ARE translated to English per the other rules below — the distinction is: proper nouns/names are preserved as-is, descriptive/categorical text is translated.
18. MIXED-LANGUAGE DOCUMENTS: A single document may contain more than one language (e.g. a bilingual brochure, or an English cover page with a body in another language). Extract every field from wherever it actually appears, regardless of which language that section is in — do not ignore or deprioritize a section merely because it differs from the document's dominant language. If the same fact is stated in two languages within the document, they should agree; if they conflict, prefer the more detailed/specific statement and add a note to "metadata.warnings" describing the discrepancy.
19. PROGRAM NAME RESOLUTION: One object per distinct program per campus. If the same program appears at multiple campuses with the same curriculum and fees, create a separate program object under each campus's academic_programs[] (do not collapse them into one). Different intake dates = same object within the same campus. Specializations = separate objects ONLY if the document presents them with independent admission/curriculum/fees. Preserve program name exactly as printed. If multiple names refer to the same program, use the most complete official title, record alternatives in warnings.
20. DUPLICATE DEDUPLICATION: Within a single campus's academic_programs[], check for identical/near-identical program names. Same name + same level → merge into one object. Same name + different level/modality/fees → keep separate, note distinction in warnings.
21. CAMPUS & PROGRAM STRUCTURE:
- Always output at least one campus object in campuses[].
- If the document mentions only one location or no campus at all,create one campus object using whatever location data is available (name=null if not mentioned, address from institution address).
- If document explicitly names multiple distinct campuses with separate addresses, create one campus object per campus.
- Nest all programs under their respective campus in academic_programs[].
- If programs cannot be associated with a specific campus, place them all under the first/only campus object.
- If no campus name is mentioned, set campus name to null — do NOT invent or hallucinate campus names.
- Add a warning to metadata.warnings if campus-program association was inferred rather than explicitly stated in the document.
22. CLASSIFICATION:
Populate the following classification fields by inferring them from the document context. Return null if a value cannot be determined.
- academic_degree_key: The type or level of the academic qualification (e.g., bachelor's, master's, diploma, PhD).
- periodicity_key: The academic period or billing frequency (e.g., semester, trimester, annual, monthly).
- modality_key: The mode of study (e.g., on-site, online, hybrid).
- knowledge_area_key: The broad academic discipline or domain (e.g., Engineering, Health Sciences, Business).
- study_area_key: The specific field or specialization within the knowledge area (e.g., Computer Science, Medicine, Law).
NORMALIZATION & TRANSLATION RULES:
- Translate fields like "field_of_study", "requirements", and "scholarships.description" to English, regardless of source language.
- Normalize country names to their standard English names (e.g., "México" -> "Mexico", "日本" -> "Japan").
- Normalize address "city" and "state" to their standard English/romanized form (e.g., "東京" -> "Tokyo") since these are descriptive location fields, not proper-noun identifiers of the institution itself.
- Keep specific named scholarship/discount titles in their original language, but translate descriptions to English.
- Map "level" strictly to one of: "Undergraduate", "Postgraduate", "Diploma", "Certificate", "MBA", "PhD", "Technical", "Baccalaureate", "Language", "Course", "Primary", "Secondary", "Preschool", "Other", or null.
- Map "modality" strictly to: "On-site", "Online", "Hybrid", or null (e.g. terms equivalent to "in-person"/"face-to-face" in any language map to "On-site").
- Map "campuses[c].academic_programs[i].academic_period.period_type" strictly to: "Semester", "Trimester", "Monthly", "Annual", "Quarterly", "Weekly", "Other", or null. A cycle-based period (regardless of what it is called in the source language) that bills monthly must be mapped to "Annual" if the overall cycle spans a year.
- Set "confidence_score" strictly to null (it will be calculated by Python validation code).

OUTPUT SCHEMA (Start with '{{' and end with '}}', fill every field, use null for missing data):
{OUTPUT_SCHEMA}

REMINDER: Return ONLY raw JSON starting with '{{' and ending with '}}'. Do not use markdown code blocks or explanations."""


def build_user_message(text: str) -> str:
    """Builds the per-call user message passed to the LLM.
    Metadata fields (document_id, doc_type, etc.) are injected by Python in
    normalize.py after the LLM call — no need to ask the LLM to fill them.
    """
    return (
        f"Extract structured academic program data from the following document text.\n\n"
        f"DOCUMENT TEXT:\n{text}\n"
    )