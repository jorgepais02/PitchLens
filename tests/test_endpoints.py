"""Tests de los endpoints GET de lectura (Fase 6): leagues, seasons, teams, matches.

Usa el fixture `client_with_teams` (conftest): 2 ligas, 1 temporada (premier 2024)
y 3 equipos, SIN partidos — ideal para validar filtros vacíos y 404 de slugs/filtros.
"""

from fastapi.testclient import TestClient



def test_leagues_devuelve_las_dos(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/leagues")
    assert r.status_code == 200
    codes = {lg["code"] for lg in r.json()}
    assert codes == {"premier", "laliga"}




def test_seasons_sin_filtro(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/seasons")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["end_year"] == 2024


def test_seasons_filtra_por_liga(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/seasons", params={"league_code": "premier"})
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_seasons_liga_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/seasons", params={"league_code": "noexiste"})
    assert r.status_code == 404


def test_seasons_liga_sin_temporadas_devuelve_vacio(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/seasons", params={"league_code": "laliga"})
    assert r.status_code == 200
    assert r.json() == []




def test_teams_sin_filtro_orden_alfabetico(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams")
    assert r.status_code == 200
    nombres = [t["name"] for t in r.json()]
    assert nombres == ["Arsenal", "Chelsea", "Real Madrid"]


def test_teams_filtra_por_liga(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams", params={"league_code": "premier"})
    assert r.status_code == 200
    assert {t["name"] for t in r.json()} == {"Arsenal", "Chelsea"}


def test_teams_liga_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams", params={"league_code": "noexiste"})
    assert r.status_code == 404


def test_team_detalle_con_liga(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams/10")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Arsenal"
    assert body["league"]["code"] == "premier"


def test_team_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams/9999")
    assert r.status_code == 404




def test_team_stats_sin_partidos(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams/10/stats")
    assert r.status_code == 200
    body = r.json()
    assert body["matches_played"] == 0
    assert body["last5"] == []
    assert body["matches_with_features_pct"] == 0.0


def test_team_stats_temporada_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams/10/stats", params={"season": 1999})
    assert r.status_code == 404


def test_team_stats_equipo_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/teams/9999/stats")
    assert r.status_code == 404




def test_matches_vacio(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/matches")
    assert r.status_code == 200
    assert r.json() == []


def test_matches_offset_mas_alla_del_total(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/matches", params={"offset": 1000})
    assert r.status_code == 200
    assert r.json() == []


def test_matches_liga_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/matches", params={"league_code": "noexiste"})
    assert r.status_code == 404


def test_matches_temporada_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/matches", params={"season": 1999})
    assert r.status_code == 404


def test_matches_filtro_combinado_sin_resultados(client_with_teams: TestClient) -> None:
    r = client_with_teams.get(
        "/matches", params={"league_code": "premier", "season": 2024, "team_id": 10}
    )
    assert r.status_code == 200
    assert r.json() == []


def test_match_slug_inexistente_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.get("/matches/partido-que-no-existe")
    assert r.status_code == 404
