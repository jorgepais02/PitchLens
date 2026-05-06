# PLAN — Backend Football Analytics

Documento de referencia del backend: arquitectura, modelo de datos, orden de
implementación, reglas y continuación hacia modelado, predicción y auth.

Alcance inmediato: **Fase 6** (BD + seed + endpoints GET básicos).
Alcance reflejado: **Fase 7** (ML) y **Fase 8** (API extendida + JWT).

---

## 1. Contexto

Aplicación web de predicción de resultados de fútbol (H/D/A) como TFG.
Pipeline completo: EDA → Cleaning → xG → Features → EDA Analítico → **BD** →
**Modelado** → **FastAPI** → React.

Fuentes de datos (ya generadas, **no se modifican**):

- `data/processed/enriched/core_enriched.parquet` — 10.660 × 35, 0 nulos,
  fuente de verdad (hechos + stats + odds + xG). Rango 2014-08-16 → 2024-05-26.
- `data/processed/features/core_features.parquet` — 9.792 × 17, 0 nulos,
  12 features + target `FTR` + cols de identificación. 868 partidos menos por
  cold start (8,1 %).

---

## 2. Stack

- **Python 3.13**
- **FastAPI** + **SQLModel** + **PostgreSQL 16**
- **pydantic-settings** — configuración vía `.env`
- **pandas / numpy** — ETL y features
- **scikit-learn** — modelos ML (Fase 7)
- **Docker Compose** — solo Postgres local (volumen nombrado)
- Sin dependencias nuevas fuera de este stack

---

## 3. Arquitectura

Tres capas, **sin repository pattern** ni service layer vacía. Son 5 tablas:
las capas abstractas sin lógica de dominio serían coste puro.

```
Router (FastAPI)  ──►  Queries SQLModel (Session)  ──►  Postgres
     │
     └──►  Schemas Pydantic (DTOs, separados del ORM)
```

### Decisiones estructurales

- **SQLModel tables ≠ Response DTOs.** No expongo los modelos de tabla como
  respuesta: rompe encapsulación y obliga a añadir cols ocultas cuando aparezca
  `password_hash` en Fase 8. Cada entidad tiene su `XRead` en `api/schemas.py`.
- **Config centralizada** en `src/core/config.py` vía `pydantic-settings`.
  Un único `settings` importable. Sin dispersión de `os.getenv`.
- **`src/db/` aislado.** `database.py` y `models.py` son **inmutables** tras
  Fase 6. La evolución (ETL, seed, mantenimiento) vive en `etl.py` y derivados.
- **Sin Alembic en Fase 6.** `SQLModel.metadata.create_all()` basta para un
  TFG con un único autor. Se añade encima de un schema existente sin fricción
  si algún día hace falta versionar migraciones.
- **Sin auth en Fase 6.** Users y JWT pertenecen a Fase 8 — mezclarlos aquí
  volvería condicional el seed y las queries básicas.
- **Sin caché (Redis, `lru_cache`).** 10.660 filas + índices = Postgres vuela.
  Optimizar cuando haya evidencia, no antes.

---

## 4. Estructura de carpetas `src/`

```
src/
├── analysis/         EXISTENTE — utilidades EDA
├── utils/            EXISTENTE — validation.py
├── ingest/           EXISTENTE — load_raw.py
├── features/         EXISTENTE — build_features.py + helpers
├── core/             NUEVO
│   ├── __init__.py
│   └── config.py         # Settings pydantic-settings (.env)
├── db/               NUEVO
│   ├── __init__.py
│   ├── database.py       # engine, SessionLocal, get_db()  — INMUTABLE tras F6
│   ├── models.py         # 5 tablas SQLModel               — INMUTABLE tras F6
│   └── etl.py            # seed desde parquets, idempotente, CLI-runnable
├── api/              NUEVO
│   ├── __init__.py
│   ├── main.py           # create_app() + lifespan + CORS + include_routers
│   ├── deps.py           # get_db re-export + Pagination
│   ├── schemas.py        # DTOs Pydantic (un solo archivo)
│   └── routers/
│       ├── __init__.py
│       ├── health.py
│       ├── leagues.py
│       ├── seasons.py
│       ├── teams.py
│       └── matches.py
└── ml/               NUEVO (esqueleto, Fase 7)
```

