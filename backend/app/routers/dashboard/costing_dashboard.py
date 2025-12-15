from fastapi import APIRouter

router = APIRouter(prefix="/costing")

@router.get("/")
def costing_data():
    return {
        "page": "costing dashboard",
        "summary": "Costing Summary Soon"
    }
