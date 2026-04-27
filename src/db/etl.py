"""Seed de la base de datos desde los parquets procesados.

Uso:
    python -m src.db.etl [--wipe] [--only dimensions|matches|features]

Por defecto ejecuta el seed completo (drop_all + create_all + inserción).
Con --wipe elimina y recrea las tablas antes de insertar.
Con --only limita la ejecución a un subconjunto de pasos.
"""

import argparse
import logging
import time
from pathlib import Path

import pandas as pd
from sqlmodel import Session, SQLModel

from src.db.database import engine
from src.db.models import League, Match, MatchFeatures, Season, Team

# ---------------------------------------------------------------------------
# Rutas de datos
# ---------------------------------------------------------------------------

_RAIZ = Path(__file__).resolve().parents[2]
_ENRICHED = _RAIZ / "data" / "processed" / "enriched" / "core_enriched.parquet"
_FEATURES = _RAIZ / "data" / "processed" / "features" / "core_features.parquet"

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

logging.basicConfig(format="[SEED] %(levelname)s %(message)s", level=logging.INFO)
log = logging.getLogger("seed")

# ---------------------------------------------------------------------------
# Counts esperados
# ---------------------------------------------------------------------------

_ESPERADO_LIGAS = 3
_ESPERADO_TEMPORADAS = 30
_ESPERADO_EQUIPOS = 93
_ESPERADO_PARTIDOS = 10_660
_ESPERADO_FEATURES = 9_792

# ---------------------------------------------------------------------------
# Mapeo de ligas (code en parquet → code en BD)
# ---------------------------------------------------------------------------

_LIGA_NOMBRE = {
    "premier": "Premier League",
    "laliga": "LaLiga",
    "bundesliga": "Bundesliga",
}


# ---------------------------------------------------------------------------
# Funciones de seed por dimensión
# ---------------------------------------------------------------------------


def seed_ligas(sesion: Session) -> dict[str, int]:
    """Inserta las 3 ligas y devuelve {code: id}."""
    ligas = [
        League(code=code, name=nombre)
        for code, nombre in _LIGA_NOMBRE.items()
    ]
    sesion.add_all(ligas)
    sesion.flush()

    mapa = {liga.code: liga.id for liga in ligas}

    got = len(mapa)
    if got != _ESPERADO_LIGAS:
        log.error("ligas: esperado=%d obtenido=%d", _ESPERADO_LIGAS, got)
        raise AssertionError(f"ligas: esperado={_ESPERADO_LIGAS} obtenido={got}")
    log.info("ligas: insertadas %d filas", got)
    return mapa


def seed_temporadas(
    sesion: Session, df: pd.DataFrame, mapa_ligas: dict[str, int]
) -> dict[tuple[int, int], int]:
    """Inserta las 30 temporadas y devuelve {(league_id, end_year): id}."""
    pares = df[["League", "Season"]].drop_duplicates()
    temporadas = []
    for _, fila in pares.iterrows():
        end_year = int(fila["Season"])
        label = f"{end_year - 1}/{end_year % 100:02d}"
        temporadas.append(
            Season(
                start_year=end_year,
                label=label,
                league_id=mapa_ligas[fila["League"]],
            )
        )
    sesion.add_all(temporadas)
    sesion.flush()

    mapa = {
        (t.league_id, t.start_year): t.id
        for t in temporadas
    }

    got = len(mapa)
    if got != _ESPERADO_TEMPORADAS:
        log.error("temporadas: esperado=%d obtenido=%d", _ESPERADO_TEMPORADAS, got)
        raise AssertionError(f"temporadas: esperado={_ESPERADO_TEMPORADAS} obtenido={got}")
    log.info("temporadas: insertadas %d filas", got)
    return mapa


