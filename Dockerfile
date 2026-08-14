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

# Usuario sin privilegios: por defecto el contenedor corre como root, y un
# escape del runtime saldría con uid 0 en el host.
#
# El UID es fijo y explícito a propósito. El volumen pitchlens_custom_models se
# monta sobre /app/models/custom y, al estar ya inicializado, conserva el owner
# que tuviera (root): Docker solo hereda permisos de la imagen cuando el volumen
# está vacío. Hay que hacerle chown a este mismo UID desde el host o /train no
# podrá guardar los modelos. Ver docs/08_despliegue.md.
RUN useradd --system --uid 10001 --no-create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
