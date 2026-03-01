# Fase de Integración xG — Planificación

> **Objetivo:** Enriquecer el core dataset limpio con métricas de Expected Goals (xG) procedentes de Understat.
> **Posición en el pipeline:** después de `03_cleaning` y antes de la carga a BD.

---

## Sobre la fuente: Understat vs. alternativas

| Fuente | Cobertura | Formato | Calidad xG | Notas |
|--------|-----------|---------|------------|-------|
| **Understat** | LaLiga, Premier, Bundesliga + otras | API unofficial / scraping | ✅ Propio modelo | Buena cobertura desde 2014/15. API no oficial pero estable. |
| **FBref (StatsBomb)** | Muy amplia | Scraping HTML / API | ✅ StatsBomb (gold standard) | Más completo (xA, progressive passes, etc.), pero más complejo de extraer. |
| **Opta / StatsPerform** | Profesional | API de pago | ✅✅ Referencia industrial | No accesible para TFG sin licencia. |
| **Sofascore** | Amplia | Scraping | ⚠️ Modelo propio no publicado | Menos transparente metodológicamente. |

**Recomendación:** Understat es perfectamente válido para un TFG. Su modelo de xG es conocido y documentado, la cobertura de las 3 ligas desde 2014/15 es completa, y existen librerías Python (`understat`) que simplifican la extracción. Si quisieras ir un paso más allá, FBref vía `soccerdata` daría acceso al modelo StatsBomb, pero añadiría complejidad de ingesta sin mejorar sustancialmente el resultado para los objetivos del proyecto.

---

## Pipeline propuesto para la integración

```
Understat API
     ↓
[Notebook] 03_eda_xg_raw.ipynb       ← EDA del dataset xG raw
     ↓
[Notebook] 04_clean_merge_xg.ipynb   ← Limpieza xG + merge con core clean
     ↓
data/processed/core_enriched.parquet ← Dataset final listo para BD
```

---

## Notebooks propuestos

### `03_eda_xg_raw.ipynb`

EDA del dataset de xG antes de cualquier transformación:

- [ ] Cobertura temporal: verificar que cubre 2014/15–2023/24 en las 3 ligas.
- [ ] Cobertura de partidos: número de partidos por liga/temporada vs. los esperados (380/306).
- [ ] Variables disponibles: identificar qué métricas ofrece Understat (xG home/away, xGA, shots, etc.).
- [ ] Formato de fechas y nombres de equipos — detectar diferencias respecto a football-data.
- [ ] Valores nulos y partidos sin cobertura.
- [ ] Validación de rango de xG (valores > 0, sin outliers extremos).

### `04_clean_merge_xg.ipynb`

Limpieza del xG raw + merge con el core limpio:

- [ ] **Normalizar nombres de equipos** — Construir mapping entre nomenclatura Understat y football-data (el problema más probable). Ej: `"Atletico Madrid"` → `"Ath Madrid"`.
- [ ] **Normalizar fechas** — Asegurar mismo formato datetime para el join.
- [ ] **Merge por clave compuesta** — `LEFT JOIN` del core sobre xG usando `Date` + `HomeTeam` + `AwayTeam` + `Div` (o `league`).
  - Left join para conservar todos los partidos del core, con xG nulo si no hay match.
- [ ] **Auditoría del merge**:
  - % de partidos con xG disponible.
  - Partidos sin match → revisar si son errores de nombre o gaps reales de cobertura.
- [ ] **Decisión sobre partidos sin xG**: descartar, mantener con null o imputar con media de la temporada.
- [ ] **Validar el dataset enriquecido**: dimensiones, tipos, unicidad de `match_id`.
- [ ] **Exportar** `data/processed/core_enriched.parquet` + metadatos actualizados.

---

## Variables xG esperadas de Understat

| Variable | Descripción |
|----------|-------------|
| `xG_home` | xG generado por el equipo local |
| `xG_away` | xG generado por el equipo visitante |
| `xGA_home` | xG concedido por el equipo local (= `xG_away`) |
| `xGA_away` | xG concedido por el equipo visitante (= `xG_home`) |
| `npxG_home` / `npxG_away` | xG sin penaltis (si disponible) |

> Confirmar variables disponibles durante el EDA xG.

---

## Riesgos y decisiones pendientes

1. **Mapping de nombres de equipos** — Es el riesgo principal. Understat usa nombres completos ("Manchester City"), football-data usa abreviados ("Man City"). Habrá que construir un diccionario o usar fuzzy matching.
2. **Partidos de Bundesliga 2014/15** — Understat puede no tener cobertura completa en temporadas muy antiguas. Verificar en el EDA.
3. **Formato de liga** — Understat usa strings como `"La liga"`, `"EPL"`, `"Bundesliga"`. Habrá que mapear a los códigos `Div` del core (SP1, E0, D1).