**Por qué `schemas.py` único y no `schemas/` por recurso:** con 5 entidades
simples un archivo de ~100-150 líneas es más fácil de leer que un paquete. Se
parte solo si pasa de ~300.

---

## 5. Modelo de datos SQLModel

Star schema, 5 tablas. **PK `int` autoincrement** en todas (joins rápidos,
convención Postgres, evita arrastrar strings largos por FKs). El identificador
natural del parquet (`match_id`) se conserva como `slug` en `matches`.

### 5.1 `leagues` — 3 filas

| col | tipo | notas |
|---|---|---|
| `id` | int PK | |
| `code` | str unique idx (≤ 20) | `premier`, `laliga`, `bundesliga` |
| `name` | str (≤ 60) | `Premier League`, `LaLiga`, `Bundesliga` |

### 5.2 `seasons` — 30 filas (3 ligas × 10 temporadas)

| col | tipo | notas |
|---|---|---|
| `id` | int PK | |
| `start_year` | int idx | `2015`…`2024` (convertido desde `Season` string) |
| `label` | str | `'2015/16'` |
| `league_id` | int FK → `leagues.id` idx | |
| UNIQUE(`league_id`, `start_year`) | | |

Justificación: `Season='2020'` en Premier y LaLiga son entidades distintas
(ventanas temporales, equipos y calendario diferentes). FK a `league` permite
filtrar `/seasons?league_code=premier` sin joins extra.

### 5.3 `teams` — 93 filas

| col | tipo | notas |
|---|---|---|
| `id` | int PK | |
| `name` | str idx (≤ 80) | `Arsenal`, `Real Madrid`… |
| `league_id` | int FK → `leagues.id` idx | |
| UNIQUE(`league_id`, `name`) | | |

Justificación: verificado que **0 equipos aparecen en >1 liga** en este
dataset; la UI navega `liga → equipo local → equipo visitante`. Si en el
futuro hay que soportar ascensos/descensos compartidos, se extrae a
`team_league_history` — **no ahora**.

### 5.4 `matches` — 10.660 filas (tabla de hechos)

| col | tipo | notas |
|---|---|---|
| `id` | int PK | |
| `slug` | str unique idx (≤ 120) | `'premier_2015_arsenal_crystal_palace'` (era `match_id` en parquet) |
| `date` | datetime idx | |
| `league_id` | int FK → `leagues.id` idx | redundante con `season` pero acelera filtros comunes |
| `season_id` | int FK → `seasons.id` idx | |
| `home_team_id` | int FK → `teams.id` idx | |
| `away_team_id` | int FK → `teams.id` idx | |
| **Resultado** | | |
| `fthg`, `ftag` | int | |
| `ftr` | str(1) | `H`/`D`/`A`, CheckConstraint |
| `hthg`, `htag` | int | |
| `htr` | str(1) | |
| **Stats (renombradas)** | | |
| `home_shots`, `away_shots` | int | desde `HS`, `AS` (`as` es keyword) |
| `home_shots_on_target`, `away_shots_on_target` | int | `HST`, `AST` |
| `home_fouls`, `away_fouls` | int | `HF`, `AF` |
| `home_corners`, `away_corners` | int | `HC`, `AC` |
| `home_yellows`, `away_yellows` | int | `HY`, `AY` |
| `home_reds`, `away_reds` | int | `HR`, `AR` |
| **Odds** | | |
| `b365h`, `b365d`, `b365a` | float | Bet365 |
| `psh`, `psd`, `psa` | float | **Pinnacle apertura** |
| `psch`, `pscd`, `psca` | float | **Pinnacle cierre** (usadas en `prob_diff_market`) |
| **xG** | | |
| `home_xg`, `away_xg` | float | Understat |

### 5.5 `match_features` — 9.792 filas (1-a-1 parcial con matches)

