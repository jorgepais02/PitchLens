# Football Analytics TFG

Aplicación web de predicción de resultados de fútbol (H/D/A) con machine learning.
Pipeline completo: EDA → limpieza → xG → features → BD → modelado → FastAPI → React.

## Stack

Python 3.13 · pandas/numpy/scikit-learn · FastAPI + SQLModel + PostgreSQL · React + Vite (Fase 9).

## Puesta en marcha (bootstrap)

```bash
# 1. Entorno virtual
python -m venv .venv && source .venv/bin/activate

# 2. Dependencias
pip install -r requirements.txt -r requirements-ml.txt   # API + ML
pip install -r requirements-dev.txt                      # además, para tests

# 3. Configuración
cp .env.example .env        # edita DATABASE_URL y JWT_SECRET_KEY

# 4. Base de datos PostgreSQL local
docker compose up -d db

# 5. Seed de la BD desde los parquets procesados (idempotente)
python -m src.db.etl         # no inserta nada si ya está poblada
# python -m src.db.etl --wipe # recrear desde cero

# 6. Entrenar los 3 modelos preentrenados (genera models/*.pkl + metrics.json)
python -m src.ml.train_models

# 7. Arrancar la API
uvicorn src.api.main:app --reload
```

Los artefactos `models/*.pkl` están en `.gitignore` (reproducibles con el paso 6).
La API arranca aunque falten: el warmup degrada a carga lazy en lugar de impedir el
arranque, y la primera predicción los usa si existen o devuelve un error claro
indicando ejecutar el paso 6.

## Tests

```bash
pytest -m "not integration"   # rápidos, SQLite en memoria, sin Postgres
pytest                        # incluye integración (requiere API arrancada + datos reales)
```

## Estructura

- `src/features/` — pipeline de feature engineering (anti-leakage vía `shift(1)`).
- `src/db/` — star schema SQLModel + seed (`etl.py`).
- `src/ml/` — entrenamiento (`train_models.py`, `custom_trainer.py`) y predicción (`predictor.py`).
- `src/api/` — FastAPI: routers, auth JWT, construcción de features on-the-fly.
- `tests/` — pytest (pipeline de datos, modelos y API).
