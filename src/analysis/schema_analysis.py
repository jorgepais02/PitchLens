import re
import pandas as pd


def group_columns(columns: list[str]) -> pd.DataFrame:
    """
    Agrupa las columnas comunes a todas las temporadas en categorías generales
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
        # Identificación
        if col in id_cols:
            return "Identificación del partido"

        # Resultados y goles
        if col in result_cols or col.startswith(("FT", "HT")):
            return "Resultados y goles"

        # Contexto (si existe)
        if col in context_cols:
            return "Contexto del partido"

        # Estadísticas Home/Away (tiros, córners, tarjetas, etc.)
        if match_stats_pat.match(col):
            return "Estadísticas del partido"

        # Cuotas de apuestas (macro-bloque)
        if (
            odds_agg_pat.match(col)
            or odds_ou_pat.search(col)
            or odds_ah_pat.search(col)
            or odds_1x2_pat.search(col)
        ):
            return "Cuotas de apuestas"

        return "Otros"

    df_class = pd.DataFrame(
        {"Variable": list(columns), "Grupo": [classify(c) for c in columns]}
    )

    return df_class
