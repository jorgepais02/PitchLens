# Football Analytics TFG — Guía para Claude Code

Aplicación web de predicción de resultados de fútbol (H/D/A) con ML.
Pipeline completo: EDA → Cleaning → xG → Features → EDA Analítico → BD → Modelado → FastAPI → React.

> 📋 **Auditoría técnica del backend** (Fases 6-7 + preparación Fase 8): ver [`AUDITORIA.md`](AUDITORIA.md).

---

## Stack

- **Python 3.13** — backend, pipeline, ML
- **pandas, numpy, scikit-learn** — data y modelos
- **FastAPI + SQLModel + PostgreSQL** — API y BD
- **React + Vite** — frontend SPA, sin SSR
- **Visualizaciones a medida** (SVG + CSS) en frontend — sin librería de gráficos externa

> ⚙️ **Entorno Python**: virtualenv del proyecto en `.venv/`. Usar siempre `.venv/bin/python`
> y `.venv/bin/pytest` (el `python3` del sistema NO tiene las dependencias instaladas).

---

## Estructura del proyecto
src/
analysis/       — utilidades EDA (column_groups, team_consistency)
utils/          — funciones de validación reutilizables (validation.py)
ingest/         — load_raw.py
features/       — build_features.py, etl_features.py
ml/             — train_models.py, predictor.py, custom_trainer.py, _config.py           ← Fase 7
api/            — main.py, deps.py, schemas.py, security.py, routers/                    ← Fase 8
services/       — feature_builder.py  (capa de aplicación: orquesta la predicción)   ← Fase 9
db/             — database.py, models.py, etl.py, auth_models.py   ← Fase 6 + auth (Fase 8)
data/processed/
bundesliga/ laliga/ premier/  — validados por liga
multi_league/             — core_multi_league_validated + core_multi_league_clean
xg/                       — xg_validated.parquet (Understat)
enriched/                 — core_enriched.parquet, 10.660 × 35, fuente de verdad, NO modificar
features/                 — core_features.parquet, output Fase 4, 12 features + target, 9.792 partidos
models/
baseline.pkl / extended.pkl / market.pkl
metrics.json
notebooks/
01_eda_raw/ 02_eda_multi/ 03_clean/ 04_eda_xg/ 05_merge/ 06_features/ 07_eda_features/
tests/
conftest.py
test_common.py
test_validated_outputs.py
test_clean_outputs.py
test_xg_outputs.py
test_enriched_outputs.py
test_features.py
test_models.py                                            ← Fase 7
test_importance.py                                        ← Fase 7 (importancia no-LR)
test_api.py / test_endpoints.py / test_feature_builder.py ← Fase 8

---

## Convenciones de código

- **Type hints** obligatorios en todas las funciones públicas
- **Docstrings en español** en funciones públicas — incluir garantía anti-leakage donde aplique
- **Comentarios en español** — nombres de variables internas en español
- Sin dependencias externas nuevas salvo las ya en `requirements.txt`
- Helpers de módulo con underscore (`_build_team_view`, `_puntos`...)
- Funciones de módulo sin underscore — todas públicas
- Clases de utilidad en `src/` agnósticas a presentación — devuelven valores, no printan

---

## Datos — esquema core_enriched

35 columnas, 0 nulos, tipos correctos.

Columnas clave:
- `Date` (datetime64), `HomeTeam`, `AwayTeam`, `League`, `Season`, `match_id`
- `FTHG`, `FTAG`, `FTR` — resultado final (H/D/A)
- `HST`, `AST` — tiros a puerta
- `home_xg`, `away_xg` — Expected Goals (Understat)
- `B365H`, `B365D`, `B365A` — cuotas Bet365
- `PSH`, `PSD`, `PSA` — cuotas Pinnacle de apertura
- `PSCH`, `PSCD`, `PSCA` — cuotas Pinnacle de cierre (usadas en `prob_diff_market`)

