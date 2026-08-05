# Imagen de la API de PitchLens para despliegue (VPS + docker-compose).
# No se usa en desarrollo local (ahí corre con .venv/bin/uvicorn vía start.sh).

FROM python:3.13-slim

WORKDIR /app

# Dependencias del sistema para psycopg2-binary y compilación de paquetes ML.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt

COPY src/ src/
COPY config/ config/
COPY models/*.pkl models/metrics.json models/
RUN mkdir -p models/custom

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
