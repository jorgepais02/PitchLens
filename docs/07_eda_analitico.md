# 07 — EDA Analítico de Features

> Análisis estadístico del `core_features` para validar las 10 features antes del modelado.
> Notebook: `notebooks/07_eda_features/07_eda_analitico_features.ipynb`

---

## Objetivo

Verificar que las features construidas en Fase 4 son estadísticamente válidas y aptas para modelado:

- Analizar distribuciones, outliers y asimetrías
- Medir poder discriminativo de cada feature respecto al target `FTR` (η²)
- Detectar colinealidad entre features
- Producir tabla resumen con decisiones para Fase 7 (Modelado)

---

## Contexto en el pipeline

```mermaid
graph LR
    classDef src fill:#eef1f4,stroke:#64748b,color:#0f172a,stroke-width:1px
    classDef step fill:#ffffff,stroke:#94a3b8,color:#0f172a,stroke-width:1px
    classDef out fill:#2d6a4f,stroke:#1f4d39,color:#ffffff,stroke-width:1px
    classDef active fill:#1e3a5f,stroke:#0f2a4a,color:#ffffff,stroke-width:2px

    A[CSV raw] -->|01–03| D[core_multi_league_clean<br/>10.660 × 33]
    B[Understat] -->|04| F[xg_validated<br/>10.660 × 17]
    D & F -->|05| G[core_enriched<br/>10.660 × 35]
    G -->|06| H[core_features<br/>9.792 × 17]
    H -->|07_eda| I[Validación analítica<br/>→ decisiones modelado]

    class A,B src
    class D,F,G,H step
    class I active
```

---

## Metodología

| Sección | Técnica | Pregunta |
|---------|---------|----------|
| Distribución target | Barplot con % | ¿Qué baseline de accuracy ofrece el dataset? |
| Estadísticos descriptivos | describe + skewness + kurtosis | ¿Hay features sesgadas o con colas pesadas? |
| Histogramas | 10 histogramas con media | ¿Cómo se distribuye cada feature? |
| Correlación | Heatmap Pearson triangular | ¿Qué pares de features están colineales? |
| Violin plots | Por clase FTR (H/D/A) | ¿Separa cada feature las tres clases? |
| η² (correlation ratio) | Barplot ordenado | ¿Qué features tienen más señal respecto al target? |

---

## Distribución del target en core_features

| Resultado | Porcentaje |
|-----------|------------|
| H (local) | 45.6% |
| D (empate) | 24.7% |
| A (visitante) | 29.8% |

> [!IMPORTANT]
> **Baseline de accuracy: 45.6%** — predecir siempre victoria local. Cualquier modelo debe superar este umbral para aportar valor.

La distribución en `core_features` difiere ligeramente de `core_enriched` (H=45.2%, A=30.1%) porque los 868 partidos eliminados por cold start no se distribuyen uniformemente entre clases.

---

## Distribuciones y outliers

### Estadísticos descriptivos

| Feature | Media | Std | Skew | Kurtosis |
|---------|-------|-----|------|----------|
| `elo_diff_pre` | -1.285 | 134.0 | 0.00 | 0.13 |
| `points_diff_global` | -0.188 | 15.0 | -0.02 | 1.46 |
| `points_diff_venue` | 3.926 | 8.5 | 0.45 | 0.95 |
| `goal_diff_last5_global` | -0.073 | 1.44 | 0.02 | 0.25 |
| `xg_diff_last5_global` | -0.076 | 1.11 | 0.01 | 0.16 |
| `xg_conceded_diff_last5_global` | 0.039 | 0.62 | 0.00 | 0.01 |
| `sot_diff_last5_global` | -0.208 | 3.02 | 0.01 | 0.07 |
| `goal_diff_last5_venue` | 0.699 | 1.44 | 0.06 | 0.24 |
| `rest_days_diff` | -0.017 | 2.72 | 0.04 | **802.9** |
| `prob_diff_market` | 0.137 | 0.36 | -0.24 | -0.44 |

**Sin asimetrías relevantes** — ninguna feature supera |skewness| > 1.

### Outliers en `rest_days_diff`

