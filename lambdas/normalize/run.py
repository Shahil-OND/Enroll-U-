import sys
import os
import json

# Add layers/common to path
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "layers" / "common"))

from normalize import normalize

def main():
    if len(sys.argv) < 2:
        print("Usage: python run.py <path_to_text_file_or_document_json>")
        sys.exit(1)

    input_path = sys.argv[1]
    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # If the input file is a .json file containing the output from the extract step,
    # parse it. Otherwise, treat it as a raw text file.
    raw_text = ""
    doc_id = "test-doc"
    doc_type = "txt"
    method = "manual-input"
    file_path = input_path

    if input_path.endswith(".json"):
        try:
            with open(input_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Check if it has the standard extract handler output schema
            if isinstance(data, dict):
                raw_text = data.get("raw_text") or data.get("text") or ""
                doc_id = data.get("document_id") or data.get("documentId") or doc_id
                doc_type = os.path.splitext(data.get("key", ""))[1].lower().lstrip(".") or doc_type
                method = data.get("extraction_method") or method
                file_path = data.get("key") or file_path
        except Exception as e:
            print(f"Warning: Failed to parse input as JSON, treating as raw text: {e}")

    if not raw_text:
        with open(input_path, "r", encoding="utf-8", errors="replace") as f:
            raw_text = f.read()

    print(f"Normalizing text from: {input_path}")
    print(f"Document ID: {doc_id}")
    print(f"Doc Type:    {doc_type}")
    print(f"Method:      {method}")
    print(f"Length:      {len(raw_text)} chars")
    print("Sending request to Amazon Bedrock...")
    
    try:
        result = normalize(
            raw_text=raw_text,
            document_id=doc_id,
            doc_type=doc_type,
            extraction_method=method,
            file_path=file_path
        )
        print("\n=== NORMALIZATION SUCCESS ===")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        print("=============================\n")
    except Exception as e:
        print(f"\nNormalization failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
