"""Orquestador del pipeline de feature engineering."""

from __future__ import annotations

import pandas as pd

from ._constants import (
    ELO_BASE,
    ELO_K,
    FEATURES,
    FEATURES_H2H,
    FEATURES_ROLLING,
    H2H_WINDOW,
    WINDOW,
)
from ._team_view import _build_team_view
from .elo import compute_elo
from .form import compute_global_rolling, compute_venue_rolling
from .h2h import compute_h2h_rolling
from .leakage import check_leakage
from .market import compute_market_feature
from .table import compute_rest_days, compute_table_features

__all__ = [
    "build_features",
    "compute_elo",
    "compute_global_rolling",
    "compute_venue_rolling",
    "compute_table_features",
    "compute_market_feature",
    "compute_rest_days",
    "compute_h2h_rolling",
    "check_leakage",
    "FEATURES",
    "FEATURES_ROLLING",
    "FEATURES_H2H",
    "WINDOW",
    "H2H_WINDOW",
    "ELO_K",
    "ELO_BASE",
]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Pipeline completo de feature engineering sobre core_enriched.

    Pasos:
        1. Ordenar cronológicamente (imprescindible para rolling sin leakage).
        2. Construir la team view una sola vez y reutilizarla en todos los bloques.
        3. Calcular cada bloque de features de forma independiente.
        4. Unir todos los bloques por match_id.
        5. Verificar ausencia de leakage.
        6. Eliminar filas cold start (NaN en cualquiera de las features rolling).

    Garantía anti-leakage: shift(1) en todos los bloques vectorizados.
    ELO: valor pre-partido por construcción.

    Recibe core_enriched (10.660 × 35) con columnas: match_id, Date, HomeTeam,
    AwayTeam, League, Season, FTR, FTHG, FTAG, HST, AST, home_xg, away_xg,
    PSCH, PSCD, PSCA (cuotas Pinnacle de cierre).

    Devuelve core_features con columnas: match_id, League, Season, Date, HomeTeam,
    AwayTeam, FTR + 12 features. Filas cold start eliminadas en FEATURES_ROLLING.
    Las features H2H se imputan a 0 en cold start (pares sin historial previo).
    """
    df = df.sort_values("Date").reset_index(drop=True)

    tv = _build_team_view(df)

    df_elo = compute_elo(df, ELO_K, ELO_BASE)
    df_global = compute_global_rolling(df, WINDOW, _tv=tv)
    df_venue = compute_venue_rolling(df, WINDOW, _tv=tv)
    df_table = compute_table_features(df, _tv=tv)
    df_rest = compute_rest_days(df, _tv=tv)
    df_market = compute_market_feature(df)
    df_h2h = compute_h2h_rolling(df, H2H_WINDOW)

    df_base = df[
        ["match_id", "League", "Season", "Date", "HomeTeam", "AwayTeam", "FTR"]
    ].set_index("match_id")

    df_features = (
        df_base.join(df_elo[["elo_diff_pre"]])
        .join(df_table[["points_diff_global", "points_diff_venue"]])
        .join(
            df_global[
                [
                    "goal_diff_last5_global",
                    "xg_diff_last5_global",
                    "xg_conceded_diff_last5_global",
                    "sot_diff_last5_global",
                ]
            ]
        )
        .join(df_venue[["goal_diff_last5_venue"]])
        .join(df_rest[["rest_days_diff"]])
        .join(df_market[["prob_diff_market"]])
        .join(df_h2h[FEATURES_H2H])
    )

    check_leakage(df_features.reset_index(), df)
    df_features[FEATURES_H2H] = df_features[FEATURES_H2H].fillna(0.0)
    return df_features.dropna(subset=FEATURES_ROLLING).copy().reset_index()
