"""Features de mercado: probabilidades implícitas y drift de cuotas."""

import pandas as pd


def compute_market_feature(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula la diferencia de probabilidad implícita del mercado normalizada
    por overround a partir de las cuotas Pinnacle de cierre (PSCH/PSCD/PSCA).

    prob_diff_market = (1/PSCH - 1/PSCA) / overround
    donde overround = 1/PSCH + 1/PSCD + 1/PSCA (margen típico Pinnacle: 1.02-1.03)

    Se usan las cuotas de cierre (closing odds) en lugar de las de apertura
    (PSH/PSD/PSA) porque incorporan toda la información del mercado hasta el
    inicio del partido y son las que la literatura académica considera más
    eficientes. Pinnacle se usa como fuente principal por su menor margen y
    mayor eficiencia informacional frente a casas recreacionales. Sin leakage
    por definición: las cuotas de cierre son información pública previa al
    inicio del partido.

    Devuelve un DataFrame indexado por match_id con la columna:
        prob_diff_market
    """
    p_h = 1 / df["PSCH"]
    p_d = 1 / df["PSCD"]
    p_a = 1 / df["PSCA"]

    overround = p_h + p_d + p_a
    prob_diff_market = (p_h / overround) - (p_a / overround)

    return pd.DataFrame(
        {"prob_diff_market": prob_diff_market.values},
        index=df["match_id"],
    )
