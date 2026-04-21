"""
Mueve y renombra CSVs de football-data.co.uk a su ubicación en el proyecto.

Destino: data/raw/<league>/<league>_<start>_<end>_raw.csv

Uso:
    python load_raw.py                      # todo el directorio actual
    python load_raw.py ~/Downloads          # toda la carpeta externa
    python load_raw.py example.csv          # sólo uno o varios archivos concretos

Config: config/leagues.json
"""

import csv
import json
import sys
from pathlib import Path


CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "leagues.json"
DATA_DIR = Path(__file__).parent.parent.parent / "data" / "raw"
PROJECT_ROOT = Path(__file__).parent.parent.parent


def load_leagues(config_path: Path) -> dict:
    """Carga el mapeo de codigos Div a nombres de liga desde el JSON de configuración."""
    if not config_path.exists():
        raise FileNotFoundError(f"Configuracion no encontrada: {config_path}")
    with config_path.open(encoding="utf-8") as f:
        return json.load(f)


def read_first_row(csv_path: Path) -> dict:
    """Lee y devuelve la primera fila de datos de un CSV como diccionario."""
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            return row
    return {}


def infer_season(date_str: str) -> tuple:
    """
    Infiere la temporada a partir de una fecha.
    Formatos soportados: dd/mm/aa, dd/mm/aaaa, aaaa-mm-dd.
    Si el mes es agosto o posterior, la temporada empieza ese año.
    Devuelve (season_start, season_end).
    """
    date_str = date_str.strip()

    if "/" in date_str:
        day, month, year = date_str.split("/")
        if len(year) == 2:
            year = ("19" if int(year) >= 90 else "20") + year
    elif "-" in date_str:
        year, month, day = date_str.split("-")
    else:
        raise ValueError(f"Formato de fecha no reconocido: {date_str}")

    month, year = int(month), int(year)

    if month >= 8:
        return year, year + 1
    else:
        return year - 1, year


def resolve_files(paths: list) -> list:
    """
    Recibe una lista de rutas (archivos o carpetas) y devuelve
    todos los CSVs encontrados, sin duplicados.
    """
    files = []
    seen = set()

    for path in paths:
        p = Path(path).expanduser().resolve()

        if p.is_dir():
            candidates = sorted(p.glob("*.csv"))
        elif p.is_file() and p.suffix == ".csv":
            candidates = [p]
        else:
            print(f"Ruta no valida o sin CSVs: {path}")
            continue

        for c in candidates:
            if c not in seen:
                seen.add(c)
                files.append(c)

    return files


def process(csv_path: Path, leagues: dict) -> None:
    """Procesa un CSV individual: infiere liga y temporada, y lo mueve o renombra."""
    filename = csv_path.name

    parts = filename.replace("_raw.csv", "").split("_")
    if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
        print(f"Ya procesado, omitiendo: {filename}")
        return

    row = read_first_row(csv_path)
    if not row:
        print(f"Archivo vacio o ilegible: {filename}")
        return

    div_code = row.get("Div", "").strip()
    if not div_code:
        print(f"Columna 'Div' no encontrada: {filename}")
        return

    league = leagues.get(div_code)
    if not league:
        print(
            f"Codigo '{div_code}' no esta en leagues.json, añadelo y reintenta: {filename}"
        )
        return

    date_str = row.get("Date", "").strip()
    if not date_str:
        print(f"Columna 'Date' no encontrada: {filename}")
        return

    try:
        season_start, season_end = infer_season(date_str)
    except ValueError as e:
        print(f"Error de fecha en {filename}: {e}")
        return

    end_short = str(season_end)[-2:]
    new_name = f"{league}_{season_start}_{end_short}_raw.csv"

    dest_dir = DATA_DIR / league
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / new_name

    if dest_file.exists():
        print(f"Ya existe, omitiendo: data/raw/{league}/{new_name}")
        return

    action = "renombrado" if csv_path.is_relative_to(PROJECT_ROOT) else "movido"
    csv_path.rename(dest_file)
    print(f"{action}: {filename} -> {dest_file.relative_to(PROJECT_ROOT.parent)}")


def main():
    inputs = sys.argv[1:] if len(sys.argv) > 1 else ["."]

    try:
        leagues = load_leagues(CONFIG_PATH)
    except FileNotFoundError as e:
        print(e)
        sys.exit(1)

    files = resolve_files(inputs)

    if not files:
        print("No se encontraron CSVs.")
        sys.exit(0)

    for csv_path in files:
        process(csv_path, leagues)

    print("\nIngest completado.")


if __name__ == "__main__":
    main()
