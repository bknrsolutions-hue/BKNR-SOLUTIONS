def render_pdf_from_html(html: str) -> bytes:
    from weasyprint import HTML

    return HTML(string=html).write_pdf()
