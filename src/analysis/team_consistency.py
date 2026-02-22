import re
import unicodedata
import pandas as pd


def normalize_team_name(name: str) -> str:
    """
    Normaliza un nombre de equipo:
    - elimina espacios extra
    - convierte a minúsculas
    - elimina acentos
    """
    name = re.sub(r"\s+", " ", name.strip())
    name = name.lower()
    name = "".join(
        c for c in unicodedata.normalize("NFKD", name) if not unicodedata.combining(c)
    )
    return name


def check_name_consistency(dfs_all: dict, seasons_sorted: list, common_columns):
    """
    Verifica consistencia en nombres de equipos entre temporadas.

    Args:
        dfs_all: Diccionario {season: DataFrame}
        seasons_sorted: Lista ordenada de temporadas
        common_columns: Set/list de columnas comunes (debe incluir HomeTeam y AwayTeam)

    Returns:
        dict con:
            - total_teams: número de equipos únicos
            - collisions: DataFrame con colisiones detectadas
    """
    teams_rows = []

    for s in seasons_sorted:
        df = dfs_all[s][list(common_columns)]
        teams = pd.concat([df["HomeTeam"], df["AwayTeam"]]).dropna().unique()
        for t in teams:
            teams_rows.append(
                {"Season": s, "Team": t, "Team_norm": normalize_team_name(t)}
            )

    teams_df = pd.DataFrame(teams_rows).drop_duplicates(subset=["Team"])

    collisions = (
        teams_df.groupby("Team_norm")
        .agg(Variants=("Team", lambda x: sorted(set(x))))
        .reset_index()
    )
    collisions["n_variants"] = collisions["Variants"].apply(len)
    collisions = collisions[collisions["n_variants"] > 1].sort_values(
        "n_variants", ascending=False
    )

    return {"total_teams": teams_df["Team"].nunique(), "collisions": collisions}