| col | tipo | notas |
|---|---|---|
| `id` | int PK | |
| `match_id` | int FK → `matches.id` **unique** idx | 1-a-1, puede faltar en cold start |
| `elo_diff_pre` | float | |
| `points_diff_global` | float | |
| `points_diff_venue` | float | |
| `goal_diff_last5_global` | float | |
| `xg_diff_last5_global` | float | |
| `xg_conceded_diff_last5_global` | float | |
| `sot_diff_last5_global` | float | |
| `goal_diff_last5_venue` | float | |
| `rest_days_diff` | float | |
| `prob_diff_market` | float | |
| `h2h_goal_diff_last5` | float | H2H, cold start imputado a 0 |
| `h2h_result_diff_last5` | float | H2H, cold start imputado a 0 |

Justificación de tabla separada (no columnas en `matches`):

1. `matches` es fuente de verdad **inmutable**; `match_features` es derivada
   y puede regenerarse con otro pipeline sin tocar los hechos.
2. Cold start: 868 partidos sin features — evita columnas nulables dispersas
   en una tabla de 35 cols.
3. FK `unique` permite refrescar features (`DELETE + INSERT`) sin efectos
   colaterales sobre `matches`.

### 5.6 Relaciones (resumen)

```
League 1─N Season
League 1─N Team
League 1─N Match          (denormalización defensiva, filtros frecuentes)
Season 1─N Match
Team   1─N Match (home)
Team   1─N Match (away)
Match  1─1 MatchFeatures  (opcional; null en cold start)
```

---

## 6. Orden de implementación (Fase 6)

**Criterio**: stack vertical antes que amplitud horizontal. Tener `/leagues`
funcionando end-to-end (BD real → router → JSON) antes de escribir los otros
routers detecta problemas de config/conexión/DTOs con superficie mínima.

1. **`core/config.py`** — sin settings no hay DSN. `DATABASE_URL`, `ENV`,
   `CORS_ORIGINS`.
2. **`db/database.py`** — engine + `SessionLocal` + `get_db()`. Validar
   conexión con `SELECT 1`.
3. **`db/models.py`** — las 5 tablas, completas. **Congelado tras esto.**
4. **`db/etl.py`** — seed desde parquets. Sin esto, nada es testeable
   end-to-end. Ejecutable: `python -m src.db.etl --wipe`.
5. **`api/main.py` + `routers/health.py`** — confirmar que arranca y la BD
   responde. Mínimo viable.
6. **`api/schemas.py` (esqueleto) + `routers/leagues.py`** — primer endpoint
   real. Valida que Pydantic response + SQLModel query casan bien.
7. **`routers/seasons.py`, `routers/teams.py`** — mismo patrón, con filtros
   por `league_code`.
8. **`routers/matches.py`** — paginación, filtros múltiples, detalle con
   features embebidas, stats agregadas por equipo.

**Punto de revisión con el usuario**: tras el paso 3 (models.py) para validar
el schema antes de poblar la BD.

---

## 7. Script de seed (`src/db/etl.py`)

### 7.1 Diseño

- CLI: `python -m src.db.etl [--wipe] [--only dimensions|matches|features]`
- **Idempotente**: por defecto `drop_all` + `create_all` + bulk insert
  (dataset pequeño, seed en <30 s).
- **Una transacción global** — si falla, rollback total.
- Pandas → dicts → `session.add_all()` (bulk), no ORM row-by-row.

### 7.2 Orden estricto (FKs lo imponen)

```
1. SQLModel.metadata.create_all(engine)

2. seed_leagues()
   ├─ 3 filas fijas: {code, name}
   └─ commit → dict {code: league_id}

3. seed_seasons(league_id_map)
   ├─ df_enriched[['League','Season']].drop_duplicates() → 30 filas
   ├─ Season (str) → int start_year; label = f'{y}/{(y+1)%100:02d}'
   └─ commit → dict {(league_id, start_year): season_id}

4. seed_teams(league_id_map)
   ├─ union(HomeTeam, AwayTeam) por League → 93 filas
   └─ commit → dict {(league_id, name): team_id}

5. seed_matches(league_id_map, season_id_map, team_id_map)
   ├─ df_enriched completo (10.660 filas)
   ├─ renombrado de cols (HS→home_shots, etc.)
   ├─ resolución de FKs vía maps en memoria
   └─ bulk insert → dict {slug: match_id}

6. seed_match_features(match_id_map)
   ├─ df_features (9.792 filas)
   ├─ lookup de match.id vía slug (match_id del parquet)
   └─ bulk insert
```