def seed_equipos(
    sesion: Session, df: pd.DataFrame, mapa_ligas: dict[str, int]
) -> dict[tuple[int, str], int]:
    """Inserta los 93 equipos y devuelve {(league_id, nombre): id}."""
    locales = df[["League", "HomeTeam"]].rename(columns={"HomeTeam": "nombre"})
    visitantes = df[["League", "AwayTeam"]].rename(columns={"AwayTeam": "nombre"})
    equipos_unicos = (
        pd.concat([locales, visitantes])
        .drop_duplicates()
        .sort_values(["League", "nombre"])
    )

    equipos = [
        Team(name=fila["nombre"], league_id=mapa_ligas[fila["League"]])
        for _, fila in equipos_unicos.iterrows()
    ]
    sesion.add_all(equipos)
    sesion.flush()

    mapa = {(e.league_id, e.name): e.id for e in equipos}

    got = len(mapa)
    if got != _ESPERADO_EQUIPOS:
        log.error("equipos: esperado=%d obtenido=%d", _ESPERADO_EQUIPOS, got)
        raise AssertionError(f"equipos: esperado={_ESPERADO_EQUIPOS} obtenido={got}")
    log.info("equipos: insertadas %d filas", got)
    return mapa


def seed_partidos(
    sesion: Session,
    df: pd.DataFrame,
    mapa_ligas: dict[str, int],
    mapa_temporadas: dict[tuple[int, int], int],
    mapa_equipos: dict[tuple[int, str], int],
) -> dict[str, int]:
    """Inserta los 10.660 partidos y devuelve {slug: id}."""
    partidos = []
    for _, f in df.iterrows():
        liga_id = mapa_ligas[f["League"]]
        end_year = int(f["Season"])
        temporada_id = mapa_temporadas[(liga_id, end_year)]
        home_id = mapa_equipos[(liga_id, f["HomeTeam"])]
        away_id = mapa_equipos[(liga_id, f["AwayTeam"])]

        partidos.append(Match(
            slug=f["match_id"],
            date=f["Date"],
            league_id=liga_id,
            season_id=temporada_id,
            home_team_id=home_id,
            away_team_id=away_id,
            # Resultado
            fthg=int(f["FTHG"]),
            ftag=int(f["FTAG"]),
            ftr=f["FTR"],
            hthg=int(f["HTHG"]),
            htag=int(f["HTAG"]),
            htr=f["HTR"],
            # Stats
            home_shots=int(f["HS"]),
            away_shots=int(f["AS"]),
            home_shots_on_target=int(f["HST"]),
            away_shots_on_target=int(f["AST"]),
            home_fouls=int(f["HF"]),
            away_fouls=int(f["AF"]),
            home_corners=int(f["HC"]),
            away_corners=int(f["AC"]),
            home_yellows=int(f["HY"]),
            away_yellows=int(f["AY"]),
            home_reds=int(f["HR"]),
            away_reds=int(f["AR"]),
            # Cuotas Bet365
            b365h=float(f["B365H"]),
            b365d=float(f["B365D"]),
            b365a=float(f["B365A"]),
            # Cuotas Pinnacle apertura
            psh=float(f["PSH"]),
            psd=float(f["PSD"]),
            psa=float(f["PSA"]),
            # Cuotas Pinnacle cierre
            psch=float(f["PSCH"]),
            pscd=float(f["PSCD"]),
            psca=float(f["PSCA"]),
            # xG
            home_xg=float(f["home_xg"]),
            away_xg=float(f["away_xg"]),
        ))

    sesion.add_all(partidos)
    sesion.flush()

    mapa = {p.slug: p.id for p in partidos}

    got = len(mapa)
    if got != _ESPERADO_PARTIDOS:
        log.error("partidos: esperado=%d obtenido=%d", _ESPERADO_PARTIDOS, got)
        raise AssertionError(f"partidos: esperado={_ESPERADO_PARTIDOS} obtenido={got}")
    log.info("partidos: insertadas %d filas", got)
    return mapa


