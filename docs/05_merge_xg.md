# 05 — Merge xG

> Unión del core clean con los datos de Expected Goals para producir el dataset final enriquecido.
> Notebook: `notebooks/05_merge/05_merge_xg.ipynb`

---

## Entrada / Salida

```mermaid
graph LR
    A[core_multi_league_clean\n10.660 × 33] --> M{Left join\npor match_id}
    B[xg_validated\n10.660 × 17] --> N[Normalización\nmapping + match_id] --> M
    M --> C[core_enriched\n10.660 × 35]

    style A fill:#e8e8e8,stroke:#666
    style B fill:#e8e8e8,stroke:#666
    style C fill:#2d6a4f,color:#fff
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
    subgraph Identificación — 6
        A[League · Date · HomeTeam · AwayTeam\nSeason · match_id]
    end
    subgraph Resultado — 6
        B[FTHG · FTAG · FTR\nHTHG · HTAG · HTR]
    end
    subgraph Estadísticas — 12
        C[HS · AS · HST · AST\nHF · AF · HC · AC\nHY · AY · HR · AR]
    end
    subgraph Cuotas — 9
        D[B365H · B365D · B365A\nPSH · PSD · PSA\nPSCH · PSCD · PSCA]
    end
    subgraph xG — 2
        E[home_xg · away_xg]
    end
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
