# 🔍 Resumen del Análisis Exploratorio Individual por Liga

## 1. Resumen ejecutivo

Se realizó un EDA independiente sobre los datasets históricos de tres ligas europeas: **La Liga** (España), **Premier League** (Inglaterra) y **Bundesliga** (Alemania). Cada análisis abarca **10 temporadas** consecutivas (2014/15–2023/24), cargadas desde archivos CSV raw de [football-data.co.uk](https://www.football-data.co.uk/).

El objetivo fue evaluar calidad, completitud e integridad de los datos en cada liga, identificar un subconjunto estable de variables comunes (core dataset) y detectar problemas para la fase de limpieza.

Los tres EDA siguen una **metodología idéntica**, permitiendo comparación directa y justificando un pipeline de limpieza unificado.

---

## 2. Metodología común

Cada notebook sigue esta estructura estandarizada:

1. **Carga de datos** — Lectura de 10 CSVs raw, inspección de dimensiones y tipos.
2. **Identificación del core** — Columnas presentes en todas las temporadas (intersección).
3. **Análisis de drift** — Estabilidad de `dtypes` a lo largo de las 10 temporadas.
4. **Completitud** — Nulos por variable y temporada, patrones de nulidad.
5. **Validaciones de integridad**:
   - Categorías válidas en `FTR`/`HTR` (solo H, D, A)
   - Coherencia FTR vs. goles
   - Duplicados por clave compuesta
   - Valores negativos
   - Consistencia en nombres de equipos
6. **Cuotas de apuestas** — Casas presentes, mercados completos, cobertura por partido.
7. **Exportación** — Core dataset por liga en Parquet con metadatos JSON.

---

## 3. Hallazgos por liga

### 3.1 Tabla comparativa

| Métrica | La Liga | Premier League | Bundesliga |
|---------|---------|----------------|------------|
| Temporadas | 10 | 10 | 10 |
| Partidos totales | 3.800 | 3.801¹ | 3.060 |
| Partidos/temporada | 380 (20 equipos) | 380 (20 equipos) | 306 (18 equipos) |
| Equipos únicos | 31 | 34 | 28 |
| Variables en core | 43 | 44² | 43 |
| Valores nulos en core | 633 (<0.5%) | 602 | 534 |
| Drift de tipos | Ninguno | Aparente³ | Ninguno |
| Casas de apuestas | 6 | 6 | 6 |
| Duplicados | 0 | 0 | 0 |
| Valores negativos | 0 | 0 | 0 |
| Inconsistencias FTR | 0 | 0 | 0 |

> ¹ Incluye 1 fila completamente vacía (Premier 2014/15, fila 380).
> ² Premier incluye `Referee` en su core individual (44 variables), ausente en las otras ligas.
> ³ Drift causado por la fila vacía (`int64` → `float64` en 16 columnas). No es un cambio real de esquema.

### 3.2 Particularidades por liga

**🇪🇸 La Liga (SP1)**
- Core de 43 variables estable sin anomalías.
- 633 nulos concentrados en cuotas; resultados y estadísticas con completitud total.

**🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League (E0)**
- 1 fila vacía en 2014/15 → requiere `dropna(how='all')`.
- La fila provoca drift aparente en 16 columnas y un partido "fantasma".
- Core individual de 44 variables (incluye `Referee`).

**🇩🇪 Bundesliga (D1)**
- Única liga con 18 equipos → 306 partidos/temporada.
- Core de 43 variables, sin drift ni anomalías.
- 306 partidos exactos en las 10 temporadas.

---

## 4. Core dataset identificado

### 4.1 Variables de identificación (4)

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `Date` | object | Fecha del partido (formato mixto) |
| `Div` | object | Código de liga (SP1, E0, D1) |
| `HomeTeam` | object | Equipo local |
| `AwayTeam` | object | Equipo visitante |

### 4.2 Variables de resultados (6)

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `FTHG` / `FTAG` | int64 | Goles final (local / visitante) |
| `FTR` | object | Resultado final: H, D, A |
| `HTHG` / `HTAG` | int64 | Goles descanso |
| `HTR` | object | Resultado descanso: H, D, A |

### 4.3 Estadísticas del partido (12)

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `HS` / `AS` | int64 | Tiros |
| `HST` / `AST` | int64 | Tiros a puerta |
| `HF` / `AF` | int64 | Faltas |
| `HC` / `AC` | int64 | Córners |
| `HY` / `AY` | int64 | Tarjetas amarillas |
| `HR` / `AR` | int64 | Tarjetas rojas |

### 4.4 Cuotas de apuestas (21)

| Casa | Columnas | Estado |
|------|----------|--------|
| **B365** (Bet365) | `B365H`, `B365D`, `B365A` | ✅ Estable |
| **BW** (bwin) | `BWH`, `BWD`, `BWA` | ✅ Estable |
| **IW** (Interlive) | `IWH`, `IWD`, `IWA` | ⚠️ ~50% nulos en 23/24 |
| **PS** (Pinnacle) | `PSH`, `PSD`, `PSA`, `PSCH`, `PSCD`, `PSCA` | ✅ Estable |
| **VC** (VC Bet) | `VCH`, `VCD`, `VCA` | ✅ Estable |
| **WH** (William Hill) | `WHH`, `WHD`, `WHA` | ✅ Estable |

---

## 5. Métricas de calidad

### 5.1 Completitud

- **Resultados y estadísticas**: 100% (sin contar fila vacía de Premier).
- **Cuotas**: nulos concentrados en IW (hasta ~50% en 2023/24). Resto ≤0,53%.

### 5.2 Validaciones superadas

| Validación | Resultado |
|------------|-----------|
| Categorías FTR/HTR | ✅ Solo H, D, A |
| Coherencia FTR vs. goles | ✅ 0 inconsistencias |
| Duplicados | ✅ 0 detectados |
| Valores negativos | ✅ 0 |
| Nombres de equipos | ✅ 0 colisiones |
| Cuotas en rango [1.0, 100.0] | ✅ |
| Mercados H/D/A completos | ✅ |

### 5.3 Artefactos exportados

| Liga | Archivo | Filas | Columnas |
|------|---------|-------|----------|
| La Liga | `data/processed/laliga/core_raw.parquet` | 3.800 | 43 |
| Premier | `data/processed/premier/core_raw.parquet` | 3.801 | 44 |
| Bundesliga | `data/processed/bundesliga/core_raw.parquet` | 3.060 | 43 |

Cada archivo acompañado de `core_schema.json` con esquema, tipos y temporadas.

---

## 6. Conclusión

Los tres EDA confirman **estabilidad estructural**, **coherencia interna** y **alta completitud**. Los patrones de calidad son idénticos entre ligas, fundamentando la viabilidad de un pipeline de limpieza unificado.