def seed_features(
    sesion: Session,
    df: pd.DataFrame,
    mapa_partidos: dict[str, int],
) -> None:
    """Inserta las 9.792 features de partido."""
    features = []
    for _, f in df.iterrows():
        match_id = mapa_partidos.get(f["match_id"])
        if match_id is None:
            log.warning("match_id no encontrado en BD: %s", f["match_id"])
            continue
        features.append(MatchFeatures(
            match_id=match_id,
            elo_diff_pre=float(f["elo_diff_pre"]),
            points_diff_global=float(f["points_diff_global"]),
            points_diff_venue=float(f["points_diff_venue"]),
            goal_diff_last5_global=float(f["goal_diff_last5_global"]),
            xg_diff_last5_global=float(f["xg_diff_last5_global"]),
            xg_conceded_diff_last5_global=float(f["xg_conceded_diff_last5_global"]),
            sot_diff_last5_global=float(f["sot_diff_last5_global"]),
            goal_diff_last5_venue=float(f["goal_diff_last5_venue"]),
            rest_days_diff=float(f["rest_days_diff"]),
            prob_diff_market=float(f["prob_diff_market"]),
            h2h_goal_diff_last5=float(f["h2h_goal_diff_last5"]),
            h2h_result_diff_last5=float(f["h2h_result_diff_last5"]),
        ))

    sesion.add_all(features)
    sesion.flush()

    got = len(features)
    if got != _ESPERADO_FEATURES:
        log.error("features: esperado=%d obtenido=%d", _ESPERADO_FEATURES, got)
        raise AssertionError(f"features: esperado={_ESPERADO_FEATURES} obtenido={got}")
    log.info("features: insertadas %d filas", got)


# ---------------------------------------------------------------------------
# Función principal de seed
# ---------------------------------------------------------------------------


def run_seed(wipe: bool = False, only: str | None = None) -> None:
    """Ejecuta el seed completo en una transacción global.

    Args:
        wipe: Si True, elimina y recrea todas las tablas antes de insertar.
        only: Limita la ejecución a 'dimensions', 'matches' o 'features'.
    """
    t_inicio = time.perf_counter()
    log.info("cargando parquets...")
    df_enriched = pd.read_parquet(_ENRICHED)
    df_features = pd.read_parquet(_FEATURES)
    log.info("enriched: %d filas | features: %d filas", len(df_enriched), len(df_features))

    if wipe:
        log.info("wipe: eliminando tablas existentes...")
        SQLModel.metadata.drop_all(engine)
        log.info("wipe: tablas eliminadas")

    log.info("creando tablas si no existen...")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as sesion:
        try:
            mapa_ligas: dict[str, int] = {}
            mapa_temporadas: dict[tuple[int, int], int] = {}
            mapa_equipos: dict[tuple[int, str], int] = {}
            mapa_partidos: dict[str, int] = {}

            if only in (None, "dimensions"):
                mapa_ligas = seed_ligas(sesion)
                mapa_temporadas = seed_temporadas(sesion, df_enriched, mapa_ligas)
                mapa_equipos = seed_equipos(sesion, df_enriched, mapa_ligas)

            if only in (None, "matches"):
                if not mapa_ligas:
                    log.error("--only matches requiere dimensiones ya cargadas en BD")
                    raise RuntimeError("dimensiones no disponibles en memoria")
                mapa_partidos = seed_partidos(
                    sesion, df_enriched, mapa_ligas, mapa_temporadas, mapa_equipos
                )

            if only in (None, "features"):
                if not mapa_partidos:
                    log.error("--only features requiere partidos ya cargados en BD")
                    raise RuntimeError("partidos no disponibles en memoria")
                seed_features(sesion, df_features, mapa_partidos)

            sesion.commit()

        except Exception:
            sesion.rollback()
            log.error("error durante el seed — rollback total")
            raise

    t_total = time.perf_counter() - t_inicio
    log.info("done in %.1fs", t_total)
    log.info(
        "summary: ligas=%d temporadas=%d equipos=%d partidos=%d features=%d",
        _ESPERADO_LIGAS,
        _ESPERADO_TEMPORADAS,
        _ESPERADO_EQUIPOS,
        _ESPERADO_PARTIDOS,
        _ESPERADO_FEATURES,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed de la base de datos.")
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Elimina y recrea las tablas antes de insertar.",
    )
    parser.add_argument(
        "--only",
        choices=["dimensions", "matches", "features"],
        default=None,
        help="Ejecuta solo un subconjunto de pasos.",
    )
    args = parser.parse_args()
    run_seed(wipe=args.wipe, only=args.only)
