"""Router de autenticación — POST /auth/register, POST /auth/login, DELETE /auth/me."""

import os

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlmodel import select

from src.api.rate_limit import RateLimiter, client_ip
from src.api.security import create_access_token, hash_password, verify_password
from src.api.deps import CurrentUserDep, SessionDep
from src.db.auth_models import CustomModel, User

router = APIRouter(prefix="/auth", tags=["auth"])

# Límites contra fuerza bruta. Solo se cuentan los intentos FALLIDOS de login:
# un usuario que acierta no gasta cuota, y al acertar se le limpia el contador.
#
# Dos limitadores por diseño: el primero protege una cuenta concreta, el segundo
# frena el "password spraying" — probar una misma contraseña contra muchas
# cuentas distintas, que con solo el límite por cuenta pasaría desapercibido.
_LOGIN_POR_CUENTA = RateLimiter(maximo=5, ventana_segundos=15 * 60)
_LOGIN_POR_IP = RateLimiter(maximo=20, ventana_segundos=15 * 60)

# El registro se limita por IP: sin esto se pueden crear cuentas en masa, que es
# lo que da acceso a los endpoints autenticados más costosos (/train).
_REGISTRO_POR_IP = RateLimiter(maximo=5, ventana_segundos=60 * 60)


def _rechazar_si_saturado(espera: int, detalle: str) -> None:
    """Lanza 429 con Retry-After si `espera` es mayor que cero."""
    if espera > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detalle,
            headers={"Retry-After": str(espera)},
        )


def reset_rate_limits() -> None:
    """Vacía los contadores. Pensado para los tests, que comparten proceso."""
    _LOGIN_POR_CUENTA.reset()
    _LOGIN_POR_IP.reset()
    _REGISTRO_POR_IP.reset()


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
def register(body: RegisterRequest, request: Request, session: SessionDep) -> TokenResponse:
    """Registra un nuevo usuario y devuelve un JWT.

    Devuelve 409 si el email ya está registrado y 429 si esa IP ha creado
    demasiadas cuentas en la última hora.
    """
    ip = client_ip(request)
    _rechazar_si_saturado(
        _REGISTRO_POR_IP.segundos_de_espera(ip),
        "Demasiados registros desde esta dirección. Inténtalo más tarde.",
    )
    _REGISTRO_POR_IP.registrar(ip)

    existente = session.exec(select(User).where(User.email == body.email)).first()
    if existente:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email ya registrado")

    user = User(email=body.email, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)

    return TokenResponse(access_token=create_access_token(user.id))


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(session: SessionDep, current_user: CurrentUserDep) -> None:
    """Elimina la cuenta del usuario autenticado y todos sus datos.

    Borra los artefactos .pkl de sus modelos custom en disco y luego la fila
    de usuario; el ON DELETE CASCADE de la FK elimina las filas de custom_models.
    """
    modelos = session.exec(
        select(CustomModel).where(CustomModel.user_id == current_user.id)
    ).all()
    for modelo in modelos:
        try:
            os.remove(modelo.artifact_path)
        except FileNotFoundError:
            pass
        session.delete(modelo)

    session.delete(current_user)
    session.commit()


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, session: SessionDep) -> TokenResponse:
    """Autentica al usuario y devuelve un JWT.

    Devuelve 401 si el email no existe o la contraseña no coincide, y 429 tras
    demasiados intentos fallidos —sobre la misma cuenta o desde la misma IP—.
    Un login correcto no consume cuota y además limpia el contador de la cuenta.
    """
    ip = client_ip(request)
    clave_cuenta = f"{ip}|{body.email.lower()}"

    _rechazar_si_saturado(
        _LOGIN_POR_CUENTA.segundos_de_espera(clave_cuenta),
        "Demasiados intentos fallidos para esta cuenta. Inténtalo más tarde.",
    )
    _rechazar_si_saturado(
        _LOGIN_POR_IP.segundos_de_espera(ip),
        "Demasiados intentos fallidos desde esta dirección. Inténtalo más tarde.",
    )

    user = session.exec(select(User).where(User.email == body.email)).first()
    if user is None or not verify_password(body.password, user.password_hash):
        _LOGIN_POR_CUENTA.registrar(clave_cuenta)
        _LOGIN_POR_IP.registrar(ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas",
        )

    _LOGIN_POR_CUENTA.limpiar(clave_cuenta)
    return TokenResponse(access_token=create_access_token(user.id))
