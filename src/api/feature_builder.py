"""Construcción de features on-the-fly para un partido hipotético futuro.

Reconstruye el historial de la liga desde la BD, añade un partido virtual
al final y ejecuta el pipeline completo de build_features. Las features del
partido virtual son las que se pasan al modelo para predecir.

Garantía anti-leakage: el partido virtual no tiene resultado real, y el
shift(1) de cada bloque vectorizado asegura que sus propias stats nunca
se usan para calcular sus propias features.

Caché: el historial por liga (DataFrame ya convertido desde la BD) se cachea
en memoria por league_id. Solo cambia al re-seedear la BD, en cuyo caso debe
llamarse `clear_history_cache()`.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone

import pandas as pd
from sqlmodel import Session, select

from src.db.models import Match, Season, Team
from src.features._constants import WINDOW

# ID reservado para el partido virtual — nunca existe en BD
_VIRTUAL_ID = -1
# Valor constante para la columna League — build_features no agrupa por liga,
# solo la arrastra como metadata. Al cargar una sola liga de BD, todos los
# partidos reales tendrían el mismo valor de todas formas.
_LEAGUE_PLACEHOLDER = "league"


@dataclass(frozen=True)
class _LeagueHistory:
    """Historial cacheado de una liga: frame de partidos + metadata derivada."""

    df_hist: pd.DataFrame
    latest_season_label: str


# Caché por league_id — protegida por lock porque /predict corre en el threadpool
_HIST_CACHE: dict[int, _LeagueHistory] = {}
# Caché de las features deterministas (todas menos prob_diff_market) por enfrentamiento
# (home_team_id, away_team_id). Las features no de mercado solo dependen del historial,
# así que repetir el mismo partido es O(1); prob_diff_market se aplica desde las cuotas.
_FEATURE_CACHE: dict[tuple[int, int], tuple[dict[str, float], bool]] = {}
_CACHE_LOCK = threading.Lock()


def clear_history_cache() -> None:
    """Vacía las cachés (historial por liga y features por enfrentamiento).

    Llamar tras re-seedear la BD.
    """
    with _CACHE_LOCK:
        _HIST_CACHE.clear()
        _FEATURE_CACHE.clear()


def _market_value(psch: float | None, pscd: float | None, psca: float | None) -> float:
    """prob_diff_market del partido virtual desde sus cuotas (misma fórmula que market.py).

    Cuotas neutras (3.0) si faltan → prob_diff_market = 0 (equipos igualados).
    """
    _psch = psch if psch is not None else 3.0
    _pscd = pscd if pscd is not None else 3.0
    _psca = psca if psca is not None else 3.0
    p_h, p_d, p_a = 1 / _psch, 1 / _pscd, 1 / _psca
    overround = p_h + p_d + p_a
    return float(p_h / overround - p_a / overround)


def _matches_to_df(matches: list[Match], teams: dict[int, str], seasons: dict[int, str]) -> pd.DataFrame:
    """Convierte una lista de objetos Match al formato que espera build_features."""
    rows = []
    for m in matches:
        rows.append(
            {
                "match_id": m.id,
                "Date": m.date,
                "HomeTeam": teams[m.home_team_id],
                "AwayTeam": teams[m.away_team_id],
                "Season": seasons[m.season_id],
                "League": _LEAGUE_PLACEHOLDER,
                "FTR": m.ftr,
                "FTHG": m.fthg,
                "FTAG": m.ftag,
                "HST": m.home_shots_on_target,
                "AST": m.away_shots_on_target,
                "home_xg": m.home_xg,
                "away_xg": m.away_xg,
                "PSCH": m.psch,
                "PSCD": m.pscd,
                "PSCA": m.psca,
            }
        )
    return pd.DataFrame(rows)


def _load_league_history(session: Session, league_id: int) -> _LeagueHistory:
    """Carga desde BD todos los partidos de una liga y construye el frame histórico."""
    all_matches = list(
        session.exec(
            select(Match)
            .where(Match.league_id == league_id)
            .order_by(Match.date)
        ).all()
    )

    all_team_ids: set[int] = set()
    all_season_ids: set[int] = set()
    for m in all_matches:
        all_team_ids.update([m.home_team_id, m.away_team_id])
        all_season_ids.add(m.season_id)

    teams_map: dict[int, str] = {
        t.id: t.name
        for t in session.exec(select(Team).where(Team.id.in_(list(all_team_ids)))).all()
    }
    seasons: list[Season] = list(
        session.exec(select(Season).where(Season.id.in_(list(all_season_ids)))).all()
    )
    seasons_map: dict[int, str] = {s.id: s.label for s in seasons}

    df_hist = _matches_to_df(all_matches, teams_map, seasons_map)

    # Última temporada por end_year — NO por max(season_id), que depende del orden
    # de inserción de las PK y es frágil.
    latest_season_label = max(seasons, key=lambda s: s.end_year).label if seasons else ""

    return _LeagueHistory(df_hist=df_hist, latest_season_label=latest_season_label)


def _get_league_history(session: Session, league_id: int) -> _LeagueHistory:
    """Devuelve el historial de la liga desde caché, cargándolo de BD si falta."""
    with _CACHE_LOCK:
        cached = _HIST_CACHE.get(league_id)
    if cached is not None:
        return cached

    history = _load_league_history(session, league_id)
    with _CACHE_LOCK:
        _HIST_CACHE[league_id] = history
    return history


def compute_prediction_features(
    session: Session,
    home_team_id: int,
    away_team_id: int,
    psch: float | None = None,
    pscd: float | None = None,
    psca: float | None = None,
) -> tuple[dict[str, float], bool]:
    """Calcula las 12 features para un partido hipotético futuro.

    Devuelve (feature_dict, cold_start_warning).
    cold_start_warning=True si alguno de los equipos tiene < WINDOW partidos en la BD.

    Args:
        session: Sesión de BD activa.
        home_team_id: ID del equipo local.
        away_team_id: ID del equipo visitante.
        psch/pscd/psca: Cuotas Pinnacle de cierre (requeridas para modelo market).

    Returns:
        Tupla (features: dict nombre→valor, cold_start: bool).
    """
    home_team = session.get(Team, home_team_id)
    away_team = session.get(Team, away_team_id)
    if home_team is None or away_team is None:
        raise ValueError("Equipo no encontrado")

    # prob_diff_market depende solo de las cuotas del partido virtual: se aplica al
    # final sobre las features deterministas (cacheadas por enfrentamiento).
    market = _market_value(psch, pscd, psca)

    cache_key = (home_team_id, away_team_id)
    with _CACHE_LOCK:
        cached = _FEATURE_CACHE.get(cache_key)
    if cached is not None:
        feature_dict, cold_start = cached
        result = dict(feature_dict)
        result["prob_diff_market"] = market
        return result, cold_start

    feature_dict, cold_start = _build_deterministic_features(
        session, home_team.league_id, home_team.name, away_team.name
    )

    with _CACHE_LOCK:
        _FEATURE_CACHE[cache_key] = (feature_dict, cold_start)

    result = dict(feature_dict)
    result["prob_diff_market"] = market
    return result, cold_start


def _build_deterministic_features(
    session: Session,
    league_id: int,
    home_name: str,
    away_name: str,
) -> tuple[dict[str, float], bool]:
    """Construye las 12 features con cuotas neutras (prob_diff_market se aplica aparte).

    Ejecuta el pipeline `build_features` completo sobre el frame histórico cacheado
    más una fila virtual, garantizando consistencia exacta con las features de
    entrenamiento. Devuelve (feature_dict, cold_start).
    """
    history = _get_league_history(session, league_id)
    df_hist = history.df_hist

    # Cold start: algún equipo con < WINDOW partidos en BD
    if df_hist.empty:
        home_count = away_count = 0
    else:
        home_count = ((df_hist["HomeTeam"] == home_name) | (df_hist["AwayTeam"] == home_name)).sum()
        away_count = ((df_hist["HomeTeam"] == away_name) | (df_hist["AwayTeam"] == away_name)).sum()
    cold_start = bool(home_count < WINDOW or away_count < WINDOW)

    # Partido virtual: resultado y stats dummy — no se usan en sus propias features
    # gracias al shift(1) de todos los bloques vectorizados. Cuotas neutras (3.0):
    # prob_diff_market se recalcula desde las cuotas reales en compute_prediction_features.
    # Se usa la última temporada real del historial para que compute_rest_days pueda
    # calcular días de descanso desde el último partido de esa temporada.
    virtual_row = pd.DataFrame(
        [
            {
                "match_id": _VIRTUAL_ID,
                "Date": datetime.now(tz=timezone.utc).replace(tzinfo=None),
                "HomeTeam": home_name,
                "AwayTeam": away_name,
                "Season": history.latest_season_label,
                "League": _LEAGUE_PLACEHOLDER,
                "FTR": "H",   # dummy — no afecta las features del propio partido
                "FTHG": 0,
                "FTAG": 0,
                "HST": 0,
                "AST": 0,
                "home_xg": 0.0,
                "away_xg": 0.0,
                "PSCH": 3.0,
                "PSCD": 3.0,
                "PSCA": 3.0,
            }
        ]
    )

    df_full = pd.concat([df_hist, virtual_row], ignore_index=True)
    df_full["Date"] = pd.to_datetime(df_full["Date"])

    # Import lazy — evita cargar pandas/sklearn al arrancar la API
    from src.features.build_features import build_features  # noqa: PLC0415
    from src.features._constants import FEATURES  # noqa: PLC0415

    df_features = build_features(df_full)

    # build_features hace reset_index() al final — match_id es columna, no índice
    virtual_row_features = df_features[df_features["match_id"] == _VIRTUAL_ID]
    if virtual_row_features.empty:
        return {f: 0.0 for f in FEATURES}, True

    row = virtual_row_features.iloc[0]
    feature_dict = {f: float(row[f]) for f in FEATURES if f in row.index}

    # rest_days_diff mide días desde el último partido de la temporada. Para un partido
    # hipotético con fecha actual (~2 años después del último dato), ambos equipos
    # acumulan ~730 días de "descanso" y la diferencia es ruido puro. Se imputa a 0:
    # sin ventaja de descanso para ninguno de los equipos.
    feature_dict["rest_days_diff"] = 0.0

    return feature_dict, cold_start
