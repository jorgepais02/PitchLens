"""Router de salud — verifica que la API y la BD responden."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.db.database import check_connection

router = APIRouter()


@router.get("/health", tags=["health"])
def health_check() -> JSONResponse:
    """Devuelve el estado de la API y la conexión a la base de datos."""
    db_ok = check_connection()
    payload = {
        "status": "ok",
        "db": "ok" if db_ok else "error",
    }
    # 503 si la BD no responde
    status_code = 200 if db_ok else 503
    return JSONResponse(content=payload, status_code=status_code)
