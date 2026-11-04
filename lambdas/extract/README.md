Lambda runtime: python3.12
Layers: common
Input: S3 object location (bucket + key)
Output: JSON: { "raw_text": "...", "page_count": 12, "method": "amazon-textract" }
Deployment notes: Ensure PyMuPDF is bundled into the layer or build custom layer with pre-compiled wheels.
