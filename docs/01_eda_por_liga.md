# 01 — EDA por liga

> Análisis exploratorio independiente de La Liga, Premier League y Bundesliga.
> Notebook: `notebooks/01_eda_raw/01_eda_*.ipynb`

---

## Objetivo

Evaluar calidad, completitud e integridad de los datos raw por liga para fundamentar un pipeline de limpieza unificado.

---

## Contexto en el pipeline

> [!NOTE]
> Este documento cubre la **primera etapa**. Diagrama completo del pipeline:

```mermaid
graph LR
    classDef src fill:#eef1f4,stroke:#64748b,color:#0f172a,stroke-width:1px
    classDef step fill:#ffffff,stroke:#94a3b8,color:#0f172a,stroke-width:1px
    classDef out fill:#2d6a4f,stroke:#1f4d39,color:#ffffff,stroke-width:1px
    classDef active fill:#1e3a5f,stroke:#0f2a4a,color:#ffffff,stroke-width:2px

    A[CSV raw<br/>football-data.co.uk] -->|01_eda| B[Core por liga<br/>Parquet]
    B -->|02_eda| C[Multi-league<br/>validado]
    C -->|03_clean| D[Multi-league<br/>clean]
    E[Understat<br/>soccerdata] -->|04_eda| F[xG validado]
    D & F -->|05_merge| G[Core enriched<br/>10.660 × 35]
    G -->|06_features| H[Features<br/>9.792 × 17]
    H -->|07_eda_features| I[EDA analítico]

    class A,E src
    class B active
    class C,D,F,H,I step
    class G out
```

---

## Metodología

Los tres notebooks siguen una **metodología idéntica** para permitir comparación directa entre ligas.

| Paso | Descripción |
|------|-------------|
| Carga | 10 CSVs raw por liga, inspección de dimensiones y tipos |
| Core | Columnas presentes en todas las temporadas (intersección) |
| Drift | Estabilidad de `dtypes` a lo largo de las 10 temporadas |
| Completitud | Nulos por variable y temporada |
| Integridad | FTR/HTR válidos, coherencia goles, duplicados, negativos |
| Cuotas | Casas presentes, completitud, cobertura |
| Export | Core por liga en Parquet + schema JSON |

Cada análisis cubre **10 temporadas** (2014-15 a 2023-24), cargadas desde CSVs de football-data.co.uk.

---

## Hallazgos por liga

| Métrica | La Liga | Premier League | Bundesliga |
|---------|---------|----------------|------------|
| Partidos totales | 3.800 | 3.801 | 3.060 |
| Partidos/temporada | 380 (20 eq.) | 380 (20 eq.) | 306 (18 eq.) |
| Equipos únicos | 31 | 34 | 28 |
| Variables en core | 43 | 44 | 43 |
| Nulos en core | 633 (<0.5%) | 602 | 534 |
| Drift de tipos | Ninguno | Aparente | Ninguno |
| Duplicados | 0 | 0 | 0 |

> [!WARNING]
> **Premier 2014-15** contiene 1 fila completamente vacía (fila 380). Provoca drift aparente en 16 columnas (`int64` → `float64`) y un partido "fantasma". No es un cambio real de esquema — se elimina en limpieza.

### Particularidades

- **La Liga** — Core de 43 variables estable. Nulos concentrados en cuotas.
- **Premier** — Core de 44 variables (incluye `Referee`, ausente en otras ligas). Fila vacía a limpiar.
- **Bundesliga** — 18 equipos → 306 partidos/temporada. Sin anomalías.

---

## Core dataset identificado

```mermaid
graph TD
    classDef grp fill:#f8fafc,stroke:#94a3b8,color:#0f172a

    subgraph id1 ["Identificación"]
        A[Date · Div · HomeTeam · AwayTeam]
    end
    subgraph id2 ["Resultado"]
        B[FTHG · FTAG · FTR<br/>HTHG · HTAG · HTR]
    end
    subgraph id3 ["Estadísticas"]
        C[HS · AS · HST · AST<br/>HF · AF · HC · AC<br/>HY · AY · HR · AR]
    end
    subgraph id4 ["Cuotas — 6 casas × H/D/A"]
        D[B365 · BW · IW · PS · VC · WH]
    end

    class A,B,C,D grp
```

**43 variables comunes** (intersección): 4 identificación + 6 resultado + 12 estadísticas + 21 cuotas.

---

## Calidad de cuotas

| Casa | Columnas | Estado |
|------|----------|--------|
| B365 (Bet365) | `B365H/D/A` | Estable |
| BW (bwin) | `BWH/D/A` | Estable |
| IW (interwetten) | `IWH/D/A` | ~50% nulos en 23-24 |
| PS (Pinnacle) | `PSH/D/A` + cierre | Estable |
| VC (VC Bet) | `VCH/D/A` | Estable |
| WH (William Hill) | `WHH/D/A` | Estable |

> [!CAUTION]
> Interwetten presenta degradación severa en la última temporada. Se descarta en la fase de limpieza.

---

## Validaciones superadas

| Check | Resultado |
|-------|-----------|
| Categorías FTR/HTR | Solo H, D, A |
| Coherencia FTR vs. goles | 0 inconsistencias |
| Duplicados | 0 |
| Valores negativos | 0 |
| Nombres de equipos | 0 colisiones |
| Cuotas en rango | [1.0, 100.0] |

---

## Artefactos

| Liga | Archivo | Shape |
|------|---------|-------|
| La Liga | `data/processed/laliga/core_validated.parquet` | 3.800 × 43 |
| Premier | `data/processed/premier/core_validated.parquet` | 3.801 × 44 |
| Bundesliga | `data/processed/bundesliga/core_validated.parquet` | 3.060 × 43 |

Cada parquet acompañado de su `core_schema.json` en la misma carpeta.

---

**Siguiente paso →** [02 — EDA Multi-league](02_eda_multi_league.md)
