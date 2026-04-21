# 🏴󠁧󠁢󠁥󠁮󠁧󠁿 Premier League — Datos Raw

## Fuente

| | |
|---|---|
| **Proveedor** | [football-data.co.uk](https://www.football-data.co.uk/) |
| **Código de liga** | `E0` |
| **Temporadas** | 2014/15 – 2023/24 (10) |
| **Equipos/temporada** | 20 → 380 partidos/temporada |
| **Formato** | CSV (uno por temporada) |

## Nomenclatura de archivos

```
premier_YYYY_YY_raw.csv       ← datos originales sin procesar
```

## Particularidades

- Cobertura: 380 partidos por temporada, con 1 fila completamente vacía en **2014/15** (fila 380), eliminada durante el EDA individual.
- Diferencial: incluye variable `Referee` en todas las temporadas (excluida del core multi-league por ausencia en otras ligas).

## Diccionario de variables (core)

> Las 43 variables comunes a todas las temporadas (44 incluyendo `Referee`). Los CSVs raw contienen columnas adicionales que varían por temporada.

### Identificación

| Variable | Descripción |
|----------|-------------|
| `Div` | Código de la liga (`E0`) |
| `Date` | Fecha del partido (dd/mm/yy) |
| `HomeTeam` | Equipo local |
| `AwayTeam` | Equipo visitante |

### Resultados

| Variable | Descripción |
|----------|-------------|
| `FTHG` | Goles local (final) |
| `FTAG` | Goles visitante (final) |
| `FTR` | Resultado final: `H` local, `D` empate, `A` visitante |
| `HTHG` | Goles local (descanso) |
| `HTAG` | Goles visitante (descanso) |
| `HTR` | Resultado descanso: `H`, `D`, `A` |

### Estadísticas del partido

| Variable | Descripción |
|----------|-------------|
| `HS` / `AS` | Tiros (local / visitante) |
| `HST` / `AST` | Tiros a puerta |
| `HF` / `AF` | Faltas cometidas |
| `HC` / `AC` | Córners |
| `HY` / `AY` | Tarjetas amarillas |
| `HR` / `AR` | Tarjetas rojas |

### Cuotas de apuestas (mercado 1X2)

| Prefijo | Casa | Columnas | Notas |
|---------|------|----------|-------|
| `B365` | Bet365 | `B365H`, `B365D`, `B365A` | ✅ 100% cobertura |
| `BW` | bwin | `BWH`, `BWD`, `BWA` | ✅ Estable |
| `IW` | Interwetten | `IWH`, `IWD`, `IWA` | ⚠️ ~48% nulos en 23/24 |
| `PS` | Pinnacle | `PSH`, `PSD`, `PSA` | ✅ Referencia académica |
| `PSC` | Pinnacle (cierre) | `PSCH`, `PSCD`, `PSCA` | Cuotas de cierre |
| `VC` | VC Bet | `VCH`, `VCD`, `VCA` | ✅ Estable |
| `WH` | William Hill | `WHH`, `WHD`, `WHA` | ✅ Estable |

> **Nota sobre cuotas de cierre**: el sufijo `C` indica odds de cierre (pre-partido). Ej: `B365CH` = cierre Bet365 local. Solo Pinnacle tiene cierre en el core.

## Output procesado

Los CSVs de esta carpeta se procesan en `notebooks/01_eda_raw/01_eda_premier.ipynb` y producen:

```
data/processed/premier/core_validated.parquet   — 3.800 filas × 43 cols
data/processed/premier/core_schema.json
```

## Referencia completa

Documentación oficial de todas las variables (incluidas las no presentes en el core):
[football-data.co.uk/notes.txt](https://www.football-data.co.uk/notes.txt)
