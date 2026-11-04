import sys
import os
import json

# Add layers/common to path
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "layers" / "common"))

from validate import handler

def main():
    if len(sys.argv) < 2:
        print("Usage: python run.py <path_to_normalized_json_file>")
        sys.exit(1)

    json_path = sys.argv[1]
    if not os.path.exists(json_path):
        print(f"Error: File not found: {json_path}")
        sys.exit(1)

    try:
        with open(json_path, "r", encoding="utf-8") as f:
            event = json.load(f)
    except Exception as e:
        print(f"Error parsing JSON file: {e}")
        sys.exit(1)

    # If it's the raw Bedrock/Normalizer output directly,
    # mock the metadata so it persists successfully to DynamoDB
    if isinstance(event, dict):
        meta = event.setdefault("metadata", {})
        meta.setdefault("document_id", "test-doc-12345")
        meta.setdefault("document_type", "pdf")
        meta.setdefault("extraction_method", "amazon-textract")
        meta.setdefault("original_file_path", "C:/Users/nanda/Downloads/test_doc.pdf")
        meta.setdefault("extraction_timestamp", "2026-07-25T10:00:00Z")

    print(f"Running validator on: {json_path} ...")
    
    try:
        result = handler(event, None)
        print("\n=== VALIDATION SUCCESS ===")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("==========================\n")
        print("Note: If your local AWS CLI is logged in, a staging record was created/updated in DynamoDB!")
    except Exception as e:
        print(f"\nValidation failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
