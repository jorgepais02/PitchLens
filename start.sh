#!/usr/bin/env bash
#
# Arranque automático de PitchLens (backend + frontend).
#
# Levanta la aplicación completa desde cero: entorno virtual, dependencias,
# base de datos PostgreSQL, seed de datos, modelos y ambos servidores.
# Es idempotente: si ya está todo instalado, solo arranca.
#
#   ./start.sh
#
# Requisitos: Python 3.13, Docker y Node.js instalados.
# (En Windows, ejecutar desde WSL o seguir los pasos manuales del README.)

set -euo pipefail
cd "$(dirname "$0")"

echo "▶ PitchLens — arranque automático"

# --- 1. Comprobación de requisitos ---------------------------------------
command -v docker >/dev/null || { echo "✗ Falta Docker. Instálalo y vuelve a intentarlo."; exit 1; }
command -v node   >/dev/null || { echo "✗ Falta Node.js. Instálalo y vuelve a intentarlo."; exit 1; }
PY=$(command -v python3.13 || command -v python3) || { echo "✗ Falta Python 3.13."; exit 1; }

# Si Docker no está arrancado, se intenta abrir automáticamente y se espera.
if ! docker info >/dev/null 2>&1; then
  echo "▶ Docker no está arrancado; intentando abrirlo..."
  if [ "$(uname)" = "Darwin" ]; then
    open -a Docker 2>/dev/null || true
  elif command -v systemctl >/dev/null 2>&1; then
    sudo systemctl start docker 2>/dev/null || true
  fi
  echo "▶ Esperando a que Docker arranque (hasta 120 s)..."
  for _ in $(seq 1 120); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || { echo "✗ Docker sigue sin arrancar. Ábrelo manualmente y reintenta."; exit 1; }
fi
echo "  Python: $("$PY" --version)"

# --- 2. Entorno virtual + dependencias del backend -----------------------
if [ ! -d .venv ]; then
  echo "▶ Creando entorno virtual..."
  "$PY" -m venv .venv
fi
echo "▶ Instalando dependencias del backend (puede tardar la primera vez)..."
./.venv/bin/pip install -q --disable-pip-version-check -r requirements.txt -r requirements-ml.txt

# --- 3. Configuración (.env) ---------------------------------------------
if [ ! -f .env ]; then
  echo "▶ Generando .env con una clave JWT aleatoria..."
  cp .env.example .env
  SECRET=$("$PY" -c "import secrets; print(secrets.token_hex(32))")
  SECRET="$SECRET" "$PY" - <<'PY'
import os, pathlib
p = pathlib.Path(".env")
t = p.read_text()
t = t.replace("changeme-genera-una-clave-aleatoria-larga", os.environ["SECRET"])
t = t.replace(
    'CORS_ORIGINS=["http://localhost:5173"]',
    'CORS_ORIGINS=["http://localhost:5173","http://localhost:5174","http://localhost:4173"]',
)
p.write_text(t)
PY
fi

# --- 4. Base de datos PostgreSQL -----------------------------------------
echo "▶ Levantando PostgreSQL (Docker)..."
docker compose up -d db
echo "▶ Esperando a que la base de datos acepte conexiones..."
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U kraken >/dev/null 2>&1; then break; fi
  sleep 1
done

# --- 5. Seed de datos (idempotente: no inserta si ya está poblada) --------
echo "▶ Poblando la base de datos..."
./.venv/bin/python -m src.db.etl

# --- 6. Modelos preentrenados (incluidos; se regeneran si faltan) --------
if [ ! -f models/market.pkl ]; then
  echo "▶ Entrenando los modelos preentrenados..."
  ./.venv/bin/python -m src.ml.train_models
fi

# --- 7. Dependencias del frontend ----------------------------------------
if [ ! -d frontend/node_modules ]; then
  echo "▶ Instalando dependencias del frontend..."
  (cd frontend && npm install)
fi

# --- 8. Arranque de ambos servidores -------------------------------------
echo "▶ Arrancando la API en http://localhost:8000 ..."
./.venv/bin/uvicorn src.api.main:app --host 127.0.0.1 --port 8000 &
API_PID=$!
trap 'echo; echo "▶ Parando servidores..."; kill "$API_PID" 2>/dev/null || true' EXIT INT TERM

echo
echo "════════════════════════════════════════════════════════"
echo "  PitchLens en marcha:"
echo "    • Frontend → http://localhost:5173"
echo "    • API      → http://localhost:8000"
echo "  Pulsa Ctrl+C para parar."
echo "════════════════════════════════════════════════════════"
echo

cd frontend && npm run dev
