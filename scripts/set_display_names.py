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

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

DISPLAY_NAMES: dict[str, str] = {
    # Bundesliga
    "Augsburg":           "FC Augsburg",
    "Bayern Munich":      "FC Bayern München",
    "Bielefeld":          "Arminia Bielefeld",
    "Bochum":             "VfL Bochum",
    "Darmstadt":          "SV Darmstadt 98",
    "Dortmund":           "Borussia Dortmund",
    "Ein Frankfurt":      "Eintracht Frankfurt",
    "FC Koln":            "1. FC Köln",
    "Fortuna Dusseldorf": "Fortuna Düsseldorf",
    "Freiburg":           "SC Freiburg",
    "Greuther Furth":     "SpVgg Greuther Fürth",
    "Hamburg":            "Hamburger SV",
    "Hannover":           "Hannover 96",
    "Heidenheim":         "1. FC Heidenheim",
    "Hertha":             "Hertha BSC",
    "Hoffenheim":         "TSG Hoffenheim",
    "Ingolstadt":         "FC Ingolstadt 04",
    "Leverkusen":         "Bayer 04 Leverkusen",
    "M'gladbach":         "Borussia Mönchengladbach",
    "Mainz":              "1. FSV Mainz 05",
    "Nurnberg":           "1. FC Nürnberg",
    "Paderborn":          "SC Paderborn 07",
    "RB Leipzig":         "RB Leipzig",
    "Schalke 04":         "FC Schalke 04",
    "Stuttgart":          "VfB Stuttgart",
    "Union Berlin":       "1. FC Union Berlin",
    "Werder Bremen":      "SV Werder Bremen",
    "Wolfsburg":          "VfL Wolfsburg",
    # La Liga
    "Alaves":             "Deportivo Alavés",
    "Almeria":            "UD Almería",
    "Ath Bilbao":         "Athletic Club",
    "Ath Madrid":         "Atlético de Madrid",
    "Barcelona":          "FC Barcelona",
    "Betis":              "Real Betis",
    "Cadiz":              "Cádiz CF",
    "Celta":              "RC Celta de Vigo",
    "Cordoba":            "Córdoba CF",
    "Eibar":              "SD Eibar",
    "Elche":              "Elche CF",
    "Espanol":            "RCD Espanyol",
    "Getafe":             "Getafe CF",
    "Girona":             "Girona FC",
    "Granada":            "Granada CF",
    "Huesca":             "SD Huesca",
    "La Coruna":          "RC Deportivo de La Coruña",
    "Las Palmas":         "UD Las Palmas",
    "Leganes":            "CD Leganés",
    "Levante":            "Levante UD",
    "Malaga":             "Málaga CF",
    "Mallorca":           "RCD Mallorca",
    "Osasuna":            "CA Osasuna",
    "Real Madrid":        "Real Madrid CF",
    "Sevilla":            "Sevilla FC",
    "Sociedad":           "Real Sociedad",
    "Sp Gijon":           "Sporting de Gijón",
    "Valencia":           "Valencia CF",
    "Valladolid":         "Real Valladolid",
    "Vallecano":          "Rayo Vallecano",
    "Villarreal":         "Villarreal CF",
    # Premier League
    "Arsenal":            "Arsenal FC",
    "Aston Villa":        "Aston Villa",
    "Bournemouth":        "AFC Bournemouth",
    "Brentford":          "Brentford FC",
    "Brighton":           "Brighton & Hove Albion",
    "Burnley":            "Burnley FC",
    "Cardiff":            "Cardiff City",
    "Chelsea":            "Chelsea FC",
    "Crystal Palace":     "Crystal Palace",
    "Everton":            "Everton FC",
    "Fulham":             "Fulham FC",
    "Huddersfield":       "Huddersfield Town",
    "Hull":               "Hull City",
    "Leeds":              "Leeds United",
    "Leicester":          "Leicester City",
    "Liverpool":          "Liverpool FC",
    "Luton":              "Luton Town",
    "Man City":           "Manchester City",
    "Man United":         "Manchester United",
    "Middlesbrough":      "Middlesbrough FC",
    "Newcastle":          "Newcastle United",
    "Norwich":            "Norwich City",
    "Nott'm Forest":      "Nottingham Forest",
    "QPR":                "Queens Park Rangers",
    "Sheffield United":   "Sheffield United",
    "Southampton":        "Southampton FC",
    "Stoke":              "Stoke City",
    "Sunderland":         "Sunderland AFC",
    "Swansea":            "Swansea City",
    "Tottenham":          "Tottenham Hotspur",
    "Watford":            "Watford FC",
    "West Brom":          "West Bromwich Albion",
    "West Ham":           "West Ham United",
    "Wolves":             "Wolverhampton Wanderers",
}


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
