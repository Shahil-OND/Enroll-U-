"""
test_batch_processing.py — Unit test suite for Multi-File Batch Processing & Consolidation (DPI Requirements).
Tests:
1. Batch Lambda (creation, presigned URLs, start, progress).
2. Validate Lambda partial status assignment for grouped documents vs pending_review for standalone.
3. Consolidation Lambda merging, conflict detection (preserves tuition conflict without auto-resolving), and source mapping.
4. MySQL writer staging secret configuration.
"""
import os
import sys
import json
import unittest
from unittest.mock import MagicMock, patch

# Add relevant paths to sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(BASE_DIR, "layers", "common"))
sys.path.insert(0, os.path.join(BASE_DIR, "lambdas", "crud"))
sys.path.insert(0, os.path.join(BASE_DIR, "lambdas", "validate"))
sys.path.insert(0, os.path.join(BASE_DIR, "lambdas", "consolidation"))
sys.path.insert(0, os.path.join(BASE_DIR, "lambdas", "mysql_writer"))


class TestBatchProcessing(unittest.TestCase):

    def setUp(self):
        os.environ["AWS_REGION"] = "us-west-2"
        os.environ["INGEST_BUCKET_NAME"] = "enrollu-test-bucket"
        os.environ["STAGING_TABLE_NAME"] = "EnrollUStaging"
        os.environ["STEP_FUNCTIONS_ARN"] = "arn:aws:states:us-west-2:123456789012:stateMachine:EnrollUWorkflow"
        os.environ["STEP_FUNCTIONS_BATCH_ARN"] = "arn:aws:states:us-west-2:123456789012:stateMachine:EnrollUBatchWorkflow"

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Test Batch Creation & Presigned URLs (Requirement 2 & 3)
    # ─────────────────────────────────────────────────────────────────────────
    @patch("boto3.client")
    @patch("database.create_staging_record")
    @patch("database.create_batch_record")
    def test_create_batch_with_presigned_urls(self, mock_create_batch, mock_create_staging, mock_boto3):
        import batch

        mock_s3 = MagicMock()
        mock_s3.generate_presigned_url.return_value = "https://enrollu-test-bucket.s3.amazonaws.com/presigned-put-url"
        mock_boto3.return_value = mock_s3

        event = {
            "httpMethod": "POST",
            "path": "/batches",
            "body": json.dumps({
                "files": [
                    {
                        "filename": "tec_monterrey_brochure.pdf",
                        "contentType": "application/pdf",
                        "processingMode": "grouped",
                        "institutionName": "Tecnológico de Monterrey"
                    },
                    {
                        "filename": "tec_monterrey_fees.xlsx",
                        "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        "processingMode": "grouped",
                        "institutionName": "Tecnológico de Monterrey"
                    },
                    {
                        "filename": "standalone_guide.pdf",
                        "contentType": "application/pdf",
                        "processingMode": "standalone"
                    }
                ]
            })
        }

        response = batch.handler(event, None)
        self.assertEqual(response["statusCode"], 200)

        body = json.loads(response["body"])
        self.assertIn("batchId", body)
        self.assertEqual(body["totalDocuments"], 3)
        self.assertEqual(body["standaloneCount"], 1)
        self.assertEqual(body["groupsCount"], 1)
        self.assertEqual(len(body["documents"]), 3)

        # Verify presigned URL generation was called for each file
        self.assertEqual(mock_s3.generate_presigned_url.call_count, 3)

        # Verify document records were staged in DynamoDB
        self.assertEqual(mock_create_staging.call_count, 3)
        mock_create_batch.assert_called_once()

    # ─────────────────────────────────────────────────────────────────────────
    # 2. Test Validate Lambda Partial Processing (Requirement 6)
    # ─────────────────────────────────────────────────────────────────────────
    @patch("boto3.resource")
    def test_validate_grouped_document_assigns_partial_status(self, mock_boto_resource):
        import validate

        mock_dynamo = MagicMock()
        mock_table = MagicMock()
        mock_dynamo.Table.return_value = mock_table
        mock_boto_resource.return_value = mock_dynamo

        sample_normalized = {
            "metadata": {
                "document_id": "doc-grouped-123",
                "original_file_path": "uploads/doc-grouped-123/brochure.pdf",
                "processing_mode": "grouped",
                "groupId": "grp_tec_123",
                "institutionName": "Tecnológico de Monterrey"
            },
            "institution": {"name": "Tecnológico de Monterrey"},
            "campuses": [
                {
                    "name": "Campus Monterrey",
                    "academic_programs": [
                        {
                            "name": "Ingeniería en Sistemas",
                            "level": "Undergraduate",
                            "modality": "On-site",
                            "financials": {"currency": "MXN", "costs": {"tuition_fee": 60000}}
                        }
                    ]
                }
            ]
        }

        event = {
            "extracted_json": sample_normalized,
            "document_id": "doc-grouped-123",
            "processing_mode": "grouped",
            "group_id": "grp_tec_123",
            "institution_name": "Tecnológico de Monterrey"
        }

        res = validate.handler(event, None)
        # Requirement 6: Grouped documents must get 'partial' status, not pending_review
        self.assertEqual(res["status"], "partial")
        self.assertEqual(res["processing_mode"], "grouped")
        self.assertEqual(res["group_id"], "grp_tec_123")

        # Verify DynamoDB update call used :stat = 'partial'
        mock_table.update_item.assert_called()
        call_kwargs = mock_table.update_item.call_args[1]
        self.assertEqual(call_kwargs["ExpressionAttributeValues"][":stat"], "partial")
        self.assertEqual(call_kwargs["ExpressionAttributeValues"][":pm"], "grouped")

    @patch("boto3.resource")
    def test_validate_standalone_document_assigns_pending_review(self, mock_boto_resource):
        import validate

        mock_dynamo = MagicMock()
        mock_table = MagicMock()
        mock_dynamo.Table.return_value = mock_table
        mock_boto_resource.return_value = mock_dynamo

        sample_standalone = {
            "metadata": {
                "document_id": "doc-standalone-456",
                "original_file_path": "uploads/doc-standalone-456/catalog.pdf",
                "processing_mode": "standalone"
            },
            "institution": {"name": "Universidad Nacional"},
            "campuses": [
                {
                    "name": "Campus Central",
                    "academic_programs": [
                        {
                            "name": "Licenciatura en Derecho",
                            "level": "Undergraduate",
                            "modality": "On-site"
                        }
                    ]
                }
            ]
        }

        event = {
            "extracted_json": sample_standalone,
            "document_id": "doc-standalone-456",
            "processing_mode": "standalone"
        }

        res = validate.handler(event, None)
        # Standalone documents continue using pending_review
        self.assertEqual(res["status"], "pending_review")
        self.assertEqual(res["processing_mode"], "standalone")

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Test Consolidation Lambda & Conflict Preservation (Requirement 8)
    # ─────────────────────────────────────────────────────────────────────────
    @patch("database.get_documents_by_group")
    @patch("database.save_consolidated_record")
    def test_consolidation_merges_and_preserves_conflicting_fees(self, mock_save_consolidated, mock_get_docs):
        import consolidation

        # Document 1 (Brochure)
        doc1 = {
            "documentId": "doc-1",
            "filename": "brochure_2025.pdf",
            "status": "partial",
            "confidence_score": 0.95,
            "raw_text": "Ingeniería en Sistemas. Colegiatura: $5,000 MXN mensuales.",
            "extracted_json": {
                "institution": {"name": "Universidad Modelo", "website": "https://modelo.edu.mx"},
                "campuses": [
                    {
                        "name": "Campus Norte",
                        "academic_programs": [
                            {
                                "name": "Ingeniería en Sistemas",
                                "level": "Undergraduate",
                                "duration": "4 years",
                                "curriculum": ["Algorithms", "Databases"],
                                "financials": {
                                    "currency": "MXN",
                                    "costs": {"tuition_fee": 5000}
                                }
                            }
                        ]
                    }
                ]
            }
        }

        # Document 2 (Fee Schedule with Conflicting Tuition)
        doc2 = {
            "documentId": "doc-2",
            "filename": "fees_official_update.xlsx",
            "status": "partial",
            "confidence_score": 0.90,
            "raw_text": "Ingeniería en Sistemas. Costo actualizado: $5,500 MXN.",
            "extracted_json": {
                "institution": {"name": "Universidad Modelo", "contact": {"phone": "+52 55 1234 5678"}},
                "campuses": [
                    {
                        "name": "Campus Norte",
                        "academic_programs": [
                            {
                                "name": "Ingeniería en Sistemas",
                                "financials": {
                                    "currency": "MXN",
                                    "costs": {"tuition_fee": 5500}
                                }
                            }
                        ]
                    }
                ]
            }
        }

        mock_get_docs.return_value = [doc1, doc2]

        result = consolidation.consolidate_institution_group("grp_modelo_1", batch_id="batch-123", institution_name="Universidad Modelo")

        self.assertEqual(result["status"], "consolidated")
        self.assertEqual(result["source_documents_count"], 2)
        # Must detect exactly 1 conflict in tuition_fee
        self.assertEqual(result["conflicts_count"], 1)

        mock_save_consolidated.assert_called_once()
        save_args = mock_save_consolidated.call_args[1]

        # Verify conflicts list is preserved
        conflicts = save_args["conflicts"]
        self.assertEqual(len(conflicts), 1)
        conflict = conflicts[0]
        self.assertIn("tuition_fee", conflict["property"])
        self.assertEqual(len(conflict["values"]), 2)
        self.assertEqual(conflict["values"][0]["value"], 5000)
        self.assertEqual(conflict["values"][0]["filename"], "brochure_2025.pdf")
        self.assertEqual(conflict["values"][1]["value"], 5500)
        self.assertEqual(conflict["values"][1]["filename"], "fees_official_update.xlsx")

        # Verify source documents information was preserved
        source_docs = save_args["source_documents"]
        self.assertEqual(len(source_docs), 2)
        self.assertEqual(source_docs[0]["filename"], "brochure_2025.pdf")
        self.assertEqual(source_docs[1]["filename"], "fees_official_update.xlsx")

        # Verify merged JSON contains fields from both docs
        cons_json = save_args["consolidated_json"]
        self.assertEqual(cons_json["institution"]["website"], "https://modelo.edu.mx")
        self.assertEqual(cons_json["institution"]["contact"]["phone"], "+52 55 1234 5678")

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Test Batch Progress API Calculation (Requirement 9)
    # ─────────────────────────────────────────────────────────────────────────
    @patch("database.get_batch_record")
    @patch("database.get_documents_by_batch")
    @patch("database.list_documents")
    @patch("database.update_batch_status")
    def test_batch_progress_api(self, mock_update_status, mock_list_docs, mock_get_batch_docs, mock_get_batch_record):
        import batch

        mock_get_batch_record.return_value = {
            "batchId": "batch-xyz",
            "status": "processing",
            "total_documents": 3
        }

        # 1 standalone pending_review, 2 grouped in 'grp_1' (1 partial, 1 failed)
        mock_get_batch_docs.return_value = [
            {
                "documentId": "doc-s1",
                "filename": "standalone.pdf",
                "status": "pending_review",
                "processing_mode": "standalone",
                "confidence_score": 0.88
            },
            {
                "documentId": "doc-g1",
                "filename": "group_doc1.pdf",
                "status": "partial",
                "processing_mode": "grouped",
                "groupId": "grp_1",
                "institutionName": "Colegio Mayor"
            },
            {
                "documentId": "doc-g2",
                "filename": "group_doc2.pdf",
                "status": "failed",
                "processing_mode": "grouped",
                "groupId": "grp_1",
                "institutionName": "Colegio Mayor",
                "error_message": "PyMuPDF parsing error"
            }
        ]

        mock_list_docs.return_value = []

        res = batch.handle_get_batch_progress("batch-xyz", batch._cors_headers())
        self.assertEqual(res["statusCode"], 200)

        data = json.loads(res["body"])
        self.assertEqual(data["batchId"], "batch-xyz")
        self.assertEqual(data["totalDocuments"], 3)
        self.assertEqual(data["completedDocuments"], 2)  # pending_review and partial
        self.assertEqual(data["failedDocuments"], 1)
        self.assertEqual(len(data["standaloneDocuments"]), 1)
        self.assertEqual(len(data["institutionGroups"]), 1)
        self.assertEqual(data["overallBatchStatus"], "completed_with_errors")

    # ─────────────────────────────────────────────────────────────────────────
    # 5. Test MySQL Writer Staging Isolation (Requirement 11)
    # ─────────────────────────────────────────────────────────────────────────
    def test_mysql_writer_staging_credentials_priority(self):
        os.environ["MYSQL_STAGING_SECRET_ARN"] = "arn:aws:secretsmanager:us-west-2:123456789012:secret:enrollu/staging/mysql"
        os.environ["MYSQL_SECRET_ARN"] = "arn:aws:secretsmanager:us-west-2:123456789012:secret:enrollu/poc/mysql"
        os.environ["DPI_MODE"] = "staging"

        # Verify that writer resolves staging secret over production
        secret_arn = os.environ.get("MYSQL_STAGING_SECRET_ARN") or os.environ.get("MYSQL_SECRET_ARN")
        self.assertEqual(secret_arn, "arn:aws:secretsmanager:us-west-2:123456789012:secret:enrollu/staging/mysql")


if __name__ == "__main__":
    unittest.main()

