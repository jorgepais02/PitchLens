import difflib
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

    Parámetros:
        dfs_all: Diccionario {season: DataFrame}
        seasons_sorted: Lista ordenada de temporadas
        common_columns: Set/list de columnas comunes (debe incluir HomeTeam y AwayTeam)

    Devuelve:
        dict con:
            - total_teams: número de equipos únicos
            - collisions: DataFrame con colisiones detectadas
    """
    teams = pd.concat([
        pd.concat([dfs_all[s]["HomeTeam"], dfs_all[s]["AwayTeam"]])
        for s in seasons_sorted
    ]).dropna().drop_duplicates().reset_index(drop=True)

    teams_df = pd.DataFrame({
        "Team": teams,
        "Team_norm": teams.apply(normalize_team_name),
    })

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


def build_team_mapping(
    df_xg: pd.DataFrame,
    df_core: pd.DataFrame,
    league_map: dict[str, str],
    fuzzy_cutoff: float = 0.6,
) -> dict[str, str]:
    """
    Genera un diccionario de mapping {nombre_xg: nombre_core} para equipos
    cuya nomenclatura difiere entre Understat y football-data.

    Estrategia en 3 rondas:

    1. Fuzzy match (difflib.get_close_matches) con cutoff configurable.
    2. Substring match (nombre core contenido en nombre xG).
    3. Mejor fuzzy match sin cutoff para emparejar los restantes.

    Parámetros:
        df_xg: DataFrame xG con MultiIndex (league, season, game)
               y columna 'home_team'.
        df_core: DataFrame core clean con columnas 'League' y 'HomeTeam'.
        league_map: Dict {liga_understat: liga_core},
                    ej. {"ENG-Premier League": "premier"}.
        fuzzy_cutoff: Umbral para la ronda 1 (default 0.6).

    Devuelve:
        Dict {nombre_understat: nombre_football_data}.
    """
    mapping: dict[str, str] = {}

    for lg_us, lg_core in league_map.items():
        teams_xg = set(df_xg.loc[lg_us]["home_team"].unique())
        teams_core = set(df_core[df_core["League"] == lg_core]["HomeTeam"].unique())
        only_xg = sorted(teams_xg - teams_core)
        only_core = sorted(teams_core - teams_xg)

        # Ronda 1: fuzzy match
        unmatched_xg: list[str] = []
        for name_xg in only_xg:
            matches = difflib.get_close_matches(name_xg, only_core, n=1, cutoff=fuzzy_cutoff)
            if matches:
                mapping[name_xg] = matches[0]
                only_core.remove(matches[0])
            else:
                unmatched_xg.append(name_xg)

        # Ronda 2: substring match
        still_unmatched: list[str] = []
        for name_xg in unmatched_xg:
            found = None
            xg_low = name_xg.lower()
            for name_core in only_core:
                if name_core.lower() in xg_low:
                    found = name_core
                    break
            if found:
                mapping[name_xg] = found
                only_core.remove(found)
            else:
                still_unmatched.append(name_xg)

        # Ronda 3: mejor fuzzy match sin cutoff
        while still_unmatched and only_core:
            best_score, best_xg, best_core = 0.0, "", ""
            for name_xg in still_unmatched:
                for name_core in only_core:
                    score = difflib.SequenceMatcher(
                        None, name_xg.lower(), name_core.lower()
                    ).ratio()
                    if score > best_score:
                        best_score, best_xg, best_core = score, name_xg, name_core
            mapping[best_xg] = best_core
            still_unmatched.remove(best_xg)
            only_core.remove(best_core)

        if still_unmatched:
            raise ValueError(f"Equipos sin mapear: {still_unmatched}")

    return mapping
