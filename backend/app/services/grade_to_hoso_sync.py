import math
import re
from sqlalchemy.orm import Session

from app.database.models.criteria import (
    grades,
    varieties,
    glazes,
    species,
    grade_to_hoso,
    HOSO_HLSO_Yields
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


def parse_base_count(grade_name: str) -> int:
    if not grade_name:
        return 0
    g_str = grade_name.strip().upper()
    if g_str in BASE_COUNT:
        return BASE_COUNT[g_str]
    if g_str in ["BKN", "DC"]:
        return 180
    nums = re.findall(r'\d+', g_str)
    if nums:
        try:
            return int(nums[-1])
        except ValueError:
            return 0
    return 0


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


class ItemHolder:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def sync_grade_to_hoso(db: Session, company_id: str, email: str):
    """
    🔥 DYNAMIC & RESILIENT – GENERATES NEW COMBINATIONS FOR ANY GRADE / VARIETY / GLAZE / SPECIES
    """
    from app.services.default_masters import seed_default_masters
    try:
        seed_default_masters(db, company_id, email)
    except Exception as e:
        print("seed_default_masters warning in sync:", e)

    # 1️⃣ FULL CLEAN
    db.query(grade_to_hoso).filter(
        grade_to_hoso.company_id == company_id
    ).delete()
    db.flush()

    grade_list = db.query(grades).filter(
        grades.company_id == company_id
    ).all()
    if not grade_list:
        grade_list = [ItemHolder(grade_name=k) for k in BASE_COUNT.keys()]

    variety_list = db.query(varieties).filter(
        varieties.company_id == company_id
    ).all()
    if not variety_list:
        variety_list = [
            ItemHolder(variety_name="HLSO", peeling_yield="100", soaking_yield="100"),
            ItemHolder(variety_name="PUD", peeling_yield="100", soaking_yield="100")
        ]

    glaze_list = db.query(glazes).filter(
        glazes.company_id == company_id
    ).all()
    if not glaze_list:
        glaze_list = [
            ItemHolder(glaze_name="NWNC"),
            ItemHolder(glaze_name="10%"),
            ItemHolder(glaze_name="20%")
        ]

    species_list = db.query(species).filter(
        species.company_id == company_id
    ).all()
    if not species_list:
        species_list = [
            ItemHolder(species_name="Vannamei"),
            ItemHolder(species_name="Black Tiger")
        ]

    # 2️⃣ HOSO COUNT LOOKUP MAP FROM HOSO_HLSO_YIELDS
    yield_rows = db.query(HOSO_HLSO_Yields).filter(
        HOSO_HLSO_Yields.company_id == company_id
    ).all()
    yield_map = {(y.species, y.hlso_count): y.hoso_count for y in yield_rows}

    seen_combos = set()

    # 3️⃣ REBUILD
    for sp in species_list:
        sp_name = getattr(sp, 'species_name', 'Vannamei') or 'Vannamei'
        for g in grade_list:
            g_name = getattr(g, 'grade_name', '')
            base = parse_base_count(g_name)
            if not base:
                continue

            for v in variety_list:
                v_name = getattr(v, 'variety_name', 'HLSO') or 'HLSO'
                for z in glaze_list:
                    z_name = getattr(z, 'glaze_name', 'NWNC') or 'NWNC'

                    combo_key = (company_id, sp_name, g_name, v_name, z_name)
                    if combo_key in seen_combos:
                        continue
                    seen_combos.add(combo_key)

                    # Safe glaze factor calculation
                    try:
                        gz_str = str(z_name).strip().upper()
                        if not gz_str or gz_str in ["NWNC", "0", "0%"]:
                            glaze_factor = 1.0
                        else:
                            gz_num = float(gz_str.replace("%", "").strip())
                            glaze_factor = (100.0 - gz_num) / 100.0
                            if glaze_factor <= 0:
                                glaze_factor = 1.0
                    except Exception:
                        glaze_factor = 1.0

                    # Safe peeling yield
                    try:
                        peel_num = float(getattr(v, 'peeling_yield', 100) or 100)
                        peel = peel_num / 100.0 if peel_num > 0 else 1.0
                    except Exception:
                        peel = 1.0

                    # Safe soaking yield
                    try:
                        soak_num = float(getattr(v, 'soaking_yield', 100) or 100)
                        soak = soak_num / 100.0 if soak_num > 0 else 1.0
                    except Exception:
                        soak = 1.0

                    # ✅ HLSO FORMULA
                    hlso = math.floor(base / glaze_factor / peel / soak)

                    # ✅ HOSO COUNT LOOKUP
                    hoso_count_val = yield_map.get((sp_name, hlso))

                    # ✅ NW GRADE FROM HLSO
                    nw_grade = (
                        g_name
                        if g_name in ["BKN", "DC"]
                        else get_nw_grade_from_hlso(hlso)
                    )

                    db.add(
                        grade_to_hoso(
                            species=sp_name,
                            grade_name=g_name,
                            variety_name=v_name,
                            glaze_name=z_name,
                            hlso_count=hlso,
                            hoso_count=hoso_count_val,
                            nw_grade=nw_grade,
                            email=email,
                            company_id=company_id
                        )
                    )

    db.commit()
