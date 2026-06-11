"""Descarga escudos de los 93 equipos del dataset desde TheSportsDB
y los guarda en frontend/public/crests/.
Luego aplica la migración de columna y actualiza crest_url en la BD.

Uso:
    python scripts/fetch_crests.py [--dry-run]
"""

import argparse
import logging
import re
import sys
import time
import urllib.request
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db.database import engine
from src.db.models import Team

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

_ROOT = Path(__file__).resolve().parents[1]
_CRESTS_DIR = _ROOT / "frontend" / "public" / "crests"

# TheSportsDB API v1 (key "3" = free)
_TSDB_URL = "https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t={}"

# Mapeo nombre-dataset → término de búsqueda en TheSportsDB
ALIASES: dict[str, str] = {
    "Ath Bilbao":        "Athletic Club Bilbao",
    "Ath Madrid":        "Atletico Madrid",
    "Betis":             "Real Betis",
    "Cadiz":             "Cadiz CF",
    "Celta":             "Celta Vigo",
    "Cordoba":           "Cordoba CF",
    "Dortmund":          "Borussia Dortmund",
    "Ein Frankfurt":     "Eintracht Frankfurt",
    "Espanol":           "Espanyol",
    "FC Koln":           "FC Koln",
    "Fortuna Dusseldorf": "Fortuna Dusseldorf",
    "Greuther Furth":    "Greuther Furth",
    "Hoffenheim":        "TSG Hoffenheim",
    "Huesca":            "SD Huesca",
    "La Coruna":         "Deportivo La Coruna",
    "Las Palmas":        "Las Palmas",
    "Leganes":           "CD Leganes",
    "Leverkusen":        "Bayer Leverkusen",
    "Levante":           "Levante UD",
    "M'gladbach":        "Borussia Monchengladbach",
    "Malaga":            "Malaga CF",
    "Mallorca":          "RCD Mallorca",
    "Man City":          "Manchester City",
    "Man United":        "Manchester United",
    "Nott'm Forest":     "Nottingham Forest",
    "Nurnberg":          "FC Nurnberg",
    "Osasuna":           "CA Osasuna",
    "QPR":               "Queens Park Rangers",
    "RB Leipzig":        "RB Leipzig",
    "Schalke 04":        "Schalke 04",
    "Sociedad":          "Real Sociedad",
    "Sp Gijon":          "Sporting Gijon",
    "Vallecano":         "Rayo Vallecano",
    "West Brom":         "West Bromwich Albion",
}


def _slug(name: str) -> str:
    """Convierte nombre de equipo a slug de fichero."""
    s = name.lower()
    s = re.sub(r"['\"]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _fetch_badge_url(search_term: str) -> str | None:
    """Llama a TheSportsDB y devuelve la URL del badge, o None si no encuentra."""
    import json

    url = _TSDB_URL.format(urllib.parse.quote(search_term))
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "football-analytics-tfg/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        log.warning("Error fetching %s: %s", search_term, exc)
        return None

    teams = data.get("teams") or []
    if not teams:
        return None
    return teams[0].get("strBadge") or teams[0].get("strTeamBadge")


def _download(badge_url: str, dest: Path) -> bool:
    """Descarga badge_url a dest. Devuelve True si éxito."""
    try:
        req = urllib.request.Request(badge_url, headers={"User-Agent": "football-analytics-tfg/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            dest.write_bytes(resp.read())
        return True
    except Exception as exc:
        log.warning("Error downloading %s: %s", badge_url, exc)
        return False


def _migrate_column() -> None:
    """Añade crest_url a teams si no existe."""
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE teams ADD COLUMN IF NOT EXISTS crest_url VARCHAR(200)"
        ))
        conn.commit()
    log.info("Columna crest_url OK")


def main(dry_run: bool) -> None:
    import urllib.parse  # noqa: F401 — importado aquí para que _fetch_badge_url lo vea

    _CRESTS_DIR.mkdir(parents=True, exist_ok=True)
    _migrate_column()

    with Session(engine) as session:
        teams: list[Team] = list(session.exec(select(Team)).all())

    log.info("Procesando %d equipos...", len(teams))
    ok = 0
    skip = 0
    fail = 0

    for team in teams:
        search = ALIASES.get(team.name, team.name)
        slug = _slug(team.name)
        dest = _CRESTS_DIR / f"{slug}.png"
        crest_path = f"/crests/{slug}.png"

        if dest.exists():
            log.info("  ✓ ya existe  %s", team.name)
            if not dry_run:
                with Session(engine) as s:
                    db_team = s.get(Team, team.id)
                    if db_team:
                        db_team.crest_url = crest_path
                        s.add(db_team)
                        s.commit()
            ok += 1
            continue  # sin sleep — fichero local

        badge_url = _fetch_badge_url(search)
        if not badge_url:
            log.warning("  ✗ no encontrado %s (búsqueda: %s)", team.name, search)
            fail += 1
            time.sleep(0.3)
            continue

        if dry_run:
            log.info("  [dry] %s → %s", team.name, badge_url)
            ok += 1
        else:
            if _download(badge_url, dest):
                with Session(engine) as s:
                    db_team = s.get(Team, team.id)
                    if db_team:
                        db_team.crest_url = crest_path
                        s.add(db_team)
                        s.commit()
                log.info("  ✓ %s", team.name)
                ok += 1
            else:
                fail += 1

        time.sleep(1.5)  # respetar rate limit TheSportsDB free tier

    log.info("Listo: %d OK  |  %d skip  |  %d fallos", ok, skip, fail)
    if fail:
        log.warning("Equipos sin escudo: revisar aliases en ALIASES dict")


if __name__ == "__main__":
    import urllib.parse

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Solo muestra URLs, no descarga")
    args = parser.parse_args()
    main(dry_run=args.dry_run)
