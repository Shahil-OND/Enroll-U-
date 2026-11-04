"""
config.py — AWS-only configuration for EnrollU Document Intelligence Bridge.
All values are driven by Lambda environment variables.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# AWS
# ─────────────────────────────────────────────────────────────────────────────
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")
S3_BUCKET_NAME = os.getenv("INGEST_BUCKET_NAME") or os.getenv("S3_BUCKET_NAME", "enrollu-documents-poc")
DYNAMODB_TABLE_NAME = os.getenv("STAGING_TABLE_NAME") or os.getenv("DYNAMODB_TABLE_NAME", "enrollu_documents")
STEP_FUNCTIONS_ARN = os.getenv("STEP_FUNCTIONS_ARN", "")

# ─────────────────────────────────────────────────────────────────────────────
# LLM — AWS Bedrock (active provider)
# ─────────────────────────────────────────────────────────────────────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "bedrock")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0")

# ─────────────────────────────────────────────────────────────────────────────
# LLM Prompt Constraints
# ─────────────────────────────────────────────────────────────────────────────
LLM_TEMPERATURE = 0           # Deterministic output only
LLM_MAX_INPUT_TOKENS = 6000   # Hard limit on input context
LLM_MAX_OUTPUT_TOKENS = 2048  # Hard limit on LLM response length

# ─────────────────────────────────────────────────────────────────────────────
# Supported file extensions
# ─────────────────────────────────────────────────────────────────────────────
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".csv", ".png", ".jpg", ".jpeg", ".tiff", ".txt"}

# ─────────────────────────────────────────────────────────────────────────────
# Relational Database (MySQL)
# ─────────────────────────────────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "enrollu_db")
# BUG-12 FIX: use safe int() conversion — crashes Lambda on cold start if env var is non-numeric
try:
    DB_PORT = int(os.getenv("DB_PORT", "3306"))
except (ValueError, TypeError):
    DB_PORT = 3306
# Support SQLite fallback only if explicitly set, but default is MySQL
DB_TYPE = os.getenv("DB_TYPE", "mysql")
# Keep DB_PATH for backward compatibility with tests/scripts if needed
DB_PATH = os.getenv("DB_PATH", "staging.db")

