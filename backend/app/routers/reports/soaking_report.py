from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.database.models.processing import Soaking

router = APIRouter(tags=["Soaking Report"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/soaking_report")
def soaking_report(
    request:Request,
    batch:str="",
    count:str="",
    variety:str="",
    species:str="",
    date_val:str="",
    db:Session=Depends(get_db),
):

    cid=request.session.get("company_id")

    base=db.query(Soaking).filter(Soaking.company_id==cid)
    all_rows=base.all()

    batches=sorted({r.batch_number for r in all_rows})
    counts=sorted({r.in_count for r in all_rows})
    varieties=sorted({r.variety_name for r in all_rows})
    sp=sorted({r.species for r in all_rows})
    dates=sorted({str(r.date) for r in all_rows})

    q=base
    if batch: q=q.filter(Soaking.batch_number==batch)
    if count: q=q.filter(Soaking.in_count==count)
    if variety: q=q.filter(Soaking.variety_name==variety)
    if species: q=q.filter(Soaking.species==species)
    if date_val: q=q.filter(Soaking.date==date.fromisoformat(date_val))

    return templates.TemplateResponse("reports/soaking_report.html",{
        "request":request,
        "data":q.all(),
        "batches":batches,"counts":counts,
        "varieties":varieties,"species":sp,"dates":dates,
        "selected_batch":batch,"selected_count":count,
        "selected_variety":variety,"selected_species":species,
        "selected_date":date_val
    })