### 7.3 Logging y asserts

- Logger nombrado `seed`, formato `[SEED] %(levelname)s %(message)s`.
- Niveles: `INFO` pasos, `WARNING` counts inesperados, `ERROR` aborto.
- Tras cada paso:
  ```
  expected, got = 30, len(seasons_inserted)
  if expected != got:
      log.error('seasons: expected=%d got=%d', expected, got)
      raise AssertionError(...)
  log.info('seasons: inserted %d rows', got)
  ```
- Counts esperados: **3 leagues, 30 seasons, 93 teams, 10660 matches,
  9792 match_features**.
- Al final, resumen global: tiempo total y count por tabla.
  ```
  [SEED] INFO done in 12.4s
  [SEED] INFO summary: leagues=3 seasons=30 teams=93 matches=10660 features=9792
  ```

---

## 8. Endpoints GET básicos (Fase 6)

| # | Endpoint | Query params | Respuesta | Notas |
|---|---|---|---|---|
| 1 | `GET /health` | — | `{status, db}` | `SELECT 1` a BD. Si falla, **503** con `db: "error"` |
| 2 | `GET /leagues` | — | `LeagueRead[]` | 3 filas, sin paginación |
| 3 | `GET /seasons` | `league_code?` | `SeasonRead[]` | filtrable |
| 4 | `GET /teams` | `league_code?` | `TeamRead[]` | orden alfabético |
| 5 | `GET /teams/{id}` | — | `TeamDetailRead` | con `league` embebida |
| 6 | `GET /matches` | `league_code?`, `season?`, `team_id?`, `limit=50`, `offset=0` | `MatchListRead[]` | orden `date desc`, sin features |
| 7 | `GET /matches/{slug}` | — | `MatchDetailRead` | **features embebidas**, `null` en cold start |
| 8 | `GET /teams/{id}/stats` | `season?` | `TeamStatsRead` | wins/draws/losses, goles f/c, xG f/c, últimos 5, `matches_with_features_pct` |

Orden y justificación:

- **1-4**: CRUD plano sobre dimensiones. Valida deps y schemas.
- **5**: primera respuesta con relación embebida. Valida `selectinload`.
- **6**: primera con filtros combinados + paginación. Marca el patrón para
  queries complejas.
- **7**: primera 1-a-1 opcional (features puede ser null). Resuelve el caso
  cold start cara al frontend.
- **8**: primera query agregada. Valida que queries analíticas (`GROUP BY`)
  funcionan antes de Fase 7 (donde el predictor las necesita).

---

## 9. Reglas de implementación

### 9.1 Código

- **Type hints** obligatorios en todas las funciones públicas.
- **Docstrings en español** en funciones públicas.
- **Comentarios y nombres de variables internas en español.**
- Helpers de módulo con underscore (`_build_team_view`).
- Sin dependencias externas nuevas fuera del stack definido.

### 9.2 Estructura y disciplina

- `src/db/database.py` y `src/db/models.py` **no se modifican** tras Fase 6.
  Cualquier evolución vive en otros módulos.
- Nunca mezclar datos reales (`matches`) con derivados (`match_features`) —
  son tablas separadas por diseño.
- Sin split aleatorio para ML: el fútbol es serie temporal.

### 9.3 Seed (`etl.py`)

- Logging estructurado con niveles, **no `print`**.
- Assert de counts esperados tras cada paso, con log de `expected vs got`
  antes de levantar.
- Resumen final: tiempo total y count por tabla.
- Una transacción global, rollback total en error.

### 9.4 API

- `/health` hace `SELECT 1` real. **503** si la BD no responde.
- Response DTOs siempre separados de los modelos de tabla.
- Paginación común (`limit`, `offset`) como dependencia compartida en
  `api/deps.py`.

### 9.5 Git

