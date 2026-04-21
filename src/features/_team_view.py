import pandas as pd


def _build_team_view(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convierte el dataset de partidos en una vista por equipo.

    Cada partido genera dos filas — una por equipo local y otra por visitante.
    Base común para todas las features vectorizadas (rolling, clasificación, descanso).

    Devuelve un DataFrame con columnas:
        match_id, Date, Season, League, team, is_home, gf, gc, xgf, xgc, sot, soc
    """
    cols_base = ["match_id", "Date", "Season", "League"]

    locales = df[
        cols_base + ["HomeTeam", "FTHG", "FTAG", "home_xg", "away_xg", "HST", "AST"]
    ].copy()
    locales = locales.rename(
        columns={
            "HomeTeam": "team",
            "FTHG": "gf",
            "FTAG": "gc",
            "home_xg": "xgf",
            "away_xg": "xgc",
            "HST": "sot",
            "AST": "soc",
        }
    )
    locales["is_home"] = 1

    visitantes = df[
        cols_base + ["AwayTeam", "FTAG", "FTHG", "away_xg", "home_xg", "AST", "HST"]
    ].copy()
    visitantes = visitantes.rename(
        columns={
            "AwayTeam": "team",
            "FTAG": "gf",
            "FTHG": "gc",
            "away_xg": "xgf",
            "home_xg": "xgc",
            "AST": "sot",
            "HST": "soc",
        }
    )
    visitantes["is_home"] = 0

    return (
        pd.concat([locales, visitantes], ignore_index=True)
        .sort_values(["League", "team", "Date"])
        .reset_index(drop=True)
    )
