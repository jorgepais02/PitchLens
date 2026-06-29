"""Tests unitarios de feature_builder.compute_prediction_features.

Es el eje de /predict: construye el partido virtual, calcula las 12 features
desde el historial de la liga (anti-leakage vía shift(1)), detecta cold start
e imputa rest_days_diff=0. Se prueba contra una liga sintética en SQLite.

Para que el partido virtual sobreviva al dropna de FEATURES_ROLLING (incluido
goal_diff_last5_venue), el equipo local necesita ≥WINDOW partidos como LOCAL y
el visitante ≥WINDOW como VISITANTE: por eso el helper crea siempre A en casa
contra B fuera.
"""

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session

from src.services.feature_builder import compute_prediction_features
from src.db.models import League, Match, Season, Team
from src.features._constants import FEATURES, WINDOW

_TEAM_A = 1
_TEAM_B = 2


def _make_match(slug: str, date: datetime, season_id: int, fthg: int, ftag: int) -> Match:
    """Partido A(local) vs B(visitante) con stats deterministas."""
    ftr = "H" if fthg > ftag else ("A" if ftag > fthg else "D")
    return Match(
        slug=slug,
        date=date,
        league_id=1,
        season_id=season_id,
        home_team_id=_TEAM_A,
        away_team_id=_TEAM_B,
        fthg=fthg,
        ftag=ftag,
        ftr=ftr,
        hthg=0,
        htag=0,
        htr="D",
        home_shots=12,
        away_shots=9,
        home_shots_on_target=6,
        away_shots_on_target=3,
        home_fouls=10,
        away_fouls=11,
        home_corners=6,
        away_corners=4,
        home_yellows=1,
        away_yellows=2,
        home_reds=0,
        away_reds=0,
        b365h=1.9,
        b365d=3.4,
        b365a=4.2,
        psh=1.9,
        psd=3.4,
        psa=4.2,
        psch=1.9,
        pscd=3.4,
        psca=4.2,
        home_xg=1.7,
        away_xg=0.9,
    )


def _seed(session: Session, n_matches: int) -> None:
    """Crea liga premier 2024 con dos equipos y n partidos A(local) vs B(visitante)."""
    session.add(League(id=1, code="premier", name="Premier League"))
    session.add(Season(id=1, end_year=2024, label="2023/24", league_id=1))
    session.add(Team(id=_TEAM_A, name="Team A", league_id=1))
    session.add(Team(id=_TEAM_B, name="Team B", league_id=1))
    session.commit()

    start = datetime(2024, 1, 6)
    for i in range(n_matches):
        session.add(
            _make_match(
                slug=f"m{i}",
                date=start + timedelta(days=7 * i),
                season_id=1,
                fthg=2,
                ftag=1,
            )
        )
    session.commit()


def test_sin_cold_start_devuelve_12_features_finitas(session: Session) -> None:
    """Con historial suficiente, devuelve las 12 features y cold_start=False."""
    import math

    _seed(session, n_matches=7)
    features, cold_start, _h2h, _split = compute_prediction_features(session, _TEAM_A, _TEAM_B)

    assert cold_start is False
    assert set(features) == set(FEATURES)
    assert all(math.isfinite(v) for v in features.values())


def test_cold_start_true_con_historial_insuficiente(session: Session) -> None:
    """Con menos de WINDOW partidos por equipo, cold_start=True."""
    _seed(session, n_matches=WINDOW - 2)
    _, cold_start, *_ = compute_prediction_features(session, _TEAM_A, _TEAM_B)
    assert cold_start is True


def test_rest_days_diff_se_imputa_a_cero(session: Session) -> None:
    """rest_days_diff siempre 0 en partido hipotético (descanso no comparable)."""
    _seed(session, n_matches=7)
    features, *_ = compute_prediction_features(session, _TEAM_A, _TEAM_B)
    assert features["rest_days_diff"] == 0.0


def test_prob_diff_market_refleja_las_cuotas(session: Session) -> None:
    """Las cuotas del partido virtual se propagan a prob_diff_market (passthrough)."""
    _seed(session, n_matches=7)

    fav_local, *_ = compute_prediction_features(
        session, _TEAM_A, _TEAM_B, psch=1.2, pscd=6.0, psca=9.0
    )
    fav_visit, *_ = compute_prediction_features(
        session, _TEAM_A, _TEAM_B, psch=9.0, pscd=6.0, psca=1.2
    )

    assert fav_local["prob_diff_market"] > 0
    assert fav_visit["prob_diff_market"] < 0


def test_equipo_inexistente_lanza_valueerror(session: Session) -> None:
    _seed(session, n_matches=7)
    with pytest.raises(ValueError):
        compute_prediction_features(session, _TEAM_A, 9999)


def test_market_value_coincide_con_el_pipeline() -> None:
    """El override de prob_diff_market usa la misma fórmula que market.compute_market_feature."""
    import pandas as pd

    from src.services.feature_builder import _market_value
    from src.features.market import compute_market_feature

    df = pd.DataFrame({"match_id": [1], "PSCH": [1.5], "PSCD": [4.0], "PSCA": [6.0]})
    esperado = compute_market_feature(df)["prob_diff_market"].iloc[0]
    assert _market_value(1.5, 4.0, 6.0) == pytest.approx(esperado)


def test_features_cacheadas_iguales_a_build_features_completo(session: Session) -> None:
    """La ruta optimizada (cache + override) coincide exactamente con un build_features
    de la fila virtual con las cuotas reales. Garantiza que cachear no altera salidas."""
    import pandas as pd

    from src.services.feature_builder import (
        _LEAGUE_PLACEHOLDER,
        _VIRTUAL_ID,
        _get_league_history,
    )
    from src.features._constants import FEATURES
    from src.features.build_features import build_features

    _seed(session, n_matches=7)
    psch, pscd, psca = 1.6, 3.8, 5.5

    # Ruta optimizada
    optim, *_ = compute_prediction_features(session, _TEAM_A, _TEAM_B, psch=psch, pscd=pscd, psca=psca)

    # Referencia: build_features sobre la misma fila virtual con cuotas reales
    history = _get_league_history(session, 1)
    virtual = pd.DataFrame([{
        "match_id": _VIRTUAL_ID, "Date": pd.Timestamp.utcnow().tz_localize(None),
        "HomeTeam": "Team A", "AwayTeam": "Team B", "Season": history.latest_season_label,
        "League": _LEAGUE_PLACEHOLDER, "FTR": "H", "FTHG": 0, "FTAG": 0, "HST": 0, "AST": 0,
        "home_xg": 0.0, "away_xg": 0.0, "PSCH": psch, "PSCD": pscd, "PSCA": psca,
    }])
    df_full = pd.concat([history.df_hist, virtual], ignore_index=True)
    df_full["Date"] = pd.to_datetime(df_full["Date"])
    ref_row = build_features(df_full)
    ref_row = ref_row[ref_row["match_id"] == _VIRTUAL_ID].iloc[0]

    for f in FEATURES:
        if f == "rest_days_diff":
            continue  # se imputa a 0 a propósito en la API
        assert optim[f] == pytest.approx(float(ref_row[f])), f
