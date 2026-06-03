"""Dependencias compartidas de FastAPI: sesión de BD, paginación y usuario autenticado."""

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from src.db.database import get_db

if TYPE_CHECKING:
    from src.db.auth_models import User

SessionDep = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer()


def get_current_user(
    session: SessionDep,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> "User":
    """Extrae y valida el JWT del header Authorization: Bearer <token>.

    Devuelve el User de BD o lanza 401.
    """
    from src.api.auth import decode_access_token
    from src.db.auth_models import User

    try:
        user_id = decode_access_token(credentials.credentials)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido o expirado")

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    return user


CurrentUserDep = Annotated["User", Depends(get_current_user)]


class Pagination:
    """Parámetros de paginación comunes (limit / offset)."""

    def __init__(
        self,
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
    ) -> None:
        self.limit = limit
        self.offset = offset


PaginationDep = Annotated[Pagination, Depends(Pagination)]
