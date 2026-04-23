"""Verificación de ausencia de leakage temporal en el dataset de features."""

import pandas as pd

from ._constants import FEATURES_ROLLING


def check_leakage(df_features: pd.DataFrame, df_original: pd.DataFrame) -> None:
    """
    Verifica ausencia de leakage temporal en el dataset de features.

    Comprueba que el primer partido absoluto de cada equipo tiene NaN en todas
    las features rolling. ELO y prob_diff_market se excluyen del check —
    ELO arranca en base por diseño y el mercado no tiene cold start.

    Recibe df_features (con columna match_id) y df_original (core_enriched,
    para recuperar fechas y equipos). Lanza AssertionError con las columnas
    afectadas si se detecta leakage.
    """
    teams = pd.concat([
        df_original[["match_id", "Date", "HomeTeam"]].rename(columns={"HomeTeam": "team"}),
        df_original[["match_id", "Date", "AwayTeam"]].rename(columns={"AwayTeam": "team"}),
    ])
    first_match = (
        teams.sort_values("Date")
        .groupby("team")["match_id"]
        .first()
        .values
    )

    cols_rolling = [c for c in df_features.columns if c in FEATURES_ROLLING]
    vals = df_features.set_index("match_id").loc[first_match, cols_rolling]
    leakage_cols = vals.columns[~vals.isna().all()].tolist()

    assert not leakage_cols, f"⚠ Leakage detectado en columnas: {leakage_cols}"
