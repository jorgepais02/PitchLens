"""
Funciones de validación de integridad para pipelines de datos.
Devuelven valores, no imprimen.
"""

import pandas as pd


def get_shape_check(
    df: pd.DataFrame,
    expected_rows: int | None = None,
    expected_cols: int | None = None,
) -> tuple[bool, int, int]:
    """Devuelve si las dimensiones coinciden y el shape actual (is_valid, rows, cols)."""
    valid = True
    if expected_rows is not None and len(df) != expected_rows:
        valid = False
    if expected_cols is not None and len(df.columns) != expected_cols:
        valid = False
    return valid, len(df), len(df.columns)


def get_duplicates_count(df: pd.DataFrame, key_col: str | None = None) -> int:
    """Devuelve la cantidad de duplicados en el índice o en una columna específica."""
    if key_col:
        return df[key_col].duplicated().sum() if key_col in df else 0
    return df.index.duplicated().sum()


def get_nulls_dict(
    df: pd.DataFrame, allow_cols: list[str] | None = None
) -> dict[str, int]:
    """Devuelve {columna: num_nulos} ignorando columnas excluidas."""
    target_df = df.drop(columns=allow_cols) if allow_cols else df
    nulls = target_df.isnull().sum()
    return nulls[nulls > 0].to_dict()


def get_negatives_dict(df: pd.DataFrame) -> dict[str, int]:
    """Devuelve {columna: num_negativos} para variables numéricas."""
    return {
        col: n
        for col in df.select_dtypes("number").columns
        if (n := (df[col] < 0).sum()) > 0
    }


def get_outliers_count(df: pd.DataFrame, cols: list[str], max_threshold: float) -> int:
    """Devuelve cuántos valores superan el umbral en las columnas indicadas."""
    return sum((df[col] > max_threshold).sum() for col in cols if col in df)


def get_invalid_categories(df: pd.DataFrame, col: str, valid_values: set) -> set:
    """Devuelve el set de valores que no pertenecen al conjunto válido."""
    if col not in df:
        return set()
    return set(df[col].dropna().unique()) - set(valid_values)


def get_drift_columns(df: pd.DataFrame, groupby_col: str) -> list[str]:
    """Devuelve columnas cuyos dtypes varían entre grupos del agrupador (ej: season)."""
    if groupby_col in getattr(df.index, "names", []):
        groups = [
            df.xs(key, level=groupby_col)
            for key in df.index.get_level_values(groupby_col).unique()
        ]
    else:
        groups = [group for _, group in df.groupby(groupby_col)]

    dtype_sets: dict[str, set] = {}
    for group in groups:
        for col, dtype in group.dtypes.items():
            dtype_sets.setdefault(col, set()).add(str(dtype))

    return [col for col, types in dtype_sets.items() if len(types) > 1]


def get_false_conditions(df: pd.DataFrame, col: str) -> int:
    """Devuelve el número de veces que una columna booleana es False."""
    if col not in df:
        return 0
    return (~df[col]).sum()


def get_join_integrity_check(
    df_base: pd.DataFrame,
    df_merged: pd.DataFrame,
    groupby_col: str,
    sum_cols: list[str] | None = None,
) -> dict[str, tuple[str, int, int]]:
    """Garantiza que un Left Join no haya duplicado filas (Cartesian Explosion).

    Compara sumas agregadas antes y después del join por grupo.
    Retorna {Grupo: (Status, suma_df_merged, suma_df_base)}. Por defecto sum_cols=["FTHG", "FTAG"].
    """
    if sum_cols is None:
        sum_cols = ["FTHG", "FTAG"]
    base_sums = df_base.groupby(groupby_col)[sum_cols].sum().sum(axis=1)
    merged_sums = df_merged.groupby(groupby_col)[sum_cols].sum().sum(axis=1)

    results = {}
    for group in sorted(df_merged[groupby_col].unique()):
        g_base = int(base_sums.get(group, 0))
        g_merged = int(merged_sums.get(group, 0))
        status = "OK" if g_base == g_merged else "DIFF"
        results[str(group)] = (status, g_merged, g_base)

    return results


def get_goals_cross_check(
    df_xg: pd.DataFrame,
    df_core: pd.DataFrame,
    mapping: dict[str, str],
    goals_xg: list[str] | None = None,
    goals_core: list[str] | None = None,
) -> dict[str, tuple[str, int, int]]:
    """Cruce estadístico de goles entre Core y xG usando un mapping de ligas.

    Retorna {Liga: (Status, goles_xg, goles_core)}. Por defecto goals_xg=["home_goals","away_goals"],
    goals_core=["FTHG","FTAG"].
    """
    if goals_xg is None:
        goals_xg = ["home_goals", "away_goals"]
    if goals_core is None:
        goals_core = ["FTHG", "FTAG"]

    results = {}
    for lg_us, lg_core in mapping.items():
        g_xg = (
            df_xg.loc[lg_us][goals_xg].sum().sum()
            if lg_us in df_xg.index.get_level_values("league")
            else 0
        )
        g_core = df_core[df_core["League"] == lg_core][goals_core].sum().sum()
        status = "OK" if g_xg == g_core else "DIFF"
        results[lg_us] = (status, int(g_xg), int(g_core))

    return results