Distribución FTR (core_enriched, 10.660 filas): H=45.2%, D=24.7%, A=30.1%
Distribución FTR (core_features, 9.792 filas, sin cold start): H=45.6%, D=24.7%, A=29.8%
Baseline de accuracy en modelado: 45.6% (mayoría de clase sobre core_features)

---

## Features — 12 en total

| Feature | Bloque | Descripción |
|---|---|---|
| `elo_diff_pre` | A | ELO histórico acumulado, valor pre-partido (K=20, base=1500) |
| `points_diff_global` | A | Puntos acumulados temporada actual (global), home − away |
| `points_diff_venue` | A | Puntos acumulados temporada actual (por localía), home − away |
| `goal_diff_last5_global` | B | Goal diff rolling 5 global, home − away |
| `goal_diff_last5_venue` | B | Goal diff rolling 5 por localía, home − away |
| `sot_diff_last5_global` | B | (HST − AST recibidos) rolling 5 global, home − away |
| `xg_diff_last5_global` | B | (xG generado − concedido) rolling 5 global, home − away |
| `xg_conceded_diff_last5_global` | B | xG concedido rolling 5 global, home − away |
| `rest_days_diff` | C | Días desde último partido en la temporada, home − away |
| `prob_diff_market` | D | (1/PSCH − 1/PSCA) normalizado por overround — cuotas Pinnacle de cierre (PSCH/PSCD/PSCA) |
| `h2h_goal_diff_last5` | E | Media de goal_diff en los últimos 5 H2H del par, perspectiva del local actual. Cold start imputado a 0. |
| `h2h_result_diff_last5` | E | (wins_home − wins_away) / 5 en los últimos 5 H2H del par, perspectiva del local actual. Cold start imputado a 0. |

Constantes: `WINDOW=5`, `H2H_WINDOW=5`, `ELO_K=20`, `ELO_BASE=1500`

FEATURES_ROLLING (cold start — dropna en build_features):
goal_diff_last5_global, xg_diff_last5_global, xg_conceded_diff_last5_global,
sot_diff_last5_global, goal_diff_last5_venue, rest_days_diff

FEATURES_H2H (cold start — fillna(0) en build_features):
h2h_goal_diff_last5, h2h_result_diff_last5

FEATURES (todas, 12):
elo_diff_pre, points_diff_global, points_diff_venue, *FEATURES_ROLLING,
prob_diff_market, *FEATURES_H2H

---

## Regla crítica — anti-leakage

Features vectorizadas usan `shift(1)` antes de `rolling`/`cumsum`.
ELO registra valor pre-partido por construcción.
Cuotas Pinnacle son información pública anterior al partido.

`check_leakage(df_features, df_original)` en `build_features.py` verifica NaN en primer partido
de cada equipo. Se llama internamente dentro de `build_features()` antes del dropna.

Cold start: 868 partidos eliminados (8.1%) — primeros partidos de cada equipo sin historial suficiente.
Existen en `matches` pero no en `match_features`.

---

## Modelos preentrenados

Algoritmo: Logistic Regression con regularización L2 (LogisticRegressionCV, C óptimo por CV temporal).
Mismo algoritmo en los 3 para aislar el efecto de las features (confirmado con tutor).
Features óptimas por bloque encontradas con búsqueda forward en val (expansión progresiva, menor log_loss).

**Por qué LR y no RF:** Se probó RF tuneado (n_estimators=200, min_samples_leaf=50, max_features=0.5,
max_depth=5) y búsqueda exhaustiva de features (3.102 combinaciones). RF no mejoró sobre LR en ningún
bloque de forma consistente — en market LR supera a RF en +0.9pp test accuracy (57.3% vs 56.4%).
El dataset (9.792 partidos) es demasiado pequeño para que RF explote no-linealidades, y la regularización
de LR maneja la colinealidad entre features. LR también es más interpretable para el TFG.

