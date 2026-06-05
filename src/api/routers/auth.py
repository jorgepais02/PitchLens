"""Router de autenticación — POST /auth/register, POST /auth/login."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlmodel import select

from src.api.security import create_access_token, hash_password, verify_password
from src.api.deps import SessionDep
from src.db.auth_models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    """Cuerpo de la petición de registro."""

    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        return v


class LoginRequest(BaseModel):
    """Cuerpo de la petición de inicio de sesión."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """Respuesta con el token JWT."""

    access_token: str
    token_type: str = "bearer"


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, session: SessionDep) -> TokenResponse:
    """Registra un nuevo usuario y devuelve un JWT.

    Devuelve 409 si el email ya está registrado.
    """
    existente = session.exec(select(User).where(User.email == body.email)).first()
    if existente:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")

    user = User(email=body.email, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: SessionDep) -> TokenResponse:
    """Autentica al usuario y devuelve un JWT.

    Devuelve 401 si el email no existe o la contraseña no coincide.
    """
    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )

    return TokenResponse(access_token=create_access_token(user.id))
