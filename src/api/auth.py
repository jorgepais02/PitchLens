"""Utilidades de autenticación: JWT y hash de contraseñas con argon2."""

from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt

from src.core.config import settings

_ph = PasswordHasher()


def hash_password(plain: str) -> str:
    """Devuelve el hash argon2 de una contraseña en texto plano."""
    return _ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Comprueba si la contraseña en texto plano coincide con el hash argon2."""
    try:
        return _ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: int) -> str:
    """Genera un JWT firmado con el user_id como subject."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> int:
    """Decodifica un JWT y devuelve el user_id. Lanza ValueError si es inválido o expirado."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise ValueError("Token inválido o expirado") from exc
