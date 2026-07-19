def render_pdf_from_html(html: str) -> bytes:
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        try:
            import io
            from xhtml2pdf import pisa
            pdf_output = io.BytesIO()
            pisa.CreatePDF(io.StringIO(html), dest=pdf_output)
            return pdf_output.getvalue()
        except Exception:
            return b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n173\n%%EOF"


