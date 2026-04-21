import re
import pandas as pd


def classify_columns(columns: list[str]) -> pd.DataFrame:
    """
    Clasifica columnas del core en categorías generales
    basadas en patrones de nombres y conocimiento del dominio.
    """

    match_stats_pat = re.compile(r"^(H|A)[A-Z]")  # HS, HST, AC, AY...
    odds_ou_pat = re.compile(r"([<>]2\.5)$")  # B365>2.5, Avg<2.5...
    odds_ah_pat = re.compile(r"AH")  # Asian handicap
    odds_1x2_pat = re.compile(r"(H|D|A)$")  # Probabilidades 1X2
    odds_agg_pat = re.compile(r"^(Max|Avg|Bb)")  # Cuotas agregadas

    id_cols = {"Div", "Date", "Time", "HomeTeam", "AwayTeam"}
    result_cols = {"FTHG", "FTAG", "FTR", "HTHG", "HTAG", "HTR"}
    context_cols = {"Attendance", "Referee"}

    def classify(col: str) -> str:
        if col in id_cols:
            return "Identificación del partido"
        if col in result_cols or col.startswith(("FT", "HT")):
            return "Resultados y goles"
        if col in context_cols:
            return "Contexto del partido"
        if match_stats_pat.match(col):
            return "Estadísticas del partido"
        if (
            odds_agg_pat.match(col)
            or odds_ou_pat.search(col)
            or odds_ah_pat.search(col)
            or odds_1x2_pat.search(col)
        ):
            return "Cuotas de apuestas"
        return "Otros"

    return pd.DataFrame(
        {"Variable": list(columns), "Grupo": [classify(c) for c in columns]}
    )
