"""Verifica el slug, la ruta de escudo y el nombre completo de los equipos.

Blinda la invariante que hizo falta arreglar en producción: todo equipo del
dataset tiene que resolver a un PNG que existe en frontend/public/crests y a un
nombre completo del catálogo, sin pasos manuales tras el seed.
"""

from pathlib import Path

import pandas as pd
import pytest

from src.utils.teams import (
    crest_url_equipo,
    display_name_equipo,
    display_names,
    slug_equipo,
)

_ROOT = Path(__file__).resolve().parents[1]
_CRESTS_DIR = _ROOT / "frontend" / "public" / "crests"
_ENRICHED = _ROOT / "data" / "processed" / "enriched" / "core_enriched.parquet"

_EXPECTED_TEAMS = 93


@pytest.fixture(scope="module")
def nombres_equipos() -> list[str]:
    """Los 93 nombres únicos de equipo del dataset enriquecido."""
    if not _ENRICHED.exists():
        pytest.skip(f"falta {_ENRICHED}")
    df = pd.read_parquet(_ENRICHED, columns=["HomeTeam", "AwayTeam"])
    nombres = sorted(set(df["HomeTeam"]) | set(df["AwayTeam"]))
    assert len(nombres) == _EXPECTED_TEAMS
    return nombres


@pytest.mark.parametrize(
    ("nombre", "esperado"),
    [
        ("Ath Bilbao", "ath-bilbao"),
        ("Nott'm Forest", "nottm-forest"),   # el apóstrofo se elimina, no separa
        ("M'gladbach", "mgladbach"),
        ("RB Leipzig", "rb-leipzig"),
        ("Schalke 04", "schalke-04"),
    ],
)
def test_slug_casos_dificiles(nombre: str, esperado: str) -> None:
    """El slug trata apóstrofos, espacios y dígitos como en los PNG ya descargados."""
    assert slug_equipo(nombre) == esperado


def test_crest_url_deriva_del_nombre() -> None:
    """crest_url_equipo no toca disco: es puro derivado del nombre."""
    assert crest_url_equipo("Ath Bilbao") == "/crests/ath-bilbao.png"


def test_todo_equipo_tiene_png(nombres_equipos: list[str]) -> None:
    """Cada equipo del dataset resuelve a un PNG que existe en el frontend."""
    if not _CRESTS_DIR.exists():
        pytest.skip(f"falta {_CRESTS_DIR}")
    faltan = [n for n in nombres_equipos if not (_CRESTS_DIR / f"{slug_equipo(n)}.png").exists()]
    assert not faltan, f"equipos sin escudo: {faltan}"


def test_no_hay_png_huerfanos(nombres_equipos: list[str]) -> None:
    """No sobran PNG: la carpeta y el dataset se corresponden 1 a 1."""
    if not _CRESTS_DIR.exists():
        pytest.skip(f"falta {_CRESTS_DIR}")
    esperados = {f"{slug_equipo(n)}.png" for n in nombres_equipos}
    presentes = {p.name for p in _CRESTS_DIR.glob("*.png")}
    assert presentes - esperados == set(), f"PNG huérfanos: {sorted(presentes - esperados)}"


def test_slugs_sin_colisiones(nombres_equipos: list[str]) -> None:
    """Dos equipos distintos nunca comparten slug — se pisarían el escudo."""
    slugs = [slug_equipo(n) for n in nombres_equipos]
    assert len(set(slugs)) == len(slugs)


def test_todo_equipo_tiene_display_name(nombres_equipos: list[str]) -> None:
    """El catálogo cubre los 93 equipos del dataset."""
    catalogo = display_names()
    faltan = [n for n in nombres_equipos if n not in catalogo]
    assert not faltan, f"equipos sin nombre completo: {faltan}"


def test_display_name_cae_al_nombre_si_no_mapeado() -> None:
    """Un equipo desconocido no rompe: devuelve su propio nombre."""
    assert display_name_equipo("Equipo Inventado") == "Equipo Inventado"


def test_catalogo_sin_entradas_muertas(nombres_equipos: list[str]) -> None:
    """El catálogo no arrastra equipos que ya no están en el dataset."""
    sobran = set(display_names()) - set(nombres_equipos)
    assert sobran == set(), f"entradas muertas en el catálogo: {sorted(sobran)}"
