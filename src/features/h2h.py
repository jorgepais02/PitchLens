"""Features H2H: historial directo entre los dos equipos del partido."""

from __future__ import annotations

import numpy as np
import pandas as pd


def compute_h2h_rolling(df: pd.DataFrame, window: int) -> pd.DataFrame:
    """
    Calcula features de historial directo (H2H) entre los dos equipos del partido.

    Agrupa por par canónico dentro de cada liga —(min, max) alfabético— para que
    los enfrentamientos recíprocos compartan historial. Para cada partido, los
    valores se proyectan a la perspectiva del equipo local actual.

    Garantía anti-leakage: shift(1).rolling(window) → cada partido usa solo los
    enfrentamientos H2H anteriores, nunca el propio ni posteriores.

    Cold start: el primer H2H de cada par (y pares con menos de `window`
    enfrentamientos previos) devuelve NaN. La imputación a 0 se hace en
    build_features tras el join, para que la presencia de NaN sea auditable
    en esta función.

    Devuelve un DataFrame indexado por match_id con las columnas:
        h2h_goal_diff_last5     — media de goal_diff en perspectiva del local actual
        h2h_result_diff_last5   — (wins_home − wins_away) / window en perspectiva del local actual
    """
    data = df[
        [
            "match_id",
            "Date",
            "League",
            "HomeTeam",
            "AwayTeam",
            "FTHG",
            "FTAG",
            "FTR",
        ]
    ].copy()

    # Par canónico dentro de la liga: ordenamos alfabéticamente los dos equipos
    # para que "A vs B" y "B vs A" compartan historial.
    data["team_a"] = data[["HomeTeam", "AwayTeam"]].min(axis=1)
    data["team_b"] = data[["HomeTeam", "AwayTeam"]].max(axis=1)
    data["pair_id"] = data["League"] + "__" + data["team_a"] + "__" + data["team_b"]

    # Perspectiva fija de team_a: gd_a y win_a miden el resultado desde su punto de vista.
    a_is_home = data["HomeTeam"].values == data["team_a"].values
    data["gd_a"] = np.where(
        a_is_home,
        data["FTHG"] - data["FTAG"],
        data["FTAG"] - data["FTHG"],
    )
    data["win_a"] = np.where(
        data["FTR"].values == "D",
        0,
        np.where(
            ((data["FTR"].values == "H") & a_is_home)
            | ((data["FTR"].values == "A") & ~a_is_home),
            1,
            -1,
        ),
    )

    # Rolling sobre el historial del par, perspectiva team_a.
    data = data.sort_values(["pair_id", "Date"]).reset_index(drop=True)
    grp = data.groupby("pair_id")
    data["gd_a_roll"] = grp["gd_a"].transform(
        lambda x: x.shift(1).rolling(window).mean()
    )
    data["win_a_roll"] = grp["win_a"].transform(
        lambda x: x.shift(1).rolling(window).mean()
    )

    # Proyección a la perspectiva del local del partido actual:
    # si team_a es el local, la perspectiva ya coincide; si no, invertimos signo.
    sign = np.where(data["HomeTeam"].values == data["team_a"].values, 1, -1)
    data["h2h_goal_diff_last5"] = data["gd_a_roll"] * sign
    data["h2h_result_diff_last5"] = data["win_a_roll"] * sign

    return data.set_index("match_id")[
        ["h2h_goal_diff_last5", "h2h_result_diff_last5"]
    ]
