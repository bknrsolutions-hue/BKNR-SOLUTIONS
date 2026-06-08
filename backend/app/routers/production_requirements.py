from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.services.production_requirements_service import (
    ProductionRequirementService
)
from app.database.models.requirements import ProductionRequirement

router = APIRouter(
    prefix="/production-requirements",
    tags=["Production Requirements"]
)

# =====================================================
# REFRESH REQUIREMENTS
# =====================================================
@router.post("/refresh/{company_id}")
def refresh_requirements(
    company_id: str,
    db: Session = Depends(get_db)
):
    try:

        rows_created = (
            ProductionRequirementService.refresh_requirements(
                db=db,
                company_id=company_id
            )
        )

        return {
            "success": True,
            "company_id": company_id,
            "rows_created": rows_created,
            "message": f"{rows_created} requirements generated successfully"
        }

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# =====================================================
# GET ALL REQUIREMENTS
# =====================================================
@router.get("/{company_id}")
def get_requirements(
    company_id: str,
    db: Session = Depends(get_db)
):

    data = (
        db.query(ProductionRequirement)
        .filter(
            ProductionRequirement.company_id == company_id
        )
        .order_by(
            ProductionRequirement.po_number
        )
        .all()
    )

    return data


# =====================================================
# GET PENDING REQUIREMENTS
# =====================================================
@router.get("/{company_id}/pending")
def get_pending_requirements(
    company_id: str,
    db: Session = Depends(get_db)
):

    data = (
        db.query(ProductionRequirement)
        .filter(
            ProductionRequirement.company_id == company_id,
            ProductionRequirement.status == "PENDING"
        )
        .order_by(
            ProductionRequirement.po_number
        )
        .all()
    )

    return data


# =====================================================
# GET SINGLE REQUIREMENT
# =====================================================
@router.get("/row/{requirement_id}")
def get_requirement(
    requirement_id: int,
    db: Session = Depends(get_db)
):

    row = (
        db.query(ProductionRequirement)
        .filter(
            ProductionRequirement.id == requirement_id
        )
        .first()
    )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Requirement not found"
        )

    return row


# =====================================================
# REQUIREMENTS DASHBOARD SUMMARY
# =====================================================
@router.get("/{company_id}/summary")
def get_summary(
    company_id: str,
    db: Session = Depends(get_db)
):

    rows = (
        db.query(ProductionRequirement)
        .filter(
            ProductionRequirement.company_id == company_id
        )
        .all()
    )

    total_orders = len(rows)

    total_order_qty = sum(
        float(x.ordered_qty or 0)
        for x in rows
    )

    total_stock = sum(
        float(x.available_stock or 0)
        for x in rows
    )

    total_pending = sum(
        float(x.pending_production or 0)
        for x in rows
    )

    total_utilized = sum(
        float(x.existed_stock_util or 0)
        for x in rows
    )

    return {
        "total_orders": total_orders,
        "ordered_qty": round(total_order_qty, 2),
        "available_stock": round(total_stock, 2),
        "utilized_stock": round(total_utilized, 2),
        "pending_production": round(total_pending, 2)
    }


# =====================================================
# STATUS WISE COUNT
# =====================================================
@router.get("/{company_id}/status-count")
def status_count(
    company_id: str,
    db: Session = Depends(get_db)
):

    data = (
        db.query(
            ProductionRequirement.status,
            func.count(ProductionRequirement.id)
        )
        .filter(
            ProductionRequirement.company_id == company_id
        )
        .group_by(
            ProductionRequirement.status
        )
        .all()
    )

    return [
        {
            "status": row[0],
            "count": row[1]
        }
        for row in data
    ]


# =====================================================
# DELETE SNAPSHOT
# =====================================================
@router.delete("/{company_id}")
def delete_snapshot(
    company_id: str,
    db: Session = Depends(get_db)
):

    deleted = (
        db.query(ProductionRequirement)
        .filter(
            ProductionRequirement.company_id == company_id
        )
        .delete()
    )

    db.commit()

    return {
        "success": True,
        "deleted_rows": deleted
    }