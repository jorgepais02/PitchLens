"""
Mueve y renombra CSVs de football-data.co.uk a su ubicación en el proyecto.

Destino: data/raw/<liga>/<liga>_<inicio>_<fin>_raw.csv

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


def cargar_ligas(config_path: Path) -> dict:
    """Carga el mapeo de codigos Div a nombres de liga desde el JSON de configuración."""
    if not config_path.exists():
        raise FileNotFoundError(f"Configuracion no encontrada: {config_path}")
    with config_path.open(encoding="utf-8") as f:
        return json.load(f)


def leer_primera_fila(csv_path: Path) -> dict:
    """Lee y devuelve la primera fila de datos de un CSV como diccionario."""
    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            return row
    return {}


def inferir_temporada(date_str: str) -> tuple:
    """
    Infiere la temporada a partir de una fecha.
    Formatos soportados: dd/mm/aa, dd/mm/aaaa, aaaa-mm-dd.
    Si el mes es agosto o posterior, la temporada empieza ese año.
    Devuelve (temporada_inicio, temporada_fin).
    """
    date_str = date_str.strip()

    if "/" in date_str:
        day, month, year = date_str.split("/")
        if len(year) == 2:
            year = ("19" if int(year) > 25 else "20") + year
    elif "-" in date_str:
        year, month, day = date_str.split("-")
    else:
        raise ValueError(f"Formato de fecha no reconocido: {date_str}")

    month, year = int(month), int(year)

    if month >= 8:
        return year, year + 1
    else:
        return year - 1, year


def resolver_archivos(rutas: list) -> list:
    """
    Recibe una lista de rutas (archivos o carpetas) y devuelve
    todos los CSVs encontrados, sin duplicados.
    """
    archivos = []
    vistos = set()

    for ruta in rutas:
        path = Path(ruta).expanduser().resolve()

        if path.is_dir():
            candidatos = sorted(path.glob("*.csv"))
        elif path.is_file() and path.suffix == ".csv":
            candidatos = [path]
        else:
            print(f"Ruta no valida o sin CSVs: {ruta}")
            continue

        for c in candidatos:
            if c not in vistos:
                vistos.add(c)
                archivos.append(c)

    return archivos


def procesar(csv_path: Path, ligas: dict) -> None:
    """Procesa un CSV individual: infiere liga y temporada, y lo mueve o renombra."""
    filename = csv_path.name

    parts = filename.replace("_raw.csv", "").split("_")
    if len(parts) == 3 and parts[1].isdigit() and parts[2].isdigit():
        print(f"Ya procesado, omitiendo: {filename}")
        return

    row = leer_primera_fila(csv_path)
    if not row:
        print(f"Archivo vacio o ilegible: {filename}")
        return

    div_code = row.get("Div", "").strip()
    if not div_code:
        print(f"Columna 'Div' no encontrada: {filename}")
        return

    liga = ligas.get(div_code)
    if not liga:
        print(
            f"Codigo '{div_code}' no esta en leagues.json, añadelo y reintenta: {filename}"
        )
        return

    date_str = row.get("Date", "").strip()
    if not date_str:
        print(f"Columna 'Date' no encontrada: {filename}")
        return

    try:
        temporada_inicio, temporada_fin = inferir_temporada(date_str)
    except ValueError as e:
        print(f"Error de fecha en {filename}: {e}")
        return

    fin_corto = str(temporada_fin)[-2:]
    nuevo_nombre = f"{liga}_{temporada_inicio}_{fin_corto}_raw.csv"

    dest_dir = DATA_DIR / liga
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_file = dest_dir / nuevo_nombre

    if dest_file.exists():
        print(f"Ya existe, omitiendo: data/raw/{liga}/{nuevo_nombre}")
        return

    accion = "renombrado" if csv_path.is_relative_to(PROJECT_ROOT) else "movido"
    csv_path.rename(dest_file)
    print(f"{accion}: {filename} -> {dest_file.relative_to(PROJECT_ROOT.parent)}")


def main():
    entradas = sys.argv[1:] if len(sys.argv) > 1 else ["."]

    try:
        ligas = cargar_ligas(CONFIG_PATH)
    except FileNotFoundError as e:
        print(e)
        sys.exit(1)

    archivos = resolver_archivos(entradas)

    if not archivos:
        print("No se encontraron CSVs.")
        sys.exit(0)

    for csv_path in archivos:
        procesar(csv_path, ligas)

    print("\nIngest completado.")


if __name__ == "__main__":
    main()
