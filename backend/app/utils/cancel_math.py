from sqlalchemy import case, func


def signed_value(model, column):
    return case(
        (getattr(model, "is_cancelled", False) == True, -func.coalesce(column, 0)),
        else_=func.coalesce(column, 0),
    )


def signed_sum(model, column):
    return func.coalesce(func.sum(signed_value(model, column)), 0.0)


def active_value(model, column):
    return case(
        (getattr(model, "is_cancelled", False) == True, 0.0),
        else_=func.coalesce(column, 0),
    )


def active_sum(model, column):
    return func.coalesce(func.sum(active_value(model, column)), 0.0)


def signed_number(row, value):
    amount = float(value or 0)
    return -amount if bool(getattr(row, "is_cancelled", False)) else amount


def active_number(row, value):
    return 0.0 if bool(getattr(row, "is_cancelled", False)) else float(value or 0)
