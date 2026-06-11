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
) -> tuple[dict[str, float], bool, bool, dict[str, dict[str, float]]]:
    """Calcula las 12 features para un partido hipotético futuro.

    Devuelve (feature_dict, cold_start_warning, h2h_cold_start, split_values).
    cold_start_warning=True si alguno de los equipos tiene < WINDOW partidos en la BD.
    h2h_cold_start=True si el par tiene < H2H_WINDOW enfrentamientos directos.
    split_values: {feature: {"home": val, "away": val}} para visualización butterfly.
    """
    home_team = session.get(Team, home_team_id)
    away_team = session.get(Team, away_team_id)
    if home_team is None or away_team is None:
        raise ValueError("Equipo no encontrado")

    market = _market_value(psch, pscd, psca)

    cache_key = (home_team_id, away_team_id)
    with _CACHE_LOCK:
        cached = _FEATURE_CACHE.get(cache_key)
    if cached is not None:
        feature_dict, cold_start, h2h_cold_start = cached
        result = dict(feature_dict)
        result["prob_diff_market"] = market
        # Reconstruir split con las cuotas actuales (prob_diff_market depende de ellas)
        history = _get_league_history(session, home_team.league_id)
        df_hist = history.df_hist
        virtual_row = pd.DataFrame([{
            "match_id": _VIRTUAL_ID, "Date": __import__("datetime").datetime.utcnow(),
            "HomeTeam": home_team.name, "AwayTeam": away_team.name,
            "Season": history.latest_season_label, "League": _LEAGUE_PLACEHOLDER,
            "FTR": "H", "FTHG": 0, "FTAG": 0, "HST": 0, "AST": 0,
            "home_xg": 0.0, "away_xg": 0.0, "PSCH": 3.0, "PSCD": 3.0, "PSCA": 3.0,
        }])
        df_full = pd.concat([df_hist, virtual_row], ignore_index=True)
        df_full["Date"] = pd.to_datetime(df_full["Date"])
        split = _compute_split_values(df_full, home_team.name, away_team.name, psch, pscd, psca)
        return result, cold_start, h2h_cold_start, split

    feature_dict, cold_start, h2h_cold_start, df_full = _build_deterministic_features(
        session, home_team.league_id, home_team.name, away_team.name
    )

    with _CACHE_LOCK:
        _FEATURE_CACHE[cache_key] = (feature_dict, cold_start, h2h_cold_start)

    result = dict(feature_dict)
    result["prob_diff_market"] = market
    split = _compute_split_values(df_full, home_team.name, away_team.name, psch, pscd, psca)
    return result, cold_start, h2h_cold_start, split