| Modelo | n_feat | Features | Val Acc | Test Acc | Test LogLoss |
|---|---|---|---|---|---|
| `baseline` | 5 | elo_diff_pre, points_diff_global, points_diff_venue, h2h_result_diff_last5, h2h_goal_diff_last5 | 0.5428 | 0.5378 | 0.9565 |
| `extended` | 11 | baseline + goal_diff_last5_global, xg_diff_last5_global, goal_diff_last5_venue, xg_conceded_diff_last5_global, sot_diff_last5_global, rest_days_diff | 0.5409 | 0.5466 | 0.9506 |
| `market` | 6 | points_diff_global, goal_diff_last5_global, xg_diff_last5_global, xg_conceded_diff_last5_global, h2h_goal_diff_last5, prob_diff_market | 0.5360 | **0.5731** | **0.9324** |

Modo custom usuario: LR + Decision Tree + Random Forest + XGBoost.
DT, RF y XGBoost requieren `CalibratedClassifierCV(method='sigmoid')`.
Feature importance: coeficientes LR, media de feature_importances_ sobre folds para RF/DT/XGBoost.

---

## Split temporal
Train      : temporadas ≤ 2022  (7.745 partidos)
Validation : temporada  2023    (1.028 partidos)
Test       : temporada  2024    (1.019 partidos, nunca visto)

Nunca split aleatorio. El fútbol es serie temporal.

---

## BD — star schema
leagues         : id, code, name
teams           : id, name
seasons         : id, end_year, label, league_id
matches         : fact table — resultado + stats + odds + xG (35 cols)
match_features  : tabla derivada — 12 features (FK a matches)

`src/db/database.py` y `models.py` no se modifican en fases posteriores.
FastAPI los importa directamente mediante `get_db()`.
Nunca mezclar datos reales (matches) con derivados (match_features).

---

## App — pantallas
/                   — Predictor hero: liga → equipo local → equipo visitante → modelo → Predecir
Aviso de cold start si algún equipo no tiene historial suficiente
/prediction/{id}    — % H/D/A + feature importance + features elegidas y su peso (modelo custom)
+ comparación cuotas de mercado (solo modelo Market)
+ stats recientes de ambos equipos
/explore            — Estadísticas históricas: filtros por liga / temporada / equipo
/studio             — Mi modelo (requiere registro):
selección de features + algoritmo → entrenamiento → métricas
(Accuracy, Log Loss) → comparación con preentrenados
→ modelo disponible en selector principal junto a los preentrenados

Partidos hipotéticos — el usuario elige dos equipos de BD, la API calcula features
desde el historial reciente. No hay scraping de partidos futuros reales.

---

## Endpoints FastAPI

Catálogo / datos (públicos, GET):
GET  /health
GET  /leagues
GET  /seasons?league_code=
GET  /teams?league_code=
GET  /teams/{team_id}
GET  /teams/{team_id}/stats?season=
GET  /matches?league_code=&season=&team_id=
GET  /matches/h2h?home_team_id=&away_team_id=&limit=   (últimos H2H del par)
GET  /matches/{slug}                                   (detalle de un partido)
GET  /standings?league_code=&season=                   (clasificación calculada sobre matches)
GET  /models                                           (preentrenados + custom del usuario)
GET  /features/available

Predicción / modelado:
POST   /predict                → {home_team, away_team, league, model} → {prob_h, prob_d, prob_a, feature_importance}
POST   /predict/custom         → predicción con modelo del usuario (JWT)
POST   /train                  → {features:[...], algorithm} → 202 {job_id, status}  (background, JWT)
GET    /train/jobs/{job_id}    → estado del job → {status, result?, error?}  (JWT; solo el dueño)
DELETE /models/custom/{model_id} → borra el modelo del usuario y su artefacto .pkl (JWT)

Autenticación (prefijo `/auth`):
POST   /auth/register          → 201 {access_token}
POST   /auth/login             → {access_token}
DELETE /auth/me                → 204, borra la cuenta y sus modelos (JWT)

Autenticación JWT — `/studio`, `/train`, `/train/jobs/{id}`, `/predict/custom`,
`DELETE /models/custom/{id}` y `DELETE /auth/me` requieren usuario registrado.
`/train` es asíncrono: devuelve 202 + job_id y el frontend consulta el progreso en `/train/jobs/{job_id}`
(registro de jobs en memoria del proceso). Las probabilidades de `/predict[/custom]` se renormalizan y
validan (NaN/inf) en `predictor.normalize_probabilities`.

