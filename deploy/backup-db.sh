#!/usr/bin/env bash
# =============================================================
# Backup de la base de datos y de los modelos custom.
#
# Pensado para ejecutarse desde cron en el VPS. No necesita sudo:
# basta con pertenecer al grupo "docker".
#
# Instalación (ver docs/08_despliegue.md):
#   scp deploy/backup-db.sh <servidor>:~/
#   chmod +x ~/backup-db.sh
#   crontab -e   →   30 4 * * * /home/<usuario>/backup-db.sh
# =============================================================
set -euo pipefail

BACKUP_ROOT="${HOME}/backups"
RETENCION_DIAS=7
DESTINO="${BACKUP_ROOT}/$(date +%Y%m%d-%H%M%S)"

# Cron corre con un PATH mínimo y sin /usr/local/bin
export PATH="/usr/local/bin:/usr/bin:/bin"

mkdir -p "${DESTINO}"

# --- Base de datos -------------------------------------------------
# pg_dump escribe el error en stderr pero puede salir con codigo 0 si el
# fallo ocurre dentro de la tuberia, de ahi el PIPESTATUS explicito.
docker exec pitchlens-db-1 pg_dump -U kraken -d pitchlens \
  | gzip > "${DESTINO}/pitchlens.sql.gz"
if [ "${PIPESTATUS[0]}" -ne 0 ]; then
  echo "ERROR: pg_dump fallo, se descarta el backup incompleto" >&2
  rm -rf "${DESTINO}"
  exit 1
fi

# Un dump valido nunca es diminuto: si lo es, algo ha ido mal.
if [ "$(stat -c%s "${DESTINO}/pitchlens.sql.gz")" -lt 1024 ]; then
  echo "ERROR: el dump pesa menos de 1 KB, se descarta" >&2
  rm -rf "${DESTINO}"
  exit 1
fi

# --- Modelos custom de los usuarios --------------------------------
docker run --rm \
  -v pitchlens_custom_models:/vol:ro \
  -v "${DESTINO}":/backup \
  alpine tar czf /backup/custom_models.tgz -C /vol .

# --- Configuración del despliegue ----------------------------------
cp -a /etc/caddy/Caddyfile "${DESTINO}/" 2>/dev/null || true

# --- Rotación ------------------------------------------------------
# Solo se borran directorios con el patrón de fecha, nunca nada más.
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d \
  -regex '.*/[0-9]\{8\}-[0-9]\{6\}$' -mtime "+${RETENCION_DIAS}" \
  -exec rm -rf {} + 2>/dev/null || true

echo "$(date +'%F %T')  backup ok  ${DESTINO}  ($(du -sh "${DESTINO}" | cut -f1))"
