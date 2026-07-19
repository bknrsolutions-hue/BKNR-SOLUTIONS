from sqlalchemy import and_, func, or_


def active_employee_on(model, business_date):
    """Return the canonical ERP workforce predicate for a business date."""
    return and_(
        func.upper(func.trim(model.status)) == "ACTIVE",
        or_(model.joining_date.is_(None), model.joining_date <= business_date),
        or_(model.resignation_date.is_(None), model.resignation_date >= business_date),
    )
