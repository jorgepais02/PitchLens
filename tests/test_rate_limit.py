"""Tests de los límites de abuso: fuerza bruta en /auth y concurrencia en /train.

Los contadores son estado de proceso, así que el fixture autouse
`_clear_rate_limits` (conftest.py) los resetea entre tests.
"""

from contextlib import contextmanager

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.api import rate_limit
from src.api.rate_limit import RateLimiter
from src.api.routers.train import _set_job
from src.db.auth_models import User

CREDENCIALES = {"email": "victima@test.es", "password": "pass1234"}


def _registrar(client: TestClient, ip: str = "10.0.0.1", **extra) -> None:
    """Crea la cuenta de prueba desde una IP concreta."""
    client.post(
        "/auth/register", json={**CREDENCIALES, **extra}, headers={"X-Forwarded-For": ip}
    )


def _login(client: TestClient, password: str, ip: str = "10.0.0.1"):
    return client.post(
        "/auth/login",
        json={"email": CREDENCIALES["email"], "password": password},
        headers={"X-Forwarded-For": ip},
    )


# --------------------------------------------------------------------------
# RateLimiter — unitarios
# --------------------------------------------------------------------------


def test_limitador_permite_hasta_el_maximo() -> None:
    limitador = RateLimiter(maximo=3, ventana_segundos=60)
    for _ in range(3):
        assert limitador.segundos_de_espera("k") == 0
        limitador.registrar("k")
    assert limitador.segundos_de_espera("k") > 0


def test_limitador_separa_por_clave() -> None:
    limitador = RateLimiter(maximo=1, ventana_segundos=60)
    limitador.registrar("uno")
    assert limitador.segundos_de_espera("uno") > 0
    assert limitador.segundos_de_espera("dos") == 0


def test_limitador_limpiar_libera_la_clave() -> None:
    limitador = RateLimiter(maximo=1, ventana_segundos=60)
    limitador.registrar("k")
    assert limitador.segundos_de_espera("k") > 0
    limitador.limpiar("k")
    assert limitador.segundos_de_espera("k") == 0


def test_limitador_olvida_al_expirar_la_ventana(monkeypatch) -> None:
    """Pasada la ventana, los eventos antiguos dejan de contar."""
    reloj = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: reloj[0])

    limitador = RateLimiter(maximo=2, ventana_segundos=60)
    limitador.registrar("k")
    limitador.registrar("k")
    assert limitador.segundos_de_espera("k") > 0

    reloj[0] += 61
    assert limitador.segundos_de_espera("k") == 0


# --------------------------------------------------------------------------
# client_ip
# --------------------------------------------------------------------------


def test_client_ip_prefiere_forwarded_for(client: TestClient) -> None:
    """Sin leer X-Forwarded-For, todos los clientes compartirían cuota."""
    _registrar(client, ip="1.1.1.1")

    for _ in range(5):
        assert _login(client, "incorrecta", ip="1.1.1.1").status_code == 401
    assert _login(client, "incorrecta", ip="1.1.1.1").status_code == 429

    # Otra IP tiene su propia cuota sobre la misma cuenta.
    assert _login(client, "incorrecta", ip="2.2.2.2").status_code == 401


def test_client_ip_ignora_un_forwarded_for_falsificado(client: TestClient) -> None:
    """Caddy AÑADE la IP real al final; leer la primera entrada sería evadible.

    Se simula al atacante mandando su propia cabecera: el proxy la deja intacta
    y añade la IP de origen detrás. Si el límite se calculase sobre la primera
    entrada, bastaría con cambiarla en cada intento para no agotar nunca la
    cuota.
    """
    _registrar(client, ip="7.7.7.7")

    for i in range(5):
        r = client.post(
            "/auth/login",
            json={"email": CREDENCIALES["email"], "password": "incorrecta"},
            headers={"X-Forwarded-For": f"9.9.9.{i}, 7.7.7.7"},
        )
        assert r.status_code == 401, f"intento {i}"

    # Sexto intento con una primera entrada distinta: debe bloquear igualmente.
    r = client.post(
        "/auth/login",
        json={"email": CREDENCIALES["email"], "password": "incorrecta"},
        headers={"X-Forwarded-For": "9.9.9.99, 7.7.7.7"},
    )
    assert r.status_code == 429


