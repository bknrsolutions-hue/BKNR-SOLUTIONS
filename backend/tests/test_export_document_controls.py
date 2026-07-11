import os
import unittest
from datetime import date
from decimal import Decimal


os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/test")

from pydantic import ValidationError
from app.routers.export_documents import (
    BillOfLadingSchema,
    CommercialInvoiceSchema,
    ExportShipmentSchema,
    PackingListSchema,
    ShippingBillSchema,
    safe_filename,
)


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


if __name__ == "__main__":
    unittest.main()
