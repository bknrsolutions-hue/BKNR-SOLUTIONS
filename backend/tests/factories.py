"""Synthetic factories used only by the isolated automated test database."""

from dataclasses import dataclass
from datetime import date

from app.database.models.users import Company, User
from app.database.models.criteria import (
    peeling_at,
    production_for,
    purchasing_locations,
    suppliers,
    vehicle_numbers,
)
from app.security.password_handler import hash_password


@dataclass
class TenantBundle:
    company: Company
    user: User
    password: str


def create_tenant_bundle(
    db,
    *,
    code: str,
    company_name: str,
    email: str,
    mobile: str,
    role: str = "admin",
    permissions: str = "ALL",
    password: str = "TestOnly#2026",
) -> TenantBundle:
    company = Company(
        company_name=company_name,
        address="Synthetic test address",
        email=f"company.{email}",
        company_code=code,
        mpeda_registration_code=code[-4:],
        is_active=True,
        setup_completed=True,
    )
    db.add(company)
    db.flush()
    user = User(
        company_id=company.id,
        name="Synthetic Administrator",
        designation="Test Administrator",
        email=email,
        mobile=mobile,
        password=hash_password(password),
        role=role,
        permissions=permissions,
        is_verified=True,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return TenantBundle(company=company, user=user, password=password)


def seed_gate_masters(db, company_code: str, suffix: str = "") -> dict[str, str]:
    values = {
        "production_for": f"Synthetic Production {suffix}".strip(),
        "plant": f"Synthetic Plant {suffix}".strip(),
        "supplier": f"Synthetic Supplier {suffix}".strip(),
        "purchasing_location": f"Synthetic Purchase Point {suffix}".strip(),
        "vehicle": f"TEST-{suffix or '01'}",
    }
    db.add_all([
        production_for(
            company_id=company_code,
            production_for=values["production_for"],
            apply_from=date(2026, 4, 1),
            free_days=0,
        ),
        peeling_at(company_id=company_code, peeling_at=values["plant"]),
        suppliers(company_id=company_code, supplier_name=values["supplier"]),
        purchasing_locations(company_id=company_code, location_name=values["purchasing_location"]),
        vehicle_numbers(company_id=company_code, vehicle_number=values["vehicle"]),
    ])
    db.flush()
    return values