- Rama `feature/fase-6-bd` desde `main`. Merge con `--no-ff`.
- Prefijos de commit: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Nunca commitear directamente en `main`.

---

## 10. Decisiones y simplificaciones

Lo que NO se hace en Fase 6 y por qué:

- **No Alembic** — `create_all` en seed. Se añade cuando haya migraciones
  reales que versionar.
- **No Repository / UoW / Service layer** — 5 tablas, queries directas en
  routers o helpers por archivo.
- **No auth / users** — Fase 8.
- **No caché** — optimizar con evidencia.
- **No tasks/celery/background jobs** — seed es `python -m`, suficiente.
- **No Docker compose completo** — solo Postgres. Backend corre local en dev.
  El compose completo llega en Fase 9 (backend + frontend + pg).
- **No tests de API** en Fase 6 tras cada router. Tests de seed y queries
  CRUD básicas sí (`tests/test_db.py`). Tests de integración full cuando haya
  dos routers que combinen.

---

## 11. Continuación — Fase 7: Modelado ML

**Objetivo**: producir los 3 modelos preentrenados + soporte para modo custom
de usuario.

### 11.1 Artefactos

```
models/
├── baseline.pkl
├── extended.pkl
├── market.pkl
└── metrics.json         # accuracy, log-loss, matriz confusión — en val y test
```

### 11.2 Split temporal (nunca aleatorio)

- Train: temporadas ≤ 2022 (7.745 partidos)
- Validation: temporada 2023 (1.028)
- Test: temporada 2024 (1.019, nunca visto)

### 11.3 Modelos preentrenados (mismo algoritmo LR para aislar efecto features)

| Modelo | Features |
|---|---|
| `baseline` | `elo_diff_pre` + `points_diff_global` + `goal_diff_last5_global` |
| `extended` | baseline + `xg_diff_last5_global` + `xg_conceded_diff_last5_global` + `goal_diff_last5_venue` |
| `market` | extended − `elo_diff_pre` + `prob_diff_market` (el mercado reemplaza al ELO, r=0.90) |

Algoritmo: **Logistic Regression** en los 3 para aislar el efecto de las
features (confirmado con tutor).

### 11.4 Modo custom usuario

- Algoritmos: **LR**, **Decision Tree**, **Random Forest**, **XGBoost**.
- DT, RF y XGBoost requieren `CalibratedClassifierCV(method='sigmoid')` para
  que las probabilidades sean comparables con LR.
- Feature importance:
  - LR → coeficientes directos.
  - DT/RF/XGBoost → permutation importance (más justa que impurity-based).

### 11.5 Módulos Python

- `src/ml/train_models.py` — entrena y persiste los 3 preentrenados +
  `metrics.json`. Idempotente, CLI-runnable.
- `src/ml/predictor.py` — carga modelos, calcula predicciones y feature
  importance. Es el componente que usarán los endpoints de Fase 8.
- `tests/test_models.py` — existencia de artefactos, probabilidades válidas
  (suma 1, sin NaN), feature importance en [0, 1] y orden descendente,
  sanity direccional (local/visitante dominante), detector de empates predichos,
  invariante market (sin elo, con prob_market), split temporal sin contaminación,
  métricas en rango calibrado por modelo, input inválido y modelo inexistente.

### 11.6 Partidos hipotéticos (input en producción)

Dado que el usuario puede pedir predicción sobre dos equipos cualquiera de la
BD, las features se calculan en caliente desde el historial reciente:

- ELO: valor acumulado tras el último partido conocido de cada equipo.
- Rolling 5: a partir de los últimos 5 partidos en BD.
- Temporada actual: asumir la última temporada disponible del equipo.
- `prob_diff_market`: **no disponible** en partido hipotético (no hay cuotas).
  El modelo `market` **no se ofrece** para partidos hipotéticos — solo
  baseline y extended están disponibles en ese modo (decisión cerrada).

Aviso de cold start: si algún equipo tiene < WINDOW partidos de historial,
la predicción se degrada y la UI debe mostrar aviso.

---

## 12. Continuación — Fase 8: API extendida + JWT

### 12.1 Nuevas tablas (requieren migración del schema cerrado en Fase 6)

