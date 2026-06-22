from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.services.traceability_workflow import TraceabilityWorkflowService

router = APIRouter()

# =========================================================================
# SCHEMAS FOR VALIDATIONS
# =========================================================================
class WorkflowSubmitPayload(BaseModel):
    document_type: str # e.g. PURCHASE_ORDER, SALES_APPROVAL
    document_id: int

class WorkflowActionPayload(BaseModel):
    document_type: str
    document_id: int
    approver_role: str # e.g. MANAGER, GM, CEO

# =========================================================================
# 1. TRACEABILITY ENDPOINTS
# =========================================================================
@router.get("/traceability/trace-forward/{lot_no}")
def get_trace_forward(lot_no: str, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    # Execute forward traceability map query
    result = TraceabilityWorkflowService.trace_lot_forward(db, lot_no)
    return {"success": True, "traceability_map": result}

@router.get("/traceability/trace-backward/{container_no}")
def get_trace_backward(container_no: str, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    # Execute backward traceability map query
    result = TraceabilityWorkflowService.trace_container_backward(db, container_no)
    return {"success": True, "traceability_map": result}

# =========================================================================
# 2. WORKFLOW ENGINE ENDPOINTS
# =========================================================================
@router.post("/workflow/submit")
def submit_to_workflow(payload: WorkflowSubmitPayload, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    try:
        approval = TraceabilityWorkflowService.submit_document_for_approval(
            db=db,
            company_id=comp_code,
            document_type=payload.document_type,
            document_id=payload.document_id
        )
        db.commit()
        return {
            "success": True,
            "message": f"Document submitted to sequence workflow routing",
            "current_step": approval.current_sequence,
            "status": approval.status
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/workflow/approve")
def approve_workflow_step(payload: WorkflowActionPayload, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    email = request.session.get("email", "approver@seafood_erp.com")
    
    try:
        res = TraceabilityWorkflowService.approve_document(
            db=db,
            company_id=comp_code,
            document_type=payload.document_type,
            document_id=payload.document_id,
            approver_role=payload.approver_role,
            email=email
        )
        if res["success"]:
            db.commit()
            return res
        else:
            db.rollback()
            raise HTTPException(status_code=400, detail=res["message"])
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/workflow/reject")
def reject_workflow_step(payload: WorkflowActionPayload, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    email = request.session.get("email", "approver@seafood_erp.com")
    
    try:
        res = TraceabilityWorkflowService.reject_document(
            db=db,
            company_id=comp_code,
            document_type=payload.document_type,
            document_id=payload.document_id,
            approver_role=payload.approver_role,
            email=email
        )
        if res["success"]:
            db.commit()
            return res
        else:
            db.rollback()
            raise HTTPException(status_code=400, detail=res["message"])
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
