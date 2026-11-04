# tests/test_handler_exact.py
# This tests the EXACT same code path Lambda will execute

import sys
import os
import json

# Setup environment variables matching deployment defaults
os.environ["AWS_REGION"] = os.getenv("AWS_REGION", "us-west-2")
os.environ["ALLOWED_EXTENSIONS"] = ".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.tiff,.txt"
os.environ["INGEST_BUCKET_NAME"] = os.getenv("INGEST_BUCKET_NAME", "s3stack-ingestbucket2b3522fa-nzcnpl7eypel")

# Resolve relative imports correctly from the root directory
sys.path.insert(0, "layers/common")
sys.path.insert(0, "lambdas/extract")

# Import the EXACT same handler Lambda will call
from extract import handler

def main():
    bucket_name = os.environ["INGEST_BUCKET_NAME"]
    
    # Simulate EXACT EventBridge event structure that Lambda receives from S3 upload
    event = {
        "detail": {
            "bucket": {"name": bucket_name},
            "object": {"key": "test/maestria_2026_2027.pdf"}
        },
        "document_id": "test-maestria-001"
    }

    print(f"Testing Extract handler with event on bucket: {bucket_name} ...")
    try:
        # Call handler exactly like Lambda does
        result = handler(event, None)
        
        print("\n=== HANDLER RESULT ===")
        print(json.dumps({
            "document_id": result.get("document_id"),
            "extraction_method": result.get("extraction_method"),
            "bucket": result.get("bucket"),
            "key": result.get("key"),
            "text_length": len(result.get("raw_text", "")),
            "first_300_chars": result.get("raw_text", "")[:300]
        }, indent=2, ensure_ascii=False))
        print("======================\n")
    except Exception as e:
        print(f"\nHandler execution failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
