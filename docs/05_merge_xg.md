# 05 — Merge xG

> Unión del core clean con los datos de Expected Goals para producir el dataset final enriquecido.
> Notebook: `notebooks/05_merge/05_merge_xg.ipynb`

---

## Entrada / Salida

```mermaid
graph LR
    classDef src fill:#eef1f4,stroke:#64748b,color:#0f172a,stroke-width:1px
    classDef step fill:#ffffff,stroke:#94a3b8,color:#0f172a,stroke-width:1px
    classDef out fill:#2d6a4f,stroke:#1f4d39,color:#ffffff,stroke-width:1px

    A[core_multi_league_clean<br/>10.660 x 33] --> M{Left join<br/>por match_id}
    B[xg_validated<br/>10.660 x 17] --> N[Normalización<br/>mapping + match_id] --> M
    M --> C[core_enriched<br/>10.660 x 35]

    class A,B src
    class M,N step
    class C out
```

| | Core clean | xG validated | Enriched |
|---|-----------|-------------|----------|
| Filas | 10.660 | 10.660 | 10.660 |
| Columnas | 33 | 17 | 35 |
| Nulos | 0 | 0 | 0 |

---

## Normalización del dataset xG

Antes del join, se normalizan las nomenclaturas del xG para coincidir con el core:

| Paso | Antes | Después |
|------|-------|---------|
| Equipos | Nombres completos (Understat) | Abreviados (football-data) |
| Ligas | `ENG-Premier League` | `premier` |
| Temporadas | — | `2015`, ..., `2024` (corte julio) |
| Fechas | `datetime64[ns]` con hora | Truncado a fecha |
| `match_id` | — | `YYYYMMDD_League_Home_Away` |

### Team mapping

34 equipos mapeados via `config/team_mapping_xg.json`:

| Liga | Equipos |
|------|---------|
| Premier | 7 |
| La Liga | 11 |
| Bundesliga | 16 |

---

## Merge

| Aspecto | Detalle |
|---------|---------|
| Tipo | Left join |
| Clave | `match_id` |
| Cobertura | 100% (10.660/10.660) |
| Columnas añadidas | `home_xg`, `away_xg` |

> [!IMPORTANT]
> El merge logra **100% de cobertura** — todos los partidos del core tienen su xG correspondiente. Cualquier fallo aquí indicaría equipos sin mapear.

---

## Validación post-merge

| Check | Resultado |
|-------|-----------|
| Shape | 10.660 × 35 |
| `match_id` único | 10.660 |
| Nulos en xG | 0 |
| xG negativos | 0 |
| xG máximo | < 10 |
| Goles core vs. enriched | Idénticos |
| Columnas del core preservadas | Todas |

---

## Dataset final

```mermaid
graph TD
    classDef grp fill:#f8fafc,stroke:#94a3b8,color:#0f172a
    classDef final fill:#2d6a4f,stroke:#1f4d39,color:#ffffff

    subgraph sg_id ["Identificación (6)"]
        A[League · Date · HomeTeam · AwayTeam<br/>Season · match_id]
    end
    subgraph sg_res ["Resultado (6)"]
        B[FTHG · FTAG · FTR<br/>HTHG · HTAG · HTR]
    end
    subgraph sg_stats ["Estadísticas (12)"]
        C[HS · AS · HST · AST<br/>HF · AF · HC · AC<br/>HY · AY · HR · AR]
    end
    subgraph sg_odds ["Cuotas (9)"]
        D[B365H · B365D · B365A<br/>PSH · PSD · PSA<br/>PSCH · PSCD · PSCA]
    end
    subgraph sg_xg ["xG (2)"]
        E[home_xg · away_xg]
    end

    F[Dataset final<br/>10.660 x 35]

    A --> F
    B --> F
    C --> F
    D --> F
    E --> F

    class A,B,C,D,E grp
    class F final
```

**10.660 partidos × 35 columnas** — 3 ligas × 10 temporadas.

| Métrica | Valor |
|---------|-------|
| Partidos | 10.660 |
| Columnas | 35 |
| Ligas | bundesliga, laliga, premier |
| Temporadas | 10 (2015–2024) |
| Nulos | 0 |

---

## Tests

| Archivo | Tests | Qué valida |
|---------|-------|------------|
| `test_enriched_outputs.py` | 26 | Estructura, xG, integridad del merge, datos |

> [!NOTE]
> Suite completa del pipeline: **82 tests** distribuidos en 4 archivos, ejecutables con `pytest tests/ -v`.

---

## Artefactos

| Archivo | Descripción |
|---------|-------------|
| `data/processed/core_enriched.parquet` | Dataset enriquecido (10.660 × 35) |
| `data/processed/core_enriched_schema.json` | Esquema JSON |
| `config/team_mapping_xg.json` | Mapping de equipos |
| `config/league_mapping.json` | Mapping de ligas |
