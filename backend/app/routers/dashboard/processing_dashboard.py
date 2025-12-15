from fastapi import APIRouter

router = APIRouter(prefix="/processing")

@router.get("/")
def processing_data():
    return {
        "page": "processing dashboard",
        "summary": "Processing Summary Soon"
    }
