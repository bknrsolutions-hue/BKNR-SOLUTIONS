import math
from sqlalchemy.orm import Session

from app.database.models.criteria import (
    grades, varieties, glazes, species, grade_to_hoso
)

def sync_grade_to_hoso(db: Session, company_id: str, email: str):

    grade_list = db.query(grades).filter(grades.company_id == company_id).all()
    variety_list = db.query(varieties).filter(varieties.company_id == company_id).all()
    glaze_list = db.query(glazes).filter(glazes.company_id == company_id).all()
    species_list = db.query(species).filter(species.company_id == company_id).all()

    for sp in species_list:
        for g in grade_list:
            for v in variety_list:
                for z in glaze_list:

                    exists = db.query(grade_to_hoso).filter(
                        grade_to_hoso.company_id == company_id,
                        grade_to_hoso.species == sp.species_name,
                        grade_to_hoso.grade_name == g.grade_name,
                        grade_to_hoso.variety_name == v.variety_name,
                        grade_to_hoso.glaze_name == z.glaze_name
                    ).first()

                    if exists:
                        continue

                    # ---------- CALCULATION ----------
                    if g.grade_name in ["BKN", "DC"]:
                        hlso = 0
                        hoso = 0
                        nw_grade = g.grade_name
                    else:
                        high = int(g.grade_name.split("/")[-1])

                        if z.glaze_name == "NWNC":
                            glaze_factor = 1
                        else:
                            glaze_factor = (100 - float(z.glaze_name.replace("%", ""))) / 100

                        peel = (float(v.peeling_yield or 100)) / 100
                        soak = (float(v.soaking_yield or 100)) / 100

                        hlso = math.floor(high / glaze_factor / peel / soak)

                        if hlso <= 40:
                            minus = 1
                        elif hlso <= 70:
                            minus = 2
                        elif hlso <= 110:
                            minus = 5
                        else:
                            minus = 15

                        hoso = int((hlso * 1.54) - minus)
                        nw_grade = g.grade_name

                    row = grade_to_hoso(
                        species=sp.species_name,
                        grade_name=g.grade_name,
                        variety_name=v.variety_name,
                        glaze_name=z.glaze_name,
                        hlso_count=hlso,
                        hoso_count=hoso,
                        nw_grade=nw_grade,
                        email=email,
                        company_id=company_id
                    )

                    db.add(row)

    db.commit()
