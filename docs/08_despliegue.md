# Despliegue

Cómo está montado PitchLens en producción y qué hacer para operarlo.

## Topología

```
                    ┌──────────────────────────────┐
   pitchlens.es ───▶│  Vercel (build estático SPA) │
                    └──────────────────────────────┘
                                   │  fetch
                                   ▼
                    ┌──────────────────────────────┐
api.pitchlens.es ──▶│  VPS Ubuntu 24.04 LTS        │
                    │                              │
                    │  Caddy  :80/:443  (TLS auto) │
                    │    └─▶ 127.0.0.1:8000        │
                    │         pitchlens-api-1      │
                    │           └─▶ db:5432        │
                    │              pitchlens-db-1  │
                    └──────────────────────────────┘
```

El frontend es un build estático servido por Vercel; no hay SSR. La API vive en
un VPS con Docker, detrás de Caddy como *reverse proxy*.

**Ningún servicio salvo Caddy y SSH está expuesto a internet.** Tanto la API
(`:8000`) como PostgreSQL (`:5432`) publican sus puertos contra `127.0.0.1`, de
modo que solo son alcanzables desde el propio host.

## Componentes en el VPS

| Componente | Detalle |
|---|---|
| `pitchlens-api-1` | Contenedor construido desde el `Dockerfile` del repo. `restart: unless-stopped` |
| `pitchlens-db-1` | `postgres:16`. `restart: unless-stopped` |
| `caddy.service` | Servicio del sistema (no contenedor), habilitado al arranque |
| `pitchlens_postgres_data` | Volumen Docker — datos de PostgreSQL |
| `pitchlens_custom_models` | Volumen Docker — modelos entrenados por los usuarios en Studio |
| `./data/processed` | Montado **read-only** desde el host: `/train` lee `core_features.parquet` en caliente y los parquets no viajan en la imagen ni en el repo |

Docker y Caddy están habilitados al arranque y los contenedores llevan
`restart: unless-stopped`, así que **el servicio se recupera solo tras un
reinicio del servidor**, sin intervención manual.

## Configuración

El `docker-compose.yml` toma `CORS_ORIGINS` y `JWT_SECRET_KEY` del fichero
`.env` situado junto a él en el servidor. Ese `.env` **no está versionado**
(ver `.gitignore`); la plantilla de referencia es `.env.example`.

En producción, `CORS_ORIGINS` debe incluir el origen de Vercel y `ENV` vale
`production` para silenciar el echo de SQL de SQLAlchemy.

El `Caddyfile` de producción sí está versionado, en `deploy/Caddyfile`.

## Desplegar una versión nueva de la API

El proyecto vive en el home del usuario, no en `/root`, así que **no hace falta
sudo**: basta con pertenecer al grupo `docker`.

```bash
ssh <servidor>
cd ~/PitchLens

git pull
docker compose build api
docker compose up -d api        # recrea solo la API; la BD no se toca

# Verificación
docker compose ps
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/health
curl -s -o /dev/null -w '%{http_code}\n' https://api.pitchlens.es/health
```

Ambas comprobaciones deben devolver `200`. El frontend se despliega solo con
cada push, gestionado por Vercel.

## Backups

`deploy/backup-db.sh` vuelca la base de datos y los modelos custom a
`~/backups/<fecha>/`, conservando los últimos 7 días. **Ya está instalado y
programado en cron a las 04:30**, con log en `~/backups/cron.log`. Para
reinstalarlo desde cero:

```bash
scp deploy/backup-db.sh <servidor>:~/
ssh <servidor> 'chmod +x ~/backup-db.sh && ~/backup-db.sh'   # prueba manual
ssh <servidor> crontab -e
#   30 4 * * * /home/<usuario>/backup-db.sh >> /home/<usuario>/backups/cron.log 2>&1
```

El script aborta y descarta el directorio si `pg_dump` falla o si el dump
resulta sospechosamente pequeño, para no rotar copias buenas sustituyéndolas
por otras vacías.

Restauración de la base de datos:

```bash
gunzip -c ~/backups/<fecha>/pitchlens.sql.gz \
  | docker exec -i pitchlens-db-1 psql -U kraken -d pitchlens
```

Los volúmenes Docker sobreviven a `docker compose down` y a los reinicios; solo
se pierden con `docker compose down -v`, que **nunca** debe ejecutarse en el
servidor.

## Mantenimiento del sistema

Ubuntu aplica actualizaciones desatendidas de seguridad
(`unattended-upgrades`), pero **las que tocan el kernel o `libc6` requieren un
reinicio manual**. Para comprobarlo:

```bash
ls /var/run/reboot-required && cat /var/run/reboot-required.pkgs
```

Un reinicio es seguro: los contenedores vuelven solos. Conviene hacer un backup
antes, y verificar `/health` después.

Consumidores de espacio habituales, por si el disco aprieta:

```bash
docker builder prune -a        # cache de construcción (puede ser de varios GB)
sudo apt-get clean             # paquetes .deb ya instalados
sudo journalctl --vacuum-time=7d
sudo truncate -s 0 /var/log/btmp   # intentos de login fallidos, crece con los bots
```

## Estado de seguridad

Verificado en la auditoría del 14/08/2026:

- SSH solo por clave (`PasswordAuthentication no`). El puerto 22 recibe fuerza
  bruta continua de bots y `/var/log/btmp` crece rápido, pero son intentos
  contra una puerta que no se abre: es ruido, no una amenaza.
- CORS restringido a `https://pitchlens.es`; ningún otro origen recibe
  `Access-Control-Allow-Origin`.
- Solo 22, 80 y 443 expuestos. API y PostgreSQL escuchan en `127.0.0.1`.
- `/train`, `/predict/custom`, `/models` y los `DELETE` exigen JWT.
- La contraseña de PostgreSQL **ya no está en el repo**: se interpola desde
  `POSTGRES_PASSWORD` en el `.env` del servidor. Rotada a 40 caracteres
  aleatorios. Ojo: `POSTGRES_PASSWORD` solo se aplica cuando Postgres
  inicializa el volumen, así que **cambiarla en el `.env` no basta** — hay que
  hacer además `ALTER ROLE kraken WITH PASSWORD '...'` dentro del contenedor.

## Pendiente

- **`/train` no limita la concurrencia** — `post_train` encola con
  `background_tasks.add_task` sin ningún guard. `MAX_CUSTOM_MODELS` limita los
  modelos *guardados*, no los entrenamientos *lanzados*. Como el registro es
  abierto y los jobs corren en el mismo proceso que la API, un usuario puede
  encolar entrenamientos hasta agotar CPU y RAM del VPS, tumbando el servicio
  entero. Arreglo: rechazar con 429 si el usuario ya tiene un job en
  `pending`/`running`, usando el `_JOBS_LOCK` que ya existe.
- **Sin rate limiting en `/auth/login` ni `/auth/register`** — comprobado: seis
  intentos fallidos seguidos devuelven seis `401`, ninguno `429`. Permite
  fuerza bruta sobre las contraseñas y creación masiva de cuentas, que es lo
  que hace explotable el punto anterior.
- **Los contenedores corren como `root`** (uid 0). No están `privileged` ni
  tienen capabilities extra, así que haría falta un escape del runtime para que
  importase, pero añadir un `USER` no-root al `Dockerfile` es barato.
- **`/docs`, `/redoc` y `/openapi.json` son públicos.** No filtran secretos y
  en un TFG puede interesar que estén accesibles; conviene que sea una decisión
  consciente.
- Sin HSTS ni cabeceras de seguridad en Caddy. Menor para una API JSON.
