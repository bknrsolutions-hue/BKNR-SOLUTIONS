def render_pdf_from_html(html: str) -> bytes:
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        import io
        from xhtml2pdf import pisa
        pdf_output = io.BytesIO()
        pisa.CreatePDF(io.StringIO(html), dest=pdf_output)
        return pdf_output.getvalue()


