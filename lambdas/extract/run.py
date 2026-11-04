import sys
import os

# Add layers/common to path if needed before importing extract, to make sure it matches extract.py behavior
try:
    from config import ALLOWED_EXTENSIONS
except ImportError:
    import pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parents[2] / "layers" / "common"))

from extract import extract

def main():
    if len(sys.argv) < 2:
        print("Usage: python run.py <path_to_document>")
        sys.exit(1)

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(f"Error: File not found: {file_path}")
        sys.exit(1)

    print(f"Extracting text from: {file_path} ...")
    try:
        raw_text, method = extract(file_path)
        print("\n--- EXTRACTION SUCCESS ---")
        print(f"Method used: {method}")
        print("--- EXTRACTED TEXT ---")
        print(raw_text)
        print("----------------------")
    except Exception as e:
        print(f"\nExtraction failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