def _compute_split_values(
    df_full: pd.DataFrame,
    home_name: str,
    away_name: str,
    psch: float | None,
    pscd: float | None,
    psca: float | None,
) -> dict[str, dict[str, float]]:
    """Valores individuales (home, away) por feature para visualización butterfly.

    Devuelve {feature: {"home": val, "away": val}}.
    """
    from src.features._team_view import _build_team_view  # noqa: PLC0415
    from src.features._constants import ELO_K, ELO_BASE, WINDOW, H2H_WINDOW  # noqa: PLC0415

    split: dict[str, dict[str, float]] = {}
    df = df_full.sort_values("Date").reset_index(drop=True)
    tv = _build_team_view(df)

    # ─── ELO individual ──────────────────────────────────────────────────
    elo: dict[str, float] = {}
    for row in df.itertuples():
        h_name, a_name = row.HomeTeam, row.AwayTeam
        elo_h = elo.get(h_name, ELO_BASE)
        elo_a = elo.get(a_name, ELO_BASE)
        if row.match_id == _VIRTUAL_ID:
            split["elo_diff_pre"] = {"home": round(elo_h, 1), "away": round(elo_a, 1)}
            break
        s_h = 1.0 if row.FTR == "H" else (0.5 if row.FTR == "D" else 0.0)
        e_h = 1.0 / (1.0 + 10.0 ** ((elo_a - elo_h) / 400.0))
        delta = ELO_K * (s_h - e_h)
        elo[h_name] = elo_h + delta
        elo[a_name] = elo_a - delta

    # ─── Rolling form (global) ────────────────────────────────────────────
    tv2 = tv.copy()
    tv2["gd"]      = tv2["gf"] - tv2["gc"]
    tv2["xgd"]     = tv2["xgf"] - tv2["xgc"]
    tv2["sot_net"] = tv2["sot"] - tv2["soc"]

    grp = tv2.groupby("team")
    for col in ["gd", "xgd", "xgc", "xgf", "sot_net", "gf", "gc"]:
        tv2[f"{col}_roll"] = grp[col].transform(
            lambda s: s.shift(1).rolling(WINDOW, min_periods=1).mean()
        )
    for col in ["gf", "gc"]:
        tv2[f"{col}_sum"] = grp[col].transform(
            lambda s: s.shift(1).rolling(WINDOW, min_periods=1).sum()
        )

    h_row = tv2[(tv2["match_id"] == _VIRTUAL_ID) & (tv2["team"] == home_name)]
    a_row = tv2[(tv2["match_id"] == _VIRTUAL_ID) & (tv2["team"] == away_name)]
    if not h_row.empty and not a_row.empty:
        h, a = h_row.iloc[0], a_row.iloc[0]
        split["goal_diff_last5_global"]          = {"home": round(float(h["gd_roll"]),      3), "away": round(float(a["gd_roll"]),      3)}
        split["xg_diff_last5_global"]            = {"home": round(float(h["xgd_roll"]),     3), "away": round(float(a["xgd_roll"]),     3)}
        split["xg_conceded_diff_last5_global"]   = {"home": round(float(h["xgc_roll"]),     3), "away": round(float(a["xgc_roll"]),     3)}
        split["sot_diff_last5_global"]           = {"home": round(float(h["sot_net_roll"]), 3), "away": round(float(a["sot_net_roll"]), 3)}
        split["goals_scored_last5"]              = {"home": round(float(h["gf_sum"]),       1), "away": round(float(a["gf_sum"]),       1)}
        split["goals_conceded_last5"]            = {"home": round(float(h["gc_sum"]),       1), "away": round(float(a["gc_sum"]),       1)}
        split["xg_scored_last5"]                 = {"home": round(float(h["xgf_roll"]),     2), "away": round(float(a["xgf_roll"]),     2)}
        split["xg_conceded_last5"]               = {"home": round(float(h["xgc_roll"]),     2), "away": round(float(a["xgc_roll"]),     2)}

    # ─── Puntos acumulados en la temporada actual ─────────────────────────
    virtual_season = df.loc[df["match_id"] == _VIRTUAL_ID, "Season"]
    if not virtual_season.empty:
        season_label = virtual_season.iloc[0]
        season_df = df[(df["Season"] == season_label) & (df["match_id"] != _VIRTUAL_ID)]

        def _pts(team: str) -> float:
            tm = season_df[(season_df["HomeTeam"] == team) | (season_df["AwayTeam"] == team)]
            pts = 0.0
            for _, m in tm.iterrows():
                is_h = m["HomeTeam"] == team
                ftr  = m["FTR"]
                if (is_h and ftr == "H") or (not is_h and ftr == "A"):
                    pts += 3.0
                elif ftr == "D":
                    pts += 1.0
            return pts

        split["points_diff_global"] = {"home": _pts(home_name), "away": _pts(away_name)}

    # ─── Cuotas Pinnacle → probabilidades implícitas ──────────────────────
    _psch = psch if psch is not None else 3.0
    _pscd = pscd if pscd is not None else 3.0
    _psca = psca if psca is not None else 3.0
    p_h_r, p_d_r, p_a_r = 1.0 / _psch, 1.0 / _pscd, 1.0 / _psca
    ov = p_h_r + p_d_r + p_a_r
    split["prob_diff_market"] = {
        "home": round(p_h_r / ov, 4),
        "away": round(p_a_r / ov, 4),
    }

    # ─── H2H ─────────────────────────────────────────────────────────────
    h2h = df[
        (
            ((df["HomeTeam"] == home_name) & (df["AwayTeam"] == away_name)) |
            ((df["HomeTeam"] == away_name) & (df["AwayTeam"] == home_name))
        ) & (df["match_id"] != _VIRTUAL_ID)
    ].sort_values("Date").tail(H2H_WINDOW)

    if not h2h.empty:
        home_wins = away_wins = 0
        home_gd_sum = 0.0
        home_goals = away_goals = 0.0
        for _, m in h2h.iterrows():
            is_h = m["HomeTeam"] == home_name
            ftr  = m["FTR"]
            gd   = float(m["FTHG"] - m["FTAG"]) if is_h else float(m["FTAG"] - m["FTHG"])
            home_gd_sum += gd
            # goles anotados por cada equipo (perspectiva independiente)
            if is_h:
                home_goals += float(m["FTHG"])
                away_goals += float(m["FTAG"])
            else:
                home_goals += float(m["FTAG"])
                away_goals += float(m["FTHG"])
            if (is_h and ftr == "H") or (not is_h and ftr == "A"):
                home_wins += 1
            elif (is_h and ftr == "A") or (not is_h and ftr == "H"):
                away_wins += 1
        n = len(h2h)
        split["h2h_result_diff_last5"] = {
            "home": round(home_wins / n, 3),
            "away": round(away_wins / n, 3),
        }
        split["h2h_goal_diff_last5"] = {
            "home": round(home_goals / n, 3),
            "away": round(away_goals / n, 3),
        }
        split["h2h_goals_scored_last5"]   = {"home": round(home_goals), "away": round(away_goals)}
        split["h2h_goals_conceded_last5"] = {"home": round(away_goals), "away": round(home_goals)}
    else:
        split["h2h_result_diff_last5"]    = {"home": 0.0, "away": 0.0}
        split["h2h_goal_diff_last5"]      = {"home": 0.0, "away": 0.0}
        split["h2h_goals_scored_last5"]   = {"home": 0.0, "away": 0.0}
        split["h2h_goals_conceded_last5"] = {"home": 0.0, "away": 0.0}

    return split


