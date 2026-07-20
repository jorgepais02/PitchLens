"""Tests de la API FastAPI (Fase 8) con TestClient + SQLite en memoria.

Patrón estándar FastAPI: se sobreescribe get_db con una sesión SQLite
para que los tests sean rápidos, aislados y no necesiten Postgres.
Los fixtures (session, client, client_with_teams) viven en conftest.py.

Tests de entrenamiento real y predicción con historial completo están
marcados como @pytest.mark.integration — requieren Postgres + datos reales.
"""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.db.auth_models import CustomModel, User



def test_register_devuelve_token(client: TestClient) -> None:
    r = client.post(
        "/auth/register", json={"email": "u@test.es", "password": "pass1234"}
    )
    assert r.status_code == 201
    body = r.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert len(body["access_token"].split(".")) == 3


def test_register_email_duplicado(client: TestClient) -> None:
    payload = {"email": "dup@test.es", "password": "pass1234"}
    client.post("/auth/register", json=payload)
    r = client.post("/auth/register", json=payload)
    assert r.status_code == 409
    assert "ya registrado" in r.json()["detail"]


def test_register_contrasena_corta(client: TestClient) -> None:
    r = client.post("/auth/register", json={"email": "u@test.es", "password": "abc"})
    assert r.status_code == 422


def test_register_email_invalido(client: TestClient) -> None:
    r = client.post("/auth/register", json={"email": "noemail", "password": "pass1234"})
    assert r.status_code == 422




def test_login_correcto(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "u@test.es", "password": "pass1234"})
    r = client.post("/auth/login", json={"email": "u@test.es", "password": "pass1234"})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_login_contrasena_incorrecta(client: TestClient) -> None:
    client.post("/auth/register", json={"email": "u@test.es", "password": "pass1234"})
    r = client.post("/auth/login", json={"email": "u@test.es", "password": "wrong"})
    assert r.status_code == 401


def test_login_email_inexistente(client: TestClient) -> None:
    r = client.post(
        "/auth/login", json={"email": "noexiste@test.es", "password": "pass1234"}
    )
    assert r.status_code == 401




def test_train_sin_jwt_devuelve_401(client: TestClient) -> None:
    r = client.post("/train", json={"features": ["elo_diff_pre"], "algorithm": "lr"})
    assert r.status_code == 401


def test_predict_custom_sin_jwt_devuelve_401(client: TestClient) -> None:
    r = client.post(
        "/predict/custom", json={"home_team_id": 1, "away_team_id": 2, "model_id": 1}
    )
    assert r.status_code == 401


def test_token_invalido_devuelve_401(client: TestClient) -> None:
    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre"], "algorithm": "lr"},
        headers={"Authorization": "Bearer token.invalido.aqui"},
    )
    assert r.status_code == 401




def test_models_sin_auth_devuelve_preentrenados(client: TestClient) -> None:
    r = client.get("/models")
    assert r.status_code == 200
    body = r.json()
    assert len(body["pretrained"]) == 3
    assert body["custom"] == []
    nombres = {m["name"] for m in body["pretrained"]}
    assert nombres == {"baseline", "extended", "market"}


