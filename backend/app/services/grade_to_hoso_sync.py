import math
from sqlalchemy.orm import Session

from app.database.models.criteria import (
    grades,
    varieties,
    glazes,
    species,
    grade_to_hoso
)

BASE_COUNT = {
    "8/12": 12,
    "13/15": 15,
    "16/20": 20,
    "21/25": 25,
    "26/30": 30,
    "31/35": 35,
    "31/40": 40,
    "41/50": 50,
    "51/60": 60,
    "61/70": 70,
    "71/90": 90,
    "91/110": 110,
    "111/130": 130,
    "131/150": 150,
    "100/200": 200,
    "200/300": 300,
    "300/500": 500,
    "BKN": 180,
    "DC": 180,
}


def get_nw_grade_from_hlso(hlso: int) -> str:
    if 8 <= hlso <= 12:
        return "8/12"
    if 13 <= hlso <= 16:
        return "13/15"
    if 17 <= hlso <= 21:
        return "16/20"
    if 22 <= hlso <= 26:
        return "21/25"
    if 27 <= hlso <= 31:
        return "26/30"
    if 32 <= hlso <= 36:
        return "31/35"
    if 37 <= hlso <= 41:
        return "31/40"
    if 42 <= hlso <= 52:
        return "41/50"
    if 53 <= hlso <= 62:
        return "51/60"
    if 63 <= hlso <= 72:
        return "61/70"
    if 73 <= hlso <= 93:
        return "71/90"
    if 94 <= hlso <= 113:
        return "91/110"
    if 114 <= hlso <= 132:
        return "111/130"
    if 133 <= hlso <= 150:
        return "131/150"
    if 151 <= hlso <= 210:
        return "100/200"
    if 211 <= hlso <= 300:
        return "200/300"
    if 301 <= hlso <= 500:
        return "300/500"
    return "DC"


def sync_grade_to_hoso(db: Session, company_id: str, email: str):
    """
    🔥 FINAL – PHOTO BASED LOGIC
    """

    # 1️⃣ FULL CLEAN
    db.query(grade_to_hoso).filter(
        grade_to_hoso.company_id == company_id
    ).delete()
    db.flush()

    grade_list = db.query(grades).filter(
        grades.company_id == company_id
    ).all()

    variety_list = db.query(varieties).filter(
        varieties.company_id == company_id
    ).all()

    glaze_list = db.query(glazes).filter(
        glazes.company_id == company_id
    ).all()

    species_list = db.query(species).filter(
        species.company_id == company_id
    ).all()

    # 2️⃣ REBUILD
    for sp in species_list:
        for g in grade_list:
            for v in variety_list:
                for z in glaze_list:

                    base = BASE_COUNT.get(g.grade_name)
                    if not base:
                        continue

                    glaze_factor = (
                        1
                        if z.glaze_name.upper() == "NWNC"
                        else (100 - float(z.glaze_name.replace("%", ""))) / 100
                    )

                    peel = (float(v.peeling_yield or 100)) / 100
                    soak = (float(v.soaking_yield or 100)) / 100

                    # ✅ HLSO FORMULA
                    hlso = math.floor(base / glaze_factor / peel / soak)

                    # ✅ NW GRADE FROM HLSO
                    nw_grade = (
                        g.grade_name
                        if g.grade_name in ["BKN", "DC"]
                        else get_nw_grade_from_hlso(hlso)
                    )

                    db.add(
                        grade_to_hoso(
                            species=sp.species_name or "NA",
                            grade_name=g.grade_name,
                            variety_name=v.variety_name,
                            glaze_name=z.glaze_name,
                            hlso_count=hlso,
                            nw_grade=nw_grade,
                            email=email,
                            company_id=company_id
                        )
                    )

    db.commit()
