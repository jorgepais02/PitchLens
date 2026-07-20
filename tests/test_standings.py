"""Tests de GET /standings — clasificación calculada con GROUP BY sobre matches.

Usa los fixtures `client_with_teams` (sin partidos) y `session` (conftest) para
sembrar una mini-temporada de 3 partidos entre Arsenal y Chelsea.
"""

from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session

from src.db.models import Match


def _make_match(slug: str, date: datetime, home_id: int, away_id: int, fthg: int, ftag: int) -> Match:
    """Partido premier 2024 con stats fijas y resultado derivado del marcador."""
    ftr = "H" if fthg > ftag else ("A" if ftag > fthg else "D")
    return Match(
        slug=slug, date=date, league_id=1, season_id=1,
        home_team_id=home_id, away_team_id=away_id,
        fthg=fthg, ftag=ftag, ftr=ftr, hthg=0, htag=0, htr="D",
        home_shots=10, away_shots=8, home_shots_on_target=5, away_shots_on_target=3,
        home_fouls=10, away_fouls=11, home_corners=5, away_corners=4,
        home_yellows=1, away_yellows=2, home_reds=0, away_reds=0,
        b365h=1.9, b365d=3.4, b365a=4.2,
        psh=1.9, psd=3.4, psa=4.2, psch=1.9, pscd=3.4, psca=4.2,
        home_xg=1.5, away_xg=0.8,
    )


def _seed_matches(session: Session) -> None:
    """3 partidos: Arsenal gana 2 (2-0, 1-0 fuera) y empata 1 (1-1)."""
    session.add_all([
        _make_match("m1", datetime(2023, 9, 1), 10, 11, 2, 0),
        _make_match("m2", datetime(2023, 10, 1), 11, 10, 0, 1),
        _make_match("m3", datetime(2023, 11, 1), 10, 11, 1, 1),
    ])
    session.commit()


def test_standings_orden_y_agregados(client_with_teams: TestClient, session: Session) -> None:
    _seed_matches(session)
    r = client_with_teams.get("/standings", params={"league_code": "premier", "season": 2024})
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 2

    arsenal, chelsea = rows[0], rows[1]
    assert arsenal["team_name"] == "Arsenal"
    assert arsenal["played"] == 3
    assert arsenal["wins"] == 2
    assert arsenal["draws"] == 1
    assert arsenal["losses"] == 0
    assert arsenal["goals_for"] == 4
    assert arsenal["goals_against"] == 1
    assert arsenal["goal_diff"] == 3
    assert arsenal["points"] == 7

    assert chelsea["team_name"] == "Chelsea"
    assert chelsea["points"] == 1
    assert chelsea["goal_diff"] == -3


def test_standings_liga_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/standings", params={"league_code": "noexiste", "season": 2024})
    assert r.status_code == 404


def test_standings_temporada_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/standings", params={"league_code": "premier", "season": 1999})
    assert r.status_code == 404


def test_standings_temporada_sin_partidos_devuelve_vacio(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/standings", params={"league_code": "premier", "season": 2024})
    assert r.status_code == 200
    assert r.json() == []
