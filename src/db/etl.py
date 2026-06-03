"""Seed de la base de datos desde los parquets procesados.

Uso:
    python -m src.db.etl [--wipe]

Por defecto crea las tablas si no existen e inserta los datos.
Con --wipe elimina y recrea las tablas antes de insertar.
"""

import argparse
import logging
import time
from pathlib import Path

import pandas as pd
from sqlmodel import Session, SQLModel, select

from src.db.database import engine
from src.db.models import League, Match, MatchFeatures, Season, Team

# ---------------------------------------------------------------------------
# Rutas de datos
# ---------------------------------------------------------------------------

_ROOT = Path(__file__).resolve().parents[2]
_ENRICHED = _ROOT / "data" / "processed" / "enriched" / "core_enriched.parquet"
_FEATURES = _ROOT / "data" / "processed" / "features" / "core_features.parquet"

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

# Logger de módulo — la configuración de handlers se hace solo en el bloque CLI
# (__main__) para no reconfigurar el root logger al importar este módulo.
log = logging.getLogger("seed")

# ---------------------------------------------------------------------------
# Counts esperados
# ---------------------------------------------------------------------------

_EXPECTED_LEAGUES = 3
_EXPECTED_SEASONS = 30
_EXPECTED_TEAMS = 93
_EXPECTED_MATCHES = 10_660
_EXPECTED_FEATURES = 9_792

# ---------------------------------------------------------------------------
# Mapeo de ligas (code en parquet → nombre completo)
# ---------------------------------------------------------------------------

_LEAGUE_NAMES = {
    "premier": "Premier League",
    "laliga": "LaLiga",
    "bundesliga": "Bundesliga",
}


# ---------------------------------------------------------------------------
# Funciones de seed por dimensión
# ---------------------------------------------------------------------------


def seed_ligas(session: Session) -> dict[str, int]:
    """Inserta las 3 ligas y devuelve {code: id}."""
    leagues = [
        League(code=code, name=name)
        for code, name in _LEAGUE_NAMES.items()
    ]
    session.add_all(leagues)
    session.flush()

    mapping = {league.code: league.id for league in leagues}

    n = len(mapping)
    if n != _EXPECTED_LEAGUES:
        log.error("ligas: esperado=%d obtenido=%d", _EXPECTED_LEAGUES, n)
        raise AssertionError(f"ligas: esperado={_EXPECTED_LEAGUES} obtenido={n}")
    log.info("ligas: insertadas %d filas", n)
    return mapping


def seed_temporadas(
    session: Session, df: pd.DataFrame, league_map: dict[str, int]
) -> dict[tuple[int, int], int]:
    """Inserta las 30 temporadas y devuelve {(league_id, end_year): id}."""
    pairs = df[["League", "Season"]].drop_duplicates()
    seasons = []
    for _, row in pairs.iterrows():
        end_year = int(row["Season"])
        label = f"{end_year - 1}/{end_year % 100:02d}"
        seasons.append(
            Season(
                end_year=end_year,
                label=label,
                league_id=league_map[row["League"]],
            )
        )
    session.add_all(seasons)
    session.flush()

    mapping = {(s.league_id, s.end_year): s.id for s in seasons}

    n = len(mapping)
    if n != _EXPECTED_SEASONS:
        log.error("temporadas: esperado=%d obtenido=%d", _EXPECTED_SEASONS, n)
        raise AssertionError(f"temporadas: esperado={_EXPECTED_SEASONS} obtenido={n}")
    log.info("temporadas: insertadas %d filas", n)
    return mapping


def seed_equipos(
    session: Session, df: pd.DataFrame, league_map: dict[str, int]
) -> dict[tuple[int, str], int]:
    """Inserta los 93 equipos y devuelve {(league_id, name): id}."""
    home_teams = df[["League", "HomeTeam"]].rename(columns={"HomeTeam": "name"})
    away_teams = df[["League", "AwayTeam"]].rename(columns={"AwayTeam": "name"})
    unique_teams = (
        pd.concat([home_teams, away_teams])
        .drop_duplicates()
        .sort_values(["League", "name"])
    )

    teams = [
        Team(name=row["name"], league_id=league_map[row["League"]])
        for _, row in unique_teams.iterrows()
    ]
    session.add_all(teams)
    session.flush()

    mapping = {(t.league_id, t.name): t.id for t in teams}

    n = len(mapping)
    if n != _EXPECTED_TEAMS:
        log.error("equipos: esperado=%d obtenido=%d", _EXPECTED_TEAMS, n)
        raise AssertionError(f"equipos: esperado={_EXPECTED_TEAMS} obtenido={n}")
    log.info("equipos: insertadas %d filas", n)
    return mapping


