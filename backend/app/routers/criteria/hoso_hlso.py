@router.post("/hoso_hlso")
def save_hoso_hlso(
    request: Request,
    id: int = Form(None),
    species: str = Form(...),
    hoso_count: int = Form(...),
    hlso_yield_pct: float = Form(...),
    date: str = Form(...),
    time: str = Form(...),
    email: str = Form(""),
    company_id: str = Form(""),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    email = session_email
    company_id = session_company_id

    # --------------------------------------------------------
    # DUPLICATE CHECK  (Species + HOSO Count must be unique)
    # --------------------------------------------------------
    duplicate = db.query(HOSO_HLSO_Yields).filter(
        HOSO_HLSO_Yields.species == species,
        HOSO_HLSO_Yields.hoso_count == hoso_count,
        HOSO_HLSO_Yields.company_id == company_id
    ).first()

    # INSERT → block if duplicate found
    if id is None or id == "":
        if duplicate:
            return templates.TemplateResponse(
                "criteria/hoso_hlso.html",
                {
                    "request": request,
                    "message": "⚠️ Duplicate Found! Same Species + HOSO Count already exists.",
                    "today_data": db.query(HOSO_HLSO_Yields)
                        .filter(HOSO_HLSO_Yields.company_id == company_id)
                        .order_by(HOSO_HLSO_Yields.id.desc()).all(),
                    "species_list": [row[0] for row in db.execute("SELECT DISTINCT species_name FROM species").fetchall()]
                }
            )

    # EDIT → block if duplicate belongs to another record
    else:
        if duplicate and duplicate.id != id:
            return templates.TemplateResponse(
                "criteria/hoso_hlso.html",
                {
                    "request": request,
                    "message": "⚠️ Duplicate Found! Another record has same Species + HOSO Count.",
                    "today_data": db.query(HOSO_HLSO_Yields)
                        .filter(HOSO_HLSO_Yields.company_id == company_id)
                        .order_by(HOSO_HLSO_Yields.id.desc()).all(),
                    "species_list": [row[0] for row in db.execute("SELECT DISTINCT species_name FROM species").fetchall()]
                }
            )

    # --------------------------------------------------------
    # SAVE / UPDATE
    # --------------------------------------------------------

    # UPDATE
    if id:
        row = db.query(HOSO_HLSO_Yields).filter(
            HOSO_HLSO_Yields.id == id,
            HOSO_HLSO_Yields.company_id == company_id
        ).first()

        if row:
            row.species = species
            row.hoso_count = hoso_count
            row.hlso_yield_pct = hlso_yield_pct
            row.date = date
            row.time = time
            row.email = email
            db.commit()

    # INSERT
    else:
        new_row = HOSO_HLSO_Yields(
            species=species,
            hoso_count=hoso_count,
            hlso_yield_pct=hlso_yield_pct,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)
        db.commit()

    return RedirectResponse("/criteria/hoso_hlso", status_code=302)
