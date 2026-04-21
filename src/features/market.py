"""Feature de mercado: probabilidad implícita Pinnacle normalizada por overround."""

import pandas as pd


def compute_market_feature(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula la diferencia de probabilidad implícita del mercado normalizada
    por overround a partir de las cuotas Pinnacle (cierre).

    prob_diff_market = (1/PSH - 1/PSA) / overround
    donde overround = 1/PSH + 1/PSD + 1/PSA (margen típico Pinnacle: 1.02-1.03)

    Pinnacle se usa como fuente principal por su menor margen y mayor eficiencia
    informacional frente a casas recreacionales. Sin leakage por definición:
    las cuotas son información publicada antes del partido.

    Devuelve un DataFrame indexado por match_id con la columna:
        prob_diff_market
    """
    p_h = 1 / df["PSH"]
    p_d = 1 / df["PSD"]
    p_a = 1 / df["PSA"]

    overround = p_h + p_d + p_a
    prob_diff_market = (p_h / overround) - (p_a / overround)

    return pd.DataFrame(
        {"prob_diff_market": prob_diff_market.values},
        index=df["match_id"],
    )