Al añadirlas se acepta que Fase 6 considera `models.py` inmutable **para las
5 tablas del star schema**. Las tablas de la Fase 8 se añaden en archivos
nuevos o como ampliación explícita en ese momento, con commit dedicado:

| tabla | propósito |
|---|---|
| `users` | id, email (unique), password_hash (argon2), created_at |
| `custom_models` | id, user_id FK, name, algorithm, features (JSONB), metrics (JSONB), artifact_path, created_at |

### 12.2 Endpoints adicionales

| método | endpoint | notas |
|---|---|---|
| GET | `/models` | lista preentrenados + custom del usuario autenticado |
| GET | `/features/available` | las 12 features con descripción y rango |
| POST | `/predict` | `{home_team, away_team, league, model}` → `{prob_h, prob_d, prob_a, feature_importance}` |
| POST | `/predict/custom` | idem con `model_id` de un `custom_model` — requiere JWT |
| POST | `/train` | `{features:[...], algorithm}` → `{model_id, metrics}` — requiere JWT |
| POST | `/auth/register` | email + password → JWT |
| POST | `/auth/login` | email + password → JWT |

### 12.3 Autenticación JWT

- Librería: `python-jose` o `pyjwt` (decidir al arrancar Fase 8).
- Hash de password: **argon2** vía `passlib`.
- Access token JWT en header `Authorization: Bearer …`.
- Sin refresh tokens en MVP TFG (tokens de larga duración, p.ej. 24 h).
- Dependencia FastAPI: `get_current_user(token)` → `User` o 401.

### 12.4 Rutas protegidas

- `/studio` (frontend) y por tanto `POST /train`, `POST /predict/custom`,
  `GET /models` en su parte custom.
- El resto de endpoints GET (leagues, seasons, teams, matches, stats, models
  preentrenados, predict público) son **abiertos**.

### 12.5 Modelos del usuario

- `POST /train`: la API recibe features + algoritmo, entrena con el split
  temporal estándar, persiste el artefacto en `models/custom/{user_id}_{uuid}.pkl`
  y guarda la fila en `custom_models`.
- Límite defensivo: máximo N modelos activos por usuario (p. ej. 5) — política
  anti-abuso. Al superar el límite, se borra el más antiguo.
- `GET /models` agrupa: sección `preentrenados` (baseline/extended/market) y
  sección `custom` del usuario autenticado.

---

## 13. Orden global de fases

| fase | estado | contenido |
|---|---|---|
| 1 | completado | EDA estructural (RAW) |
| 2 | completado | Cleaning → `core_multi_league_clean.parquet` |
| 3 | completado | Integración xG → `core_enriched.parquet` |
| 4 | completado | Feature Engineering → `core_features.parquet` |
| 5 | completado | EDA analítico features |
| 6 | completado | BD star schema + seed + endpoints GET básicos |
| **7** | **completado** | Modelado ML (`src/ml/`) — preentrenados + custom |
| 8 | pendiente | FastAPI extendida + JWT + `/predict`, `/train`, `/models` |
| 9 | pendiente | Frontend React + Vite + Recharts |

---

## 14. Pendiente técnico global

- Separar `requirements.txt` en `requirements.txt` (prod) +
  `requirements-dev.txt` + `requirements-pipeline.txt` cuando Fase 7 esté
  lista (faltarán `fastapi`, `uvicorn`, `sqlmodel`, `scikit-learn`,
  `psycopg2-binary`, `python-jose`, `passlib[argon2]`).

---

## 15. Punto de revisión

Cuando se apruebe este PLAN, se implementa en este orden y **se para tras
`models.py`** para validar el schema antes de tocar ETL:

1. `src/core/config.py`
2. `src/db/database.py`
3. `src/db/models.py`  ← **checkpoint con el usuario**
4. `src/db/etl.py` + counts + logging
5. `docker-compose.yml` (solo Postgres)
6. `src/api/main.py` + `routers/health.py`  ← arranque verificado
7. Schemas + resto de routers en orden (`leagues` → `seasons` → `teams`
   → `matches` → `teams/{id}/stats`).