> [!NOTE]
> La única anomalía es `rest_days_diff` con kurtosis = 802, causada por el parón COVID-19 (temporada 2020). Outliers de hasta ±102 días en 248 partidos afectados, con solo 4 casos extremos. No requiere tratamiento — el modelo deberá aprender a ignorar estos valores atípicos.

```
5536 2020-06-20  premier  Brighton → Arsenal          rest_days_diff: +102
5553 2020-06-21  premier  Newcastle → Sheffield Utd   rest_days_diff: +102
5560 2020-06-22  premier  Man City → Burnley           rest_days_diff: -102
```

| Liga | Partidos post-COVID |
|------|---------------------|
| Bundesliga | 46 |
| Premier | 92 |
| La Liga | 110 |
| **Total** | **248** |

---

## Colinealidad entre features

Pares con correlación de Pearson |r| > 0.70:

| Par | r | Explicación |
|-----|---|-------------|
| `prob_diff_market` ↔ `elo_diff_pre` | 0.91 | Ambas miden diferencia de nivel entre equipos |
| `points_diff_global` ↔ `points_diff_venue` | 0.84 | Clasificación general y por localía muy similares |
| `xg_diff_last5_global` ↔ `sot_diff_last5_global` | 0.83 | Más tiros implica más xG por construcción |
| `elo_diff_pre` ↔ `points_diff_global` | 0.83 | ELO y clasificación reflejan nivel similar |

> [!NOTE]
> La colinealidad es manejable: los modelos están diseñados por bloques conceptuales y las features colineales no siempre conviven en el mismo modelo. `rest_days_diff` es la única feature ortogonal al resto (r ≈ 0 con todas).

---

## Poder discriminativo — η² (correlation ratio)

η² mide la varianza de cada feature explicada por el resultado (`FTR`). Rango [0, 1].

| Nivel | Feature | η² |
|-------|---------|-----|
| Alto | `prob_diff_market` | 0.19 |
| Alto | `elo_diff_pre` | 0.15 |
| Medio-alto | `points_diff_global` | 0.11 |
| Medio-alto | `sot_diff_last5_global` | 0.10 |
| Medio-alto | `xg_diff_last5_global` | 0.10 |
| Medio | `goal_diff_last5_venue` | 0.09 |
| Medio | `goal_diff_last5_global` | 0.08 |
| Medio | `points_diff_venue` | 0.08 |
| Bajo | `xg_conceded_diff_last5_global` | 0.05 |
| Bajo | `rest_days_diff` | ≈ 0.00 |


---

## Decisiones para Fase 7

| Feature | Veredicto | Motivo |
|---------|-----------|--------|
| `prob_diff_market` | Incluir — señal dominante | η²=0.19, único feature no calculado |
| `elo_diff_pre` | Incluir | η²=0.15, colineal con mercado pero independiente en modelos `baseline`/`extended` |
| `points_diff_global` | Incluir | η²=0.11 |
| `sot_diff_last5_global` | Incluir | η²=0.10 |
| `xg_diff_last5_global` | Incluir | η²=0.10 |
| `goal_diff_last5_venue` | Incluir | η²=0.09 |
| `goal_diff_last5_global` | Incluir | η²=0.08 |
| `points_diff_venue` | Incluir | η²=0.08, colineal con global pero aporta perspectiva de localía |
| `xg_conceded_diff_last5_global` | Evaluar en contexto | η²=0.05 — incluida en modelo `extended` y `market` |
| `rest_days_diff` | Evaluar en contexto | η²≈0 pero incluida como señal de fatiga; raramente decisiva |

> [!TIP]
> Los modelos preentrenados (`baseline`, `extended`, `market`) están diseñados para aislar el efecto acumulativo de añadir features. El EDA confirma que la jerarquía de η² es coherente con la progresión de bloques A→B→C→D.

---

## Artefactos

| Artefacto | Descripción |
|-----------|-------------|
| `notebooks/07_eda_features/07_eda_analitico_features.ipynb` | Notebook con análisis completo y visualizaciones |

Este EDA no produce ningún parquet — es únicamente análisis y validación. El dataset de entrada (`core_features.parquet`) permanece inalterado.

---

**Siguiente paso →** Fase 6 — Base de datos (star schema con SQLModel)