def _build_cold_start_features(df_full: pd.DataFrame) -> dict[str, float]:
    """Fallback para cold start: reconstruye el pipeline sin dropna e imputa NaN a 0.

    build_features elimina el partido virtual cuando algún equipo tiene < WINDOW
    partidos (NaN en features rolling). Esta función recupera elo_diff_pre, points
    y H2H — que son siempre computables — e imputa las features rolling a 0.
    """
    # Import lazy igual que _build_deterministic_features
    from src.features._constants import (  # noqa: PLC0415
        ELO_BASE, ELO_K, FEATURES, FEATURES_H2H, FEATURES_ROLLING, H2H_WINDOW, WINDOW,
    )
    from src.features._team_view import _build_team_view  # noqa: PLC0415
    from src.features.elo import compute_elo  # noqa: PLC0415
    from src.features.form import compute_global_rolling, compute_venue_rolling  # noqa: PLC0415
    from src.features.h2h import compute_h2h_rolling  # noqa: PLC0415
    from src.features.market import compute_market_feature  # noqa: PLC0415
    from src.features.table import compute_rest_days, compute_table_features  # noqa: PLC0415

    df = df_full.sort_values("Date").reset_index(drop=True)
    tv = _build_team_view(df)

    df_elo_cs    = compute_elo(df, ELO_K, ELO_BASE)
    df_global_cs = compute_global_rolling(df, WINDOW, _tv=tv)
    df_venue_cs  = compute_venue_rolling(df, WINDOW, _tv=tv)
    df_table_cs  = compute_table_features(df, _tv=tv)
    df_rest_cs   = compute_rest_days(df, _tv=tv)
    df_market_cs = compute_market_feature(df)
    df_h2h_cs    = compute_h2h_rolling(df, H2H_WINDOW)

    df_base_cs = df[["match_id", "League", "Season", "Date", "HomeTeam", "AwayTeam", "FTR"]].set_index("match_id")
    df_raw_cs = (
        df_base_cs
        .join(df_elo_cs[["elo_diff_pre"]])
        .join(df_table_cs[["points_diff_global", "points_diff_venue"]])
        .join(df_global_cs[["goal_diff_last5_global", "xg_diff_last5_global",
                             "xg_conceded_diff_last5_global", "sot_diff_last5_global"]])
        .join(df_venue_cs[["goal_diff_last5_venue"]])
        .join(df_rest_cs[["rest_days_diff"]])
        .join(df_market_cs[["prob_diff_market"]])
        .join(df_h2h_cs[FEATURES_H2H])
    )
    df_raw_cs[FEATURES_H2H]     = df_raw_cs[FEATURES_H2H].fillna(0.0)
    df_raw_cs[FEATURES_ROLLING] = df_raw_cs[FEATURES_ROLLING].fillna(0.0)
    df_raw_cs = df_raw_cs.reset_index()

    virtual_cs = df_raw_cs[df_raw_cs["match_id"] == _VIRTUAL_ID]
    if virtual_cs.empty:
        from src.features._constants import FEATURES as _FEATURES  # noqa: PLC0415
        return {f: 0.0 for f in _FEATURES}

    row_cs = virtual_cs.iloc[0]
    result = {f: float(row_cs[f]) for f in FEATURES if f in row_cs.index}
    result["rest_days_diff"] = 0.0
    return result


