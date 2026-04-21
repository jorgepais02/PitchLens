"""Feature ELO: rating acumulado histórico partido a partido."""

import pandas as pd


def compute_elo(df: pd.DataFrame, k: float, base: float) -> pd.DataFrame:
    """
    Calcula el rating ELO acumulado histórico partido a partido.

    La feature es elo_diff_pre = elo_local - elo_visitante antes de actualizar
    los ratings con el resultado del partido. Todos los equipos arrancan en `base`.

    Sin leakage por construcción: el valor pre-partido se registra antes de
    procesar el resultado. La actualización ocurre después del registro.

    Devuelve un DataFrame indexado por match_id con la columna:
        elo_diff_pre
    """
    elo: dict[str, float] = {}
    records = []

    for row in df.itertuples(index=False):
        home = row.HomeTeam
        away = row.AwayTeam
        ftr = row.FTR

        elo_h = elo.get(home, base)
        elo_a = elo.get(away, base)

        expected_h = 1 / (1 + 10 ** ((elo_a - elo_h) / 400))
        result_h = 1.0 if ftr == "H" else (0.5 if ftr == "D" else 0.0)

        delta = k * (result_h - expected_h)
        elo[home] = elo_h + delta
        elo[away] = elo_a - delta

        records.append({"match_id": row.match_id, "elo_diff_pre": elo_h - elo_a})

    return pd.DataFrame(records).set_index("match_id")
