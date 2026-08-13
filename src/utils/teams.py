"""Utilidades de presentación de equipos: slug, ruta del escudo y nombre completo.

Fuente única de verdad para los tres. `seed_equipos` las usa al poblar la BD y
los scripts de `scripts/` las reutilizan, de modo que un despliegue desde cero
deja `crest_url` y `display_name` ya rellenos sin ningún paso manual.
"""

import json
import re
from functools import lru_cache
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_DISPLAY_NAMES_FILE = _ROOT / "config" / "team_display_names.json"


def slug_equipo(name: str) -> str:
    """Convierte el nombre de un equipo en su slug de fichero.

    El slug es determinista y sin estado: 'Ath Bilbao' → 'ath-bilbao',
    "Nott'm Forest" → 'nottm-forest'. Los apóstrofos se eliminan (no se
    convierten en guion) para que coincidan con los PNG ya descargados.
    """
    s = name.lower()
    s = re.sub(r"['\"]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def crest_url_equipo(name: str) -> str:
    """Ruta pública del escudo de un equipo, servida por el frontend.

    Derivada del nombre, sin tocar disco: no depende de que exista la carpeta
    `frontend/public/crests`, que no está en la imagen de la API. Si el PNG
    faltara, el componente `<Crest>` del frontend cae a las iniciales.
    """
    return f"/crests/{slug_equipo(name)}.png"


@lru_cache(maxsize=1)
def display_names() -> dict[str, str]:
    """Mapa {nombre-dataset: nombre completo} leído de config/.

    Cacheado: el fichero es estático y el seed lo consulta 93 veces.
    """
    with _DISPLAY_NAMES_FILE.open(encoding="utf-8") as fh:
        return json.load(fh)


def display_name_equipo(name: str) -> str:
    """Nombre completo de un equipo; el propio nombre si no está mapeado."""
    return display_names().get(name, name)