def _build_deterministic_features(
    session: Session,
    league_id: int,
    home_name: str,
    away_name: str,
) -> tuple[dict[str, float], bool, bool, "pd.DataFrame"]:
    """Construye las 12 features con cuotas neutras (prob_diff_market se aplica aparte).

    Devuelve (feature_dict, cold_start, h2h_cold_start, df_full) donde df_full
    es el historial + fila virtual, necesario para _compute_split_values.
    """
    history = _get_league_history(session, league_id)
    df_hist = history.df_hist

    # Cold start individual: algún equipo con < WINDOW partidos en BD
    if df_hist.empty:
        home_count = away_count = h2h_count = 0
    else:
        home_count = ((df_hist["HomeTeam"] == home_name) | (df_hist["AwayTeam"] == home_name)).sum()
        away_count = ((df_hist["HomeTeam"] == away_name) | (df_hist["AwayTeam"] == away_name)).sum()
        h2h_count  = (
            ((df_hist["HomeTeam"] == home_name) & (df_hist["AwayTeam"] == away_name)) |
            ((df_hist["HomeTeam"] == away_name) & (df_hist["AwayTeam"] == home_name))
        ).sum()
    cold_start     = bool(home_count < WINDOW or away_count < WINDOW)
    from src.features._constants import H2H_WINDOW  # noqa: PLC0415
    h2h_cold_start = bool(h2h_count < H2H_WINDOW)

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
        # build_features eliminó el partido virtual por NaN en FEATURES_ROLLING (cold start).
        # Reconstruimos sin dropna para conservar elo_diff_pre, points y H2H;
        # las features rolling se imputan a 0 (sin historial = rendimiento neutro).
        feature_dict = _build_cold_start_features(df_full)
        return feature_dict, True, h2h_cold_start, df_full

    row = virtual_row_features.iloc[0]
    feature_dict = {f: float(row[f]) for f in FEATURES if f in row.index}
    feature_dict["rest_days_diff"] = 0.0

    return feature_dict, cold_start, h2h_cold_start, df_full
