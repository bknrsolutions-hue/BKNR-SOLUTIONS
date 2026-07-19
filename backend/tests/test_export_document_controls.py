import os
import unittest
from datetime import date
from decimal import Decimal
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/test")

from pydantic import ValidationError
from app.routers.export_documents import (
    BillOfLadingSchema,
    CommercialInvoiceSchema,
    ExportShipmentSchema,
    PackingListSchema,
    ProformaInvoiceSchema,
    ShippingBillSchema,
    EXPORT_SUPPORT_DOCUMENT_TYPES,
    EXPORT_REQUIREMENT_STAGE_FIELDS,
    export_document_mode,
    is_supporting_document_admin,
    requirement_display_value,
    requirement_field_values,
    refresh_email_approval_status,
    safe_filename,
)
from app.database.models.invoices import ExportDocumentApproval, ExportDocumentFile


class ExportDocumentControlTests(unittest.TestCase):
    def test_shipment_rejects_eta_before_etd(self):
        with self.assertRaises(ValidationError):
            ExportShipmentSchema(
                shipment_no="S1", po_number="P1", buyer_name="Buyer", country="US",
                etd=date(2026, 7, 12), eta=date(2026, 7, 11),
            )

    def test_invoice_requires_positive_amount_and_exchange_rate(self):
        base = dict(
            shipment_no="S1", invoice_no="I1", po_number="P1", buyer_name="Buyer",
            invoice_date=date(2026, 7, 11), buyer_address="Address", country="US",
            payment_terms="ADVANCE", shipment_terms="FOB",
        )
        for exchange_rate, total_amount in ((Decimal("0"), Decimal("1")), (Decimal("1"), Decimal("-1"))):
            with self.subTest(exchange_rate=exchange_rate, total_amount=total_amount), self.assertRaises(ValidationError):
                CommercialInvoiceSchema(**base, exchange_rate=exchange_rate, total_amount=total_amount)

    def test_proforma_validates_dates_and_quantity(self):
        base = dict(
            pi_no="PI-1", pi_date=date(2026, 7, 15), buyer_name="Buyer",
            buyer_address="Address", country="US", incoterm="FOB",
            payment_terms="Advance", product_description="Frozen shrimp", unit_price=Decimal("5"),
        )
        with self.assertRaises(ValidationError):
            ProformaInvoiceSchema(**base, validity_date=date(2026, 7, 14), quantity=Decimal("1"))
        with self.assertRaises(ValidationError):
            ProformaInvoiceSchema(**base, quantity=Decimal("0"))

    def test_packing_and_bl_reject_invalid_weights(self):
        with self.assertRaises(ValidationError):
            PackingListSchema(
                packing_no="P1", invoice_no="I1", product_name="Shrimp", grade="16/20",
                packing_style="IQF", net_weight=100, gross_weight=90,
            )
        with self.assertRaises(ValidationError):
            BillOfLadingSchema(
                bl_no="B1", bl_date=date(2026, 7, 11), invoice_no="I1", container_no="C1",
                shipping_line="Line", seal_no="S1", no_of_original_bl=0,
            )

    def test_shipping_bill_dates_and_values_are_validated(self):
        with self.assertRaises(ValidationError):
            ShippingBillSchema(
                shipping_bill_no="SB1", shipping_bill_date=date(2026, 7, 11), invoice_no="I1",
                port="Port", cha_name="CHA", vessel_name="Vessel", voyage_no="V1",
                etd=date(2026, 7, 12), eta=date(2026, 7, 11), drawback_amount=-1,
            )

    def test_file_names_are_sanitized(self):
        self.assertEqual(safe_filename("../../Invoice 1?.pdf"), ".._.._Invoice_1_.pdf")

    def test_supporting_document_master_covers_full_export_lifecycle(self):
        codes = [item["code"] for item in EXPORT_SUPPORT_DOCUMENT_TYPES]
        self.assertEqual(len(codes), len(set(codes)))
        self.assertIn("PROFORMA_INVOICE", codes)
        self.assertIn("HEALTH_CERTIFICATE_COPY", codes)
        self.assertIn("SHIPPING_BILL", codes)
        self.assertIn("PAYMENT_RECEIPT", codes)
        self.assertIn("EBRC", codes)

    def test_supporting_document_approval_is_admin_only(self):
        self.assertTrue(is_supporting_document_admin(SimpleNamespace(session={"role": "admin", "email": "admin@example.com"})))
        self.assertTrue(is_supporting_document_admin(SimpleNamespace(session={"role": "super_admin", "email": "root@example.com"})))
        self.assertFalse(is_supporting_document_admin(SimpleNamespace(session={"role": "user", "email": "user@example.com"})))

    def test_every_requirement_option_has_page_fields(self):
        self.assertGreaterEqual(len(EXPORT_SUPPORT_DOCUMENT_TYPES), 50)
        for item in EXPORT_SUPPORT_DOCUMENT_TYPES:
            self.assertIn(item["stage"], EXPORT_REQUIREMENT_STAGE_FIELDS)
            self.assertTrue(EXPORT_REQUIREMENT_STAGE_FIELDS[item["stage"]])

    def test_export_product_lookups_are_multi_select(self):
        multi_lookup_names = {"species", "variety", "grade", "glaze", "freezer", "packing_style"}
        configured_names = set()
        for fields in EXPORT_REQUIREMENT_STAGE_FIELDS.values():
            for field in fields:
                if field.get("name") in multi_lookup_names:
                    configured_names.add(field["name"])
                    self.assertTrue(field.get("multiple"), field["name"])
        self.assertEqual(configured_names, multi_lookup_names)

    def test_multi_select_values_are_normalized_for_storage_and_output(self):
        self.assertEqual(requirement_field_values(["IQF", "Block", "IQF", ""]), ["IQF", "Block"])
        self.assertEqual(requirement_display_value(["16/20", "21/25"]), "16/20, 21/25")

    def test_document_modes_separate_generated_hybrid_and_imported_pdfs(self):
        self.assertEqual(export_document_mode("BATCH_TRACEABILITY"), "GENERATE")
        self.assertEqual(export_document_mode("PROFORMA_INVOICE"), "IMPORT_FINAL_PDF")
        self.assertEqual(export_document_mode("BUYER_PO"), "IMPORT_PDF")

    def test_email_approval_requires_every_selected_email(self):
        file_row = ExportDocumentFile(approval_status="PENDING")
        approvals = [
            ExportDocumentApproval(approver_email="one@example.com", decision="APPROVED"),
            ExportDocumentApproval(approver_email="two@example.com", decision="PENDING"),
        ]
        refresh_email_approval_status(file_row, approvals)
        self.assertEqual(file_row.approval_status, "PENDING")
        approvals[1].decision = "APPROVED"
        refresh_email_approval_status(file_row, approvals)
        self.assertEqual(file_row.approval_status, "APPROVED")


if __name__ == "__main__":
    unittest.main()
