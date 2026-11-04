# tests/unit/test_normalize_campuses.py
import sys
import os

# Setup environment variables
os.environ["AWS_REGION"] = "us-west-2"
os.environ["LLM_PROVIDER"] = "bedrock"

# Add paths to sys.path
sys.path.insert(0, "layers/common")
sys.path.insert(0, "lambdas/normalize")

from normalize import _merge_chunk_jsons

def test_merge_chunk_jsons_campuses():
    # Test cases
    chunk1 = {
        "institution": {"name": "Test University"},
        "programs": [{"name": "CS"}],
        "campuses": [
            {"name": "Campus A", "address": "123 Main St"},
            {"name": "Campus B", "address": "456 Oak St"}
        ]
    }
    chunk2 = {
        "institution": {"name": "Test University"},
        "programs": [{"name": "Math"}],
        "campuses": [
            {"name": "Campus B", "address": "456 Oak St Updated"},
            {"name": "Campus C", "address": "789 Pine St"}
        ]
    }

    merged = _merge_chunk_jsons([chunk1, chunk2])

    print("Merged programs:", merged.get("programs"))
    print("Merged campuses:", merged.get("campuses"))

    # Assertions
    campuses = merged.get("campuses", [])
    assert len(campuses) == 3, f"Expected 3 campuses, got {len(campuses)}"
    
    # Campus B should be updated/overwritten by the last one (chunk2 version) or just deduplicated
    campuses_map = {c["name"]: c for c in campuses}
    assert "Campus A" in campuses_map
    assert "Campus B" in campuses_map
    assert "Campus C" in campuses_map
    assert campuses_map["Campus B"]["address"] == "456 Oak St Updated"
    
    print("All assertions passed successfully!")

if __name__ == "__main__":
    test_merge_chunk_jsons_campuses()