---

## Patrón del notebook

NO definir funciones en el notebook — importar siempre desde `src/`. Cálculo y verificación en una sola celda:

```python
df_x = compute_x(df, WINDOW)
n_nan = df_x["feature"].isna().sum()
check_leakage(df_x.reset_index(), df)

print(f"Shape: {len(df_x):,} filas × {len(df_x.columns)} columnas")
print(f"Cold start (NaN): {n_nan:,} partidos — primeros {WINDOW} sin historial suficiente")
print("✓ Cálculo y leakage verificados")
```

---

## Git workflow

**Los commits los hace el usuario manualmente.** Claude NO debe ejecutar `git add`,
`git commit` ni `git push` salvo petición explícita. Trabajo directamente sobre `main`
(TFG individual, sin ramas feature).

Prefijos de commit (para los que escribe el usuario): `feat:` `fix:` `test:` `docs:` `refactor:` `chore:`

---

## Estado del proyecto

### Completado ✅
- Fase 1 — EDA estructural (RAW)
- Fase 2 — Cleaning → `core_multi_league_clean.parquet`
- Fase 3 — Integración xG → `core_enriched.parquet` (10.660 × 35, 0 nulos)
- Fase 4 — Feature Engineering → `core_features.parquet` (9.792 × 19, 12 features + target + metadata)
- Fase 5 — EDA analítico → `notebooks/07_eda_features/07_eda_analitico_features.ipynb`
- Fase 6 — BD star schema con SQLModel (leagues, teams, seasons, matches, match_features)
- Fase 6 (extensión) — ETL features → BD (`etl_features.py`, poblar `match_features`)
- Fase 7 — Modelado (`src/ml/train_models.py`, `predictor.py`) — LR (confirmado tutor), 3 preentrenados + métricas. Market: test acc=57.3%, log_loss=0.9324

- Fase 8 — FastAPI + JWT, con las correcciones de auditoría aplicadas (TOP 5 + MENOR).
  `src/api/` (security, deps, schemas, routers/), `src/services/feature_builder.py`, `src/db/auth_models.py`,
  `src/ml/custom_trainer.py` + `_config.py`. Tests no-integración en verde
  (`test_api.py`, `test_endpoints.py`, `test_feature_builder.py`, `test_importance.py`).
  Endpoints: auth/register+login, predict, predict/custom, train (async), models, features/available.

### Pendiente ⏳
- Fase 9 — Frontend React + Vite

## Pendiente técnico

- [x] **Manifiesto de dependencias** — separado en `requirements.txt` (prod: fastapi/uvicorn/sqlmodel/
      pydantic-settings/python-jose/argon2/psycopg2/email-validator), `requirements-ml.txt`
      (scikit-learn/joblib/xgboost/pandas/numpy/pyarrow) y `requirements-dev.txt` (pytest/httpx).
      Añadido `.env.example`.
- [x] **Correcciones de auditoría (Fase 8)** — ver [`AUDITORIA.md`](AUDITORIA.md): arranque resiliente
      a `.pkl` ausentes (warmup en try/except → carga lazy), seed idempotente por defecto, tests de
      aislamiento entre usuarios / `feature_builder` / endpoints GET, cacheo del frame histórico por
      liga en `/predict`, `/train` en background (202 + job), validación/normalización de probabilidades.
- [ ] Actualización de BD con nuevos partidos — duda abierta al tutor (ver `ADDENDA.md`).
      Opciones: A (dataset cerrado), B (re-ingest manual documentado, recomendado),
      C (B + endpoint admin en Fase 8), D (append incremental, descartado).
      Fase 6 no depende de esta decisión — el seed ya es **idempotente por defecto**: sin `--wipe`,
      una re-ejecución sobre BD poblada no inserta nada (skip, sin IntegrityError); con `--wipe`
      recrea desde cero.