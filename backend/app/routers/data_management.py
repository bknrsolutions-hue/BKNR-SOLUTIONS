from fastapi import APIRouter, Request, Depends, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse
from sqlalchemy.orm import Session
from app.database import get_db

import os
import pandas as pd
from datetime import datetime

router = APIRouter()


# =====================================================
# DATA MANAGEMENT PAGE
# =====================================================

@router.get("/data-management", response_class=HTMLResponse)
async def data_management(
    request: Request,
    db: Session = Depends(get_db)
):
    templates = request.app.state.templates

    return templates.TemplateResponse(
        "admin/data_management.html",
        {
            "request": request
        }
    )


# =====================================================
# DOWNLOAD TEMPLATE
# =====================================================

@router.get("/data-management/template/{module}")
async def download_template(module: str):

    template_dir = "templates_excel"
    os.makedirs(template_dir, exist_ok=True)

    file_path = os.path.join(
        template_dir,
        f"{module}.xlsx"
    )

    if not os.path.exists(file_path):
        return {
            "success": False,
            "message": f"{module} template not found"
        }

    return FileResponse(
        path=file_path,
        filename=f"{module}_template.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


# =====================================================
# EXPORT DATA
# =====================================================

@router.post("/data-management/export")
async def export_data(
    module: str = Form(...),
    db: Session = Depends(get_db)
):

    export_dir = "exports"
    os.makedirs(export_dir, exist_ok=True)

    filename = f"{module}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join(export_dir, filename)

    df = pd.DataFrame()
    df.to_excel(filepath, index=False)

    return FileResponse(
        filepath,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


# =====================================================
# IMPORT EXCEL
# =====================================================

@router.post("/data-management/import")
async def import_excel(
    module: str = Form(...),
    excel_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):

    try:

        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)

        filepath = os.path.join(
            upload_dir,
            excel_file.filename
        )

        with open(filepath, "wb") as buffer:
            buffer.write(await excel_file.read())

        df = pd.read_excel(filepath)

        total_rows = len(df)

        # ==========================================
        # FUTURE IMPORT LOGIC
        # ==========================================

        if module == "gate_entry":
            pass

        elif module == "raw_material":
            pass

        elif module == "grading":
            pass

        elif module == "peeling":
            pass

        elif module == "soaking":
            pass

        elif module == "production":
            pass

        elif module == "suppliers":
            pass

        elif module == "buyers":
            pass

        elif module == "species":
            pass

        elif module == "grades":
            pass

        return {
            "success": True,
            "module": module,
            "rows_imported": total_rows
        }

    except Exception as e:

        return {
            "success": False,
            "error": str(e)
        }


# =====================================================
# IMPORT HISTORY
# =====================================================

@router.get("/data-management/history")
async def import_history():

    return {
        "success": True,
        "history": []
    }