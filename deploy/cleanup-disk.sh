#!/usr/bin/env bash
# =============================================================
# Limpieza de espacio en disco dejado por Docker.
#
# En este servidor el disco no lo llenan los logs: lo llena Docker.
# Cada "docker compose build" de la API deja la imagen anterior sin
# etiqueta (dangling) ocupando ~2,7 GB, y el cache de build crece sin
# límite propio. Dos o tres despliegues seguidos son ~8 GB de un disco
# de 38 GB.
#
# Pensado para ejecutarse desde cron en el VPS. No necesita sudo:
# basta con pertenecer al grupo "docker".
#
# Instalación:
#   scp deploy/cleanup-disk.sh <servidor>:~/
#   chmod +x ~/cleanup-disk.sh
#   crontab -e   →   15 5 * * 0 /home/<usuario>/cleanup-disk.sh
# =============================================================
set -euo pipefail

# Días de cache de build que se conservan. El cache reciente es lo que
# hace que un rebuild tarde 1 minuto en vez de 15, así que no se borra
# entero: solo lo que ya no va a reutilizar ninguna capa.
CACHE_DIAS=7

# Cron corre con un PATH mínimo y sin /usr/local/bin
export PATH="/usr/local/bin:/usr/bin:/bin"

libre_antes=$(df -BM --output=avail / | tail -1 | tr -dc '0-9')

# --- Imágenes huérfanas --------------------------------------------
# Sin "-a" deliberadamente: así solo caen las imágenes SIN etiqueta, es
# decir builds viejos de pitchlens-api que ya nadie referencia.
# Con "-a" se llevaría también alpine:latest (la usa backup-db.sh para
# empaquetar los modelos) y habría que descargarla otra vez cada noche.
docker image prune -f > /dev/null

# --- Contenedores parados ------------------------------------------
# Restos de despliegues fallidos. Los dos contenedores buenos están
# corriendo, así que prune no los toca.
docker container prune -f > /dev/null

# --- Cache de build ------------------------------------------------
docker builder prune -f --filter "until=$(( CACHE_DIAS * 24 ))h" > /dev/null

# NOTA: aquí NO se llama nunca a "docker volume prune" ni a
# "docker system prune --volumes". Los volúmenes son
# pitchlens_postgres_data (la base de datos) y pitchlens_custom_models
# (los modelos de los usuarios): borrarlos es perder los datos.

libre_despues=$(df -BM --output=avail / | tail -1 | tr -dc '0-9')
liberado=$(( libre_despues - libre_antes ))

echo "$(date +'%F %T')  limpieza ok  liberados ${liberado} MB  (libre: $(df -h / | tail -1 | awk '{print $4}') de $(df -h / | tail -1 | awk '{print $2}'), uso $(df -h / | tail -1 | awk '{print $5}'))"

# --- Aviso de disco lleno ------------------------------------------
# Si tras limpiar sigue por encima del 80%, el problema no es basura:
# es crecimiento real (BD, modelos custom) y hay que mirarlo a mano.
uso=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "${uso}" -ge 80 ]; then
  echo "AVISO: el disco sigue al ${uso}% despues de limpiar, revisar a mano" >&2
fi
