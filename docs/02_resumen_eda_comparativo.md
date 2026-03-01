# 📊 Resumen del Análisis Exploratorio Comparativo Multi-League

## 1. Objetivos del análisis

El notebook `02_eda_multi_league.ipynb` evalúa la **compatibilidad estructural** de los tres core datasets individuales (La Liga, Premier League, Bundesliga) para determinar la viabilidad de un enfoque de modelado conjunto:

- Comparar esquemas y verificar un subconjunto de variables común a las tres ligas.
- Evaluar la completitud comparativa (nulos cross-league) y la estabilidad de casas de apuestas.
- Validar la integridad del dataset multi-league consolidado.
- Fundamentar la decisión de modelado: conjunto vs. segmentado por liga.

---

## 2. Core unificado: definición y composición

La intersección de los core datasets individuales define un **core unificado de 43 variables** comunes. La variable `Referee`, presente únicamente en el core de la Premier League (44 variables), queda excluida.

| Grupo | Nº | Variables |
|-------|----|-----------|
| Identificación | 4 | `Date`, `Div`, `HomeTeam`, `AwayTeam` |
| Resultados | 6 | `FTHG`, `FTAG`, `FTR`, `HTHG`, `HTAG`, `HTR` |
| Estadísticas | 12 | `HS`, `AS`, `HST`, `AST`, `HF`, `AF`, `HC`, `AC`, `HY`, `AY`, `HR`, `AR` |
| Cuotas | 21 | B365, BW, IW, PS, VC, WH (H/D/A + variantes PS) |

Los tipos de datos son **completamente consistentes** entre ligas: **0 columnas con drift cross-league**.

---

## 3. Comparación de completitud cross-league

### 3.1 Resultados y estadísticas

Completitud total en las tres ligas. Los únicos nulos corresponden a la **fila vacía** de Premier League 2014/15 (0,03%), sin impacto real.

### 3.2 Cuotas de apuestas

| Casa | La Liga | Premier | Bundesliga | Estado |
|------|---------|---------|------------|--------|
| **B365** | ≤0,03% | ≤0,03% | 0% | ✅ Estable |
| **BW** | ≤0,29% | ≤0,29% | ≤0,29% | ✅ Estable |
| **IW** | ~50% (23/24) | ~48% (23/24) | ~53% (23/24) | ⚠️ Degradada |
| **PS** | ≤0,09% | ≤0,09% | ≤0,09% | ✅ Estable |
| **VC** | ≤0,03% | ≤0,03% | 0% | ✅ Estable |
| **WH** | ≤0,03% | ≤0,03% | ≤0,03% | ✅ Estable |

**Casas estables cross-league** (≤5% nulos): B365, BW, PS, VC, WH — 5 casas, 18 columnas (85,7% del total de cuotas).

---

## 4. Validación de integridad multi-league

Validaciones sobre el dataset consolidado (**10.661 partidos**):

| Validación | Resultado |
|------------|-----------|
| Consistencia por temporada | ✅ 380 partidos (LaLiga, Premier), 306 (Bundesliga) |
| Rango temporal | ✅ Ago 2014 – Jun 2024 |
| Coherencia FTR vs. goles | ✅ 0 inconsistencias |
| Duplicados | ✅ 0 detectados |
| Valores negativos | ✅ Ninguno |

---

## 5. Decisión de estrategia: modelado conjunto

### Justificación

- **Esquema idéntico**: 43 variables con tipos consistentes sin drift.
- **Patrones de calidad homogéneos**: mismos nulos, mismas casas estables, mismas validaciones superadas.
- **Diferencia estructural única**: partidos/temporada (306 vs. 380) — afecta volumen, no esquema.

### Estrategia seleccionada

**Modelado conjunto** con `Div` como feature categórica, maximizando el volumen (10.661 partidos) y capturando tanto patrones universales como particularidades por liga. Si el rendimiento es inconsistente, se evaluará segmentación por liga.

---

## 6. Artefacto exportado

| Archivo | Filas | Columnas | Ligas |
|---------|-------|----------|-------|
| `data/processed/core_multi_league_validated.parquet` | 10.660 | 43 | LaLiga, Premier, Bundesliga |

Esquema en `data/processed/core_multi_league_schema.json`.

> **Nota**: El parquet exportado ya excluye la fila vacía de Premier 2014/15 (10.660 filas, no 10.661).