# --------------------------------------------------------------------------
# /auth/login
# --------------------------------------------------------------------------


def test_login_bloquea_tras_cinco_fallos(client: TestClient) -> None:
    _registrar(client)

    for intento in range(5):
        assert _login(client, "incorrecta").status_code == 401, f"intento {intento}"

    r = _login(client, "incorrecta")
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0


def test_login_bloqueado_no_deja_pasar_ni_la_contrasena_correcta(client: TestClient) -> None:
    """Una vez agotada la cuota, acertar tampoco sirve: si no, no frenaría nada."""
    _registrar(client)
    for _ in range(5):
        _login(client, "incorrecta")

    assert _login(client, CREDENCIALES["password"]).status_code == 429


def test_login_correcto_no_consume_cuota(client: TestClient) -> None:
    _registrar(client)
    for _ in range(10):
        assert _login(client, CREDENCIALES["password"]).status_code == 200


def test_login_correcto_limpia_los_fallos_previos(client: TestClient) -> None:
    _registrar(client)
    for _ in range(4):
        assert _login(client, "incorrecta").status_code == 401

    assert _login(client, CREDENCIALES["password"]).status_code == 200

    # El contador se reinició: vuelve a haber margen completo.
    for _ in range(5):
        assert _login(client, "incorrecta").status_code == 401


# --------------------------------------------------------------------------
# /auth/register
# --------------------------------------------------------------------------


def test_register_limita_creacion_masiva_por_ip(client: TestClient) -> None:
    for i in range(5):
        r = client.post(
            "/auth/register",
            json={"email": f"u{i}@test.es", "password": "pass1234"},
            headers={"X-Forwarded-For": "9.9.9.9"},
        )
        assert r.status_code == 201, f"registro {i}"

    r = client.post(
        "/auth/register",
        json={"email": "u5@test.es", "password": "pass1234"},
        headers={"X-Forwarded-For": "9.9.9.9"},
    )
    assert r.status_code == 429

    # Otra IP no queda afectada.
    r = client.post(
        "/auth/register",
        json={"email": "otro@test.es", "password": "pass1234"},
        headers={"X-Forwarded-For": "8.8.8.8"},
    )
    assert r.status_code == 201


# --------------------------------------------------------------------------
# /train — concurrencia
# --------------------------------------------------------------------------


def _token_y_user_id(client: TestClient, session: Session) -> tuple[str, int]:
    r = client.post("/auth/register", json=CREDENCIALES)
    token = r.json()["access_token"]
    user = session.exec(select(User).where(User.email == CREDENCIALES["email"])).first()
    return token, user.id


def _patch_training(monkeypatch, session: Session) -> None:
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


def test_train_rechaza_un_segundo_job_concurrente(
    client: TestClient, session: Session, monkeypatch
) -> None:
    """Con un job vivo, otro POST /train devuelve 429 en lugar de encolarse."""
    _patch_training(monkeypatch, session)
    token, user_id = _token_y_user_id(client, session)

    # El TestClient ejecuta las background tasks al terminar la petición, así que
    # un job real acabaría antes de poder lanzar el segundo. Se inyecta uno vivo.
    _set_job("job-en-curso", status="running", user_id=user_id, monotonic=0.0)

    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre"], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 429
    assert "en curso" in r.json()["detail"]


def test_train_permite_otro_job_cuando_el_anterior_termino(
    client: TestClient, session: Session, monkeypatch
) -> None:
    _patch_training(monkeypatch, session)
    token, user_id = _token_y_user_id(client, session)

    _set_job("job-terminado", status="done", user_id=user_id, monotonic=0.0)

    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre"], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 202


def test_train_no_bloquea_a_otro_usuario(
    client: TestClient, session: Session, monkeypatch
) -> None:
    """El límite es por usuario, no global: un job ajeno no debe frenarme."""
    _patch_training(monkeypatch, session)
    token, _ = _token_y_user_id(client, session)

    _set_job("job-de-otro", status="running", user_id=99999, monotonic=0.0)

    r = client.post(
        "/train",
        json={"features": ["elo_diff_pre"], "algorithm": "lr"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 202