def seed_partidos(
    session: Session,
    df: pd.DataFrame,
    league_map: dict[str, int],
    season_map: dict[tuple[int, int], int],
    team_map: dict[tuple[int, str], int],
) -> dict[str, int]:
    """Inserta los 10.660 partidos y devuelve {slug: id}."""
    matches = []
    for _, row in df.iterrows():
        league_id = league_map[row["League"]]
        end_year = int(row["Season"])
        season_id = season_map[(league_id, end_year)]
        home_id = team_map[(league_id, row["HomeTeam"])]
        away_id = team_map[(league_id, row["AwayTeam"])]

        matches.append(Match(
            slug=row["match_id"],
            date=row["Date"],
            league_id=league_id,
            season_id=season_id,
            home_team_id=home_id,
            away_team_id=away_id,
            # Resultado
            fthg=int(row["FTHG"]),
            ftag=int(row["FTAG"]),
            ftr=row["FTR"],
            hthg=int(row["HTHG"]),
            htag=int(row["HTAG"]),
            htr=row["HTR"],
            # Stats
            home_shots=int(row["HS"]),
            away_shots=int(row["AS"]),
            home_shots_on_target=int(row["HST"]),
            away_shots_on_target=int(row["AST"]),
            home_fouls=int(row["HF"]),
            away_fouls=int(row["AF"]),
            home_corners=int(row["HC"]),
            away_corners=int(row["AC"]),
            home_yellows=int(row["HY"]),
            away_yellows=int(row["AY"]),
            home_reds=int(row["HR"]),
            away_reds=int(row["AR"]),
            # Cuotas Bet365
            b365h=float(row["B365H"]),
            b365d=float(row["B365D"]),
            b365a=float(row["B365A"]),
            # Cuotas Pinnacle apertura
            psh=float(row["PSH"]),
            psd=float(row["PSD"]),
            psa=float(row["PSA"]),
            # Cuotas Pinnacle cierre
            psch=float(row["PSCH"]),
            pscd=float(row["PSCD"]),
            psca=float(row["PSCA"]),
            # xG
            home_xg=float(row["home_xg"]),
            away_xg=float(row["away_xg"]),
        ))

    session.add_all(matches)
    session.flush()

    mapping = {m.slug: m.id for m in matches}

    n = len(mapping)
    if n != _EXPECTED_MATCHES:
        log.error("partidos: esperado=%d obtenido=%d", _EXPECTED_MATCHES, n)
        raise AssertionError(f"partidos: esperado={_EXPECTED_MATCHES} obtenido={n}")
    log.info("partidos: insertadas %d filas", n)
    return mapping


def seed_features(
    session: Session,
    df: pd.DataFrame,
    match_map: dict[str, int],
) -> int:
    """Inserta las 9.792 features de partido y devuelve el número insertado."""
    features = []
    for _, row in df.iterrows():
        match_id = match_map.get(row["match_id"])
        if match_id is None:
            log.warning("match_id no encontrado en BD: %s", row["match_id"])
            continue
        features.append(MatchFeatures(
            match_id=match_id,
            elo_diff_pre=float(row["elo_diff_pre"]),
            points_diff_global=float(row["points_diff_global"]),
            points_diff_venue=float(row["points_diff_venue"]),
            goal_diff_last5_global=float(row["goal_diff_last5_global"]),
            xg_diff_last5_global=float(row["xg_diff_last5_global"]),
            xg_conceded_diff_last5_global=float(row["xg_conceded_diff_last5_global"]),
            sot_diff_last5_global=float(row["sot_diff_last5_global"]),
            goal_diff_last5_venue=float(row["goal_diff_last5_venue"]),
            rest_days_diff=float(row["rest_days_diff"]),
            prob_diff_market=float(row["prob_diff_market"]),
            h2h_goal_diff_last5=float(row["h2h_goal_diff_last5"]),
            h2h_result_diff_last5=float(row["h2h_result_diff_last5"]),
        ))

    session.add_all(features)
    session.flush()

    n = len(features)
    if n != _EXPECTED_FEATURES:
        log.error("features: esperado=%d obtenido=%d", _EXPECTED_FEATURES, n)
        raise AssertionError(f"features: esperado={_EXPECTED_FEATURES} obtenido={n}")
    log.info("features: insertadas %d filas", n)
    return n


# ---------------------------------------------------------------------------
# Función principal de seed
# ---------------------------------------------------------------------------


def run_seed(wipe: bool = False) -> None:
    """Ejecuta el seed completo en una transacción global.

    Args:
        wipe: Si True, elimina y recrea todas las tablas antes de insertar.
    """
    t_start = time.perf_counter()

    if wipe:
        log.info("wipe: eliminando tablas existentes...")
        SQLModel.metadata.drop_all(engine)
        log.info("wipe: tablas eliminadas")

    log.info("creando tablas si no existen...")
    SQLModel.metadata.create_all(engine)

    # Idempotencia: sin --wipe, una re-ejecución sobre BD ya poblada no inserta nada
    # (evita el IntegrityError del unique de leagues.code). Usa --wipe para recrear.
    if not wipe:
        with Session(engine) as session:
            ya_poblada = session.exec(select(League)).first() is not None
        if ya_poblada:
            log.warning(
                "BD ya poblada — no se inserta nada. Usa --wipe para recrear desde cero."
            )
            return

    log.info("cargando parquets...")
    df_enriched = pd.read_parquet(_ENRICHED)
    df_features = pd.read_parquet(_FEATURES)
    log.info("enriched: %d filas | features: %d filas", len(df_enriched), len(df_features))

    with Session(engine) as session:
        try:
            league_map = seed_ligas(session)
            season_map = seed_temporadas(session, df_enriched, league_map)
            team_map = seed_equipos(session, df_enriched, league_map)
            match_map = seed_partidos(
                session, df_enriched, league_map, season_map, team_map
            )
            n_features = seed_features(session, df_features, match_map)
            session.commit()

        except Exception:
            session.rollback()
            log.error("error durante el seed — rollback total")
            raise

    elapsed = time.perf_counter() - t_start
    log.info("done in %.1fs", elapsed)
    log.info(
        "summary: ligas=%d temporadas=%d equipos=%d partidos=%d features=%d",
        len(league_map),
        len(season_map),
        len(team_map),
        len(match_map),
        n_features,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    logging.basicConfig(format="[SEED] %(levelname)s %(message)s", level=logging.INFO)

    parser = argparse.ArgumentParser(description="Seed de la base de datos.")
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Elimina y recrea las tablas antes de insertar.",
    )
    args = parser.parse_args()
    run_seed(wipe=args.wipe)
