"""Features de forma reciente: rolling global y por localía."""

from __future__ import annotations

import pandas as pd

from ._team_view import _build_team_view


def compute_global_rolling(
    df: pd.DataFrame, window: int, *, _tv: pd.DataFrame | None = None
) -> pd.DataFrame:
    """
    Calcula rolling stats globales (sin distinción de localía) para cada equipo.

    Garantía anti-leakage: shift(1) desplaza el rolling un partido hacia adelante,
    garantizando que el valor de cada partido usa solo los `window` partidos anteriores.

    Parámetro interno _tv: team view precalculada por build_features para evitar
    recalcularla múltiples veces. Los notebooks pueden omitirlo.

    Devuelve un DataFrame indexado por match_id con las columnas:
        goal_diff_last5_global, xg_diff_last5_global,
        xg_conceded_diff_last5_global, sot_diff_last5_global
    """
    tv = _tv.copy() if _tv is not None else _build_team_view(df)
    tv["gd"] = tv["gf"] - tv["gc"]
    tv["xgd"] = tv["xgf"] - tv["xgc"]
    grp = tv.groupby(["League", "team"])

    tv["gd_roll"] = grp["gd"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["xgd_roll"] = grp["xgd"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["xgc_roll"] = grp["xgc"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["sot_roll"] = grp["sot"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["soc_roll"] = grp["soc"].transform(lambda x: x.shift(1).rolling(window).mean())

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["goal_diff_last5_global"] = home["gd_roll"] - away["gd_roll"]
    result["xg_diff_last5_global"] = home["xgd_roll"] - away["xgd_roll"]
    result["xg_conceded_diff_last5_global"] = home["xgc_roll"] - away["xgc_roll"]
    result["sot_diff_last5_global"] = (home["sot_roll"] - home["soc_roll"]) - (
        away["sot_roll"] - away["soc_roll"]
    )

    return result


def compute_venue_rolling(
    df: pd.DataFrame, window: int, *, _tv: pd.DataFrame | None = None
) -> pd.DataFrame:
    """
    Calcula rolling stats separando localía.

    Local: últimos `window` partidos jugados en casa.
    Visitante: últimos `window` partidos jugados fuera.

    Garantía anti-leakage: shift(1) antes del rolling.

    Parámetro interno _tv: team view precalculada por build_features para evitar
    recalcularla múltiples veces. Los notebooks pueden omitirlo.

    Devuelve un DataFrame indexado por match_id con la columna:
        goal_diff_last5_venue
    """
    tv = _tv.copy() if _tv is not None else _build_team_view(df)
    tv["gd"] = tv["gf"] - tv["gc"]
    grp = tv.groupby(["League", "team", "is_home"])

    tv["gd_venue_roll"] = grp["gd"].transform(
        lambda x: x.shift(1).rolling(window).mean()
    )

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["goal_diff_last5_venue"] = home["gd_venue_roll"] - away["gd_venue_roll"]

    return result
