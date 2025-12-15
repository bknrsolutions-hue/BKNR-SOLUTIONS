from app.database.models.users import Company

def get_company_id(request, db):
    company_code = request.session.get("company_id")

    if not company_code:
        return None

    comp = db.query(Company).filter(Company.company_code == company_code).first()

    return comp.id if comp else None
