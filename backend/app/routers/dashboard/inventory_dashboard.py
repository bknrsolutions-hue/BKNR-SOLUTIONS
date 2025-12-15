from fastapi import APIRouter

router = APIRouter(prefix="/inventory")

@router.get("/")
def inventory_data():
    return {
        "page": "inventory dashboard",
        "summary": "Inventory Summary Soon"
    }
