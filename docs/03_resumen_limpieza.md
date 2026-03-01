# ✅ Fase de Limpieza — Resumen de Ejecución

> **Dataset de entrada:** `data/processed/core_multi_league_validated.parquet` (10.660 partidos × 43 variables)
> **Notebook:** `notebooks/03_clean/03_clean_unified.ipynb`
> **Dataset de salida:** `data/processed/core_multi_league_clean.parquet` (10.660 × 33 variables)

---

## Transformaciones aplicadas

### 1. Conversión de `Date` a datetime

Conversión a `datetime64` con verificación de rangos temporales por liga (agosto 2014 – junio 2024).

### 2. Transformación de `Div` a `League`

Mapeo de códigos de liga a nombres legibles usando `config/leagues.json`:

| Código | Liga |
|--------|------|
| `SP1` | `laliga` |
| `E0` | `premier` |
| `D1` | `bundesliga` |

Columna `Div` eliminada tras la transformación.

### 3. Generación de `match_id`

Clave compuesta única con formato `YYYYMMDD_League_Home_Away`. Nombres normalizados (strip, lowercase, sin espacios). Unicidad verificada al 100%.

### 4. Derivación de `Season`

Temporada derivada desde `Date` con corte Y-JUL (agosto→julio): 10 temporadas por liga, de 2015 a 2024.

### 5. Selección de casas de apuestas

Análisis de cobertura global y por temporada para las 6 casas del core:

| Casa | Decisión | Razón |
|------|----------|-------|
| **B365** (Bet365) | ✅ Conservada | 100% cobertura, mayor casa retail |
| **PS** (Pinnacle) | ✅ Conservada | Referencia académica, márgenes bajos, apertura + cierre |
| IW (Interlive) | ❌ Eliminada | ~50% nulos en 2023/24 |
| BW (bwin) | ❌ Eliminada | Redundante con B365 |
| VC (VC Bet) | ❌ Eliminada | Redundante |
| WH (William Hill) | ❌ Eliminada | Redundante |

**12 columnas eliminadas** → dataset reducido de 45 a 33 columnas.

### 6. Imputación de nulos en Pinnacle

Estrategia en cascada:

1. **PS apertura** (PSH/PSD/PSA) → imputados con cuotas B365 equivalentes
2. **PS cierre** (PSCH/PSCD/PSCA) → imputados con PS apertura del mismo partido

Resultado: **0 nulos** en todas las columnas de cuotas conservadas.

---

## Validación final

Sanity check post-transformaciones (todas las validaciones detalladas se realizaron en los EDA):

| Check | Resultado |
|-------|-----------|
| FTR/HTR categorías | ✅ {H, D, A} |
| `match_id` único | ✅ 10.660 únicos |
| Nulos totales | ✅ 0 |
| Valores negativos | ✅ 0 |
| Filas | ✅ 10.660 |

---

## Artefactos generados

| Archivo | Descripción |
|---------|-------------|
| `data/processed/core_multi_league_clean.parquet` | Dataset limpio (10.660 × 33) |
| `data/processed/core_multi_league_clean_schema.json` | Esquema JSON del dataset limpio |

---

## Tests automatizados

Suite de tests en `tests/` ejecutable con `pytest tests/ -v`:

| Archivo | Tests | Cobertura |
|---------|-------|-----------|
| `test_eda_outputs.py` | 13 | Dataset validado: estructura, esquema, integridad |
| `test_clean_outputs.py` | 22 | Dataset limpio: transformaciones, bookmakers, nulls por scope |
| `conftest.py` | — | Fixtures compartidos (carga de parquets y schemas) |

**35/35 tests passing.**

---

## Estado del dataset limpio

| Métrica | Valor |
|---------|-------|
| Partidos | 10.660 |
| Columnas | 33 |
| Ligas | 3 (bundesliga, laliga, premier) |
| Temporadas | 10 (2015–2024) |
| Nulos | 0 |
| Casas de apuestas | B365 + Pinnacle (apertura + cierre) |

**El dataset está listo para la fase de integración de xG.**
