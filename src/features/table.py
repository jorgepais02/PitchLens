"""Features de temporada: clasificación acumulada y días de descanso."""

from __future__ import annotations

import numpy as np
import pandas as pd

from ._team_view import _build_team_view


def compute_table_features(
    df: pd.DataFrame, *, _tv: pd.DataFrame | None = None
) -> pd.DataFrame:
    """
    Calcula features de clasificación acumuladas en la temporada actual.

    Garantía anti-leakage: shift(1) sobre el cumsum garantiza que cada partido
    usa solo los puntos acumulados en partidos anteriores de la misma temporada y liga.

    points_diff_global: puntos acumulados todos los partidos, local − visitante.
    points_diff_venue:  puntos acumulados por rol (casa/fuera), local − visitante.

    Parámetro interno _tv: team view precalculada por build_features para evitar
    recalcularla múltiples veces. Los notebooks pueden omitirlo.

    Devuelve un DataFrame indexado por match_id con las columnas:
        points_diff_global, points_diff_venue
    """
    tv = _tv.copy() if _tv is not None else _build_team_view(df)

    ftr_map = df.set_index("match_id")[["FTR"]]
    tv = tv.join(ftr_map, on="match_id")

    tv["pts"] = np.where(
        tv["is_home"] == 1,
        tv["FTR"].map({"H": 3, "D": 1, "A": 0}),
        tv["FTR"].map({"H": 0, "D": 1, "A": 3}),
    )

    grp = tv.groupby(["Season", "League", "team"])
    grp_venue = tv.groupby(["Season", "League", "team", "is_home"])

    tv["pts_cum"] = grp["pts"].transform(lambda x: x.shift(1).cumsum().fillna(0))
    tv["pts_venue_cum"] = grp_venue["pts"].transform(
        lambda x: x.shift(1).cumsum().fillna(0)
    )

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["points_diff_global"] = home["pts_cum"] - away["pts_cum"]
    result["points_diff_venue"] = home["pts_venue_cum"] - away["pts_venue_cum"]

    return result


def compute_rest_days(
    df: pd.DataFrame, *, _tv: pd.DataFrame | None = None
) -> pd.DataFrame:
    """
    Calcula la diferencia de días de descanso entre local y visitante.

    rest_days_diff = días_descanso_local - días_descanso_visitante
    Valores positivos indican que el local descansó más.
    Primer partido de temporada de un equipo → NaN.

    Garantía anti-leakage: diff() sobre fechas ordenadas dentro de la misma
    temporada y liga — nunca cruza temporadas.

    Parámetro interno _tv: team view precalculada por build_features para evitar
    recalcularla múltiples veces. Los notebooks pueden omitirlo.

    Devuelve un DataFrame indexado por match_id con la columna:
        rest_days_diff
    """
    tv = _tv.copy() if _tv is not None else _build_team_view(df)
    grp = tv.groupby(["Season", "League", "team"])

    tv["rest_days"] = grp["Date"].transform(lambda x: x.diff().dt.days)

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["rest_days_diff"] = home["rest_days"] - away["rest_days"]

    return result
