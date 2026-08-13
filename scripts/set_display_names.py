"""Popula display_name en la tabla teams con el nombre completo de cada equipo.

Uso:
    python scripts/set_display_names.py
"""

import logging
import sys
from pathlib import Path

from sqlalchemy import text
from sqlmodel import Session, select

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.db.database import engine
from src.db.models import Team
from src.utils.teams import display_names

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# El mapa vive en config/team_display_names.json — misma fuente que usa el
# seed (src/db/etl.py), para que no puedan divergir.
DISPLAY_NAMES: dict[str, str] = display_names()


def main() -> None:
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE teams ADD COLUMN IF NOT EXISTS display_name VARCHAR(120)"
        ))
        conn.commit()
    log.info("Columna display_name OK")

    with Session(engine) as session:
        teams: list[Team] = list(session.exec(select(Team)).all())

    ok = 0
    missing = []
    for team in teams:
        display = DISPLAY_NAMES.get(team.name)
        if not display:
            missing.append(team.name)
            continue
        with Session(engine) as s:
            db_team = s.get(Team, team.id)
            if db_team:
                db_team.display_name = display
                s.add(db_team)
                s.commit()
        ok += 1

    log.info("Actualizados: %d / %d", ok, len(teams))
    if missing:
        log.warning("Sin mapeo: %s", missing)


if __name__ == "__main__":
    main()
