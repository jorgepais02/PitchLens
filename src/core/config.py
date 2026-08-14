"""Configuración centralizada de la aplicación vía pydantic-settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros de configuración leídos desde variables de entorno o .env."""

    DATABASE_URL: str
    ENV: str = "development"
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    MAX_CUSTOM_MODELS: int = 5

    # Entrenamientos simultáneos en todo el servidor, sumando usuarios. Se
    # ejecutan en el proceso de la API, así que este número es el reparto real
    # de la CPU de la máquina: subirlo por encima de los núcleos disponibles
    # hace que los jobs se estorben entre sí y que la API deje de responder.
    MAX_CONCURRENT_TRAININGS: int = 2

    # La aplicación no la usa: quien la consume es docker-compose.yml, para
    # inicializar el contenedor de PostgreSQL y componer la DATABASE_URL. Se
    # declara aquí porque vive en el mismo .env y el modelo rechaza los campos
    # desconocidos — sin esta línea, tener la variable definida impide arrancar.
    POSTGRES_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


settings = Settings()