def test_models_con_auth_devuelve_custom_vacio_inicial(client: TestClient) -> None:
    token = client.post(
        "/auth/register", json={"email": "u@test.es", "password": "pass1234"}
    ).json()["access_token"]
    r = client.get("/models", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["custom"] == []


def test_models_preentrenados_tienen_metricas(client: TestClient) -> None:
    body = client.get("/models").json()
    for m in body["pretrained"]:
        assert m["val_accuracy"] is not None
        assert m["test_accuracy"] is not None
        assert m["test_log_loss"] is not None




def test_features_available_devuelve_12(client: TestClient) -> None:
    r = client.get("/features/available")
    assert r.status_code == 200
    features = r.json()
    assert len(features) == 12
    for f in features:
        assert "name" in f
        assert "description" in f
        assert "used_in_models" in f
        assert len(f["used_in_models"]) >= 1




def test_predict_home_igual_away_devuelve_422(client_with_teams: TestClient) -> None:
    r = client_with_teams.post(
        "/predict", json={"home_team_id": 10, "away_team_id": 10, "model": "baseline"}
    )
    assert r.status_code == 422


def test_predict_equipos_de_distintas_ligas_devuelve_422(
    client_with_teams: TestClient,
) -> None:
    r = client_with_teams.post(
        "/predict", json={"home_team_id": 10, "away_team_id": 20, "model": "baseline"}
    )
    assert r.status_code == 422
    assert "misma liga" in r.json()["detail"]


def test_predict_market_sin_cuotas_devuelve_422(client_with_teams: TestClient) -> None:
    r = client_with_teams.post(
        "/predict", json={"home_team_id": 10, "away_team_id": 11, "model": "market"}
    )
    assert r.status_code == 422
    assert "psch" in r.json()["detail"]


def test_predict_equipo_inexistente_devuelve_404(client_with_teams: TestClient) -> None:
    r = client_with_teams.post(
        "/predict",
        json={"home_team_id": 99999, "away_team_id": 11, "model": "baseline"},
    )
    assert r.status_code == 404




def _get_token(client: TestClient, email: str = "u@test.es") -> str:
    return client.post(
        "/auth/register", json={"email": email, "password": "pass1234"}
    ).json()["access_token"]


def test_train_feature_invalida_devuelve_422(client: TestClient) -> None:
    token = _get_token(client)
    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre", "feature_inventada"], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_train_lista_vacia_devuelve_422(client: TestClient) -> None:
    token = _get_token(client)
    r = client.post(
        "/train",
        json={"features": [], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422


def test_train_algoritmo_invalido_devuelve_422(client: TestClient) -> None:
    token = _get_token(client)
    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre"], "algorithm": "svm"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 422




def _patch_training(monkeypatch, session: Session) -> None:
    """Sustituye el entrenamiento real y la sesión del job por stubs de test."""

    def _fake_train_custom(features, algorithm, artifact_path):
        return {
            "val": {"accuracy": 0.55, "log_loss": 0.90},
            "test": {"accuracy": 0.57, "log_loss": 0.93},
            "feature_importance": [{"feature": features[0], "importance": 1.0}],
        }

    @contextmanager
    def _fake_scope():
        yield session

    monkeypatch.setattr("src.ml.custom_trainer.train_custom", _fake_train_custom)
    monkeypatch.setattr("src.api.routers.train._session_scope", _fake_scope)


def test_train_devuelve_202_y_job_completa(
    client: TestClient, session: Session, monkeypatch
) -> None:
    """POST /train acepta el job (202) y, tras el background, queda 'done' con resultado."""
    _patch_training(monkeypatch, session)
    token = _get_token(client)

    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre", "points_diff_global"], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    assert r.json()["status"] == "pending"

    status_r = client.get(
        f"/train/jobs/{job_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert status_r.status_code == 200
    body = status_r.json()
    assert body["status"] == "done"
    assert body["result"]["model_id"] >= 1
    assert body["result"]["test_accuracy"] == 0.57
    assert body["error"] is None


def test_train_job_sin_jwt_devuelve_401(client: TestClient) -> None:
    r = client.get("/train/jobs/cualquier-id")
    assert r.status_code == 401


def test_train_job_ajeno_devuelve_404(
    client: TestClient, session: Session, monkeypatch
) -> None:
    """El usuario B no puede consultar el estado de un job del usuario A."""
    _patch_training(monkeypatch, session)
    token_a = _get_token(client, email="a@test.es")

    job_id = client.post(
        "/train",
        json={"features": ["elo_diff_pre"], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["job_id"]

    token_b = _get_token(client, email="b@test.es")
    r = client.get(
        f"/train/jobs/{job_id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert r.status_code == 404




def test_predict_custom_model_id_inexistente_devuelve_404(
    client_with_teams: TestClient,
) -> None:
    token = _get_token(client_with_teams)
    r = client_with_teams.post(
        "/predict/custom",
        json={"home_team_id": 10, "away_team_id": 11, "model_id": 99999},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 404


def test_predict_custom_model_ajeno_devuelve_404(
    client_with_teams: TestClient, session: Session
) -> None:
    """Un usuario no puede usar el modelo de OTRO usuario (aislamiento real).

    A diferencia del test de model_id inexistente, aquí el modelo SÍ existe pero
    pertenece al usuario A; el usuario B (autenticado) debe recibir 404 por
    propiedad, no por ausencia.
    """
    user_a = User(email="a@test.es", password_hash="x")
    session.add(user_a)
    session.commit()
    session.refresh(user_a)

    modelo_a = CustomModel(
        user_id=user_a.id,
        name="Modelo de A",
        algorithm="lr",
        features=["elo_diff_pre"],
        metrics={"val": {"accuracy": 0.5, "log_loss": 1.0}},
        artifact_path="models/custom/inexistente.pkl",
    )
    session.add(modelo_a)
    session.commit()
    session.refresh(modelo_a)

    token_b = _get_token(client_with_teams, email="b@test.es")
    r = client_with_teams.post(
        "/predict/custom",
        json={"home_team_id": 10, "away_team_id": 11, "model_id": modelo_a.id},
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Modelo no encontrado"


def test_predict_custom_artefacto_borrado_devuelve_503(
    client_with_teams: TestClient, session: Session, monkeypatch
) -> None:
    """Si el .pkl del modelo se borró en disco, /predict/custom devuelve 503."""
    token = _get_token(client_with_teams)
    user = session.exec(select(User)).first()
    modelo = CustomModel(
        user_id=user.id,
        name="Modelo sin artefacto",
        algorithm="lr",
        features=["elo_diff_pre"],
        metrics={"val": {"accuracy": 0.5, "log_loss": 1.0}},
        artifact_path="models/custom/no_existe_999.pkl",
    )
    session.add(modelo)
    session.commit()
    session.refresh(modelo)

    monkeypatch.setattr(
        "src.api.routers.predict.compute_prediction_features",
        lambda **kwargs: ({"elo_diff_pre": 0.0}, False, False, {}),
    )

    r = client_with_teams.post(
        "/predict/custom",
        json={"home_team_id": 10, "away_team_id": 11, "model_id": modelo.id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 503




@pytest.mark.integration
def test_predict_baseline_probabilidades_validas() -> None:
    """Con datos reales de BD, las probabilidades deben sumar 1."""
    import httpx

    r = httpx.post(
        "http://127.0.0.1:8000/predict",
        json={"home_team_id": 60, "away_team_id": 67, "model": "baseline"},
    )
    assert r.status_code == 200
    body = r.json()
    assert abs(body["prob_h"] + body["prob_d"] + body["prob_a"] - 1.0) < 1e-3


@pytest.mark.integration
def test_predict_market_con_cuotas_incluye_prob_diff_market() -> None:
    """El modelo market debe incluir prob_diff_market en feature_importance."""
    import httpx

    r = httpx.post(
        "http://127.0.0.1:8000/predict",
        json={
            "home_team_id": 60,
            "away_team_id": 67,
            "model": "market",
            "psch": 2.1,
            "pscd": 3.4,
            "psca": 4.2,
        },
    )
    assert r.status_code == 200
    names = {d["feature"] for d in r.json()["feature_importance"]}
    assert "prob_diff_market" in names
