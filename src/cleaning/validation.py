import pandas as pd
from typing import List, Optional, Dict, Tuple

class DataValidator:
    """
    Componente centralizado de cálculos de integridad para pipelines de datos espaciales y analíticos.
    Esta clase es agnóstica a la presentación visual. Devuelve valores calculados para que los
    Notebooks puedan decidir cómo formatearlos y mostrarlos.
    """

    @staticmethod
    def get_shape_check(df: pd.DataFrame, expected_rows: Optional[int] = None, expected_cols: Optional[int] = None) -> Tuple[bool, int, int]:
        """Devuelve si las dimensiones coinciden y el actual shape (is_valid, rows, cols)."""
        valid = True
        if expected_rows is not None and len(df) != expected_rows: valid = False
        if expected_cols is not None and len(df.columns) != expected_cols: valid = False
        return valid, len(df), len(df.columns)

    @staticmethod
    def get_duplicates_count(df: pd.DataFrame, key_col: Optional[str] = None) -> int:
        """Devuelve la cantidad de duplicados en el índice o en una columna específica."""
        if key_col:
            return df[key_col].duplicated().sum() if key_col in df.columns else 0
        return df.index.duplicated().sum()

    @staticmethod
    def get_nulls_dict(df: pd.DataFrame, allow_cols: Optional[List[str]] = None) -> Dict[str, int]:
        """Devuelve un diccionario {columna: num_nulos} ignorando columnas excluidas."""
        target_df = df.drop(columns=allow_cols) if allow_cols else df
        nulls = target_df.isnull().sum()
        return nulls[nulls > 0].to_dict()

    @staticmethod
    def get_negatives_dict(df: pd.DataFrame) -> Dict[str, int]:
        """Devuelve un diccionario {columna: num_negativos} para variables numéricas."""
        return {col: n for col in df.select_dtypes("number").columns if (n := (df[col] < 0).sum()) > 0}

    @staticmethod
    def get_outliers_count(df: pd.DataFrame, cols: List[str], max_threshold: float) -> int:
        """Devuelve cuántos valores superan el umbral establecido en las columnas pasadas."""
        outliers = 0
        for col in cols:
            if col in df.columns:
                outliers += (df[col] > max_threshold).sum()
        return outliers

    @staticmethod
    def get_invalid_categories(df: pd.DataFrame, col: str, valid_values: set) -> set:
        """Devuelve el set de valores encontrados que no pertenecen al conjunto de valores válidos."""
        if col not in df.columns: return set()
        return set(df[col].dropna().unique()) - set(valid_values)

    @staticmethod
    def get_drift_columns(df: pd.DataFrame, groupby_col: str) -> List[str]:
        """Devuelve una lista de columnas cuyos tipos de datos (dtypes) varían a lo largo de un agrupador (ej: season)."""
        # Protegemos el caso del MultiIndex
        g = df.groupby(level=groupby_col) if groupby_col in getattr(df.index, 'names', []) else df.groupby(groupby_col)
        drift = g.apply(lambda x: x.dtypes).nunique()
        return drift[drift > 1].index.tolist()

    @staticmethod
    def get_false_conditions(df: pd.DataFrame, col: str) -> int:
        """Devuelve el sumatorio de veces que una columna booleana es Falsa."""
        return (~df[col]).sum() if col in df.columns else 0

    @staticmethod
    def get_join_integrity_check(df_base: pd.DataFrame, df_merged: pd.DataFrame, groupby_col: str, sum_cols: List[str] = ["FTHG", "FTAG"]) -> Dict[str, Tuple[str, int, int]]:
        """
        Garantiza que un Left Join no haya duplicado filas internamente (Cartesian Explosion).
        Compara la suma agregada de columnas de control antes y después del Join usando GroupBy.
        Retorna {Grupo: (Status, suma_df_merged, suma_df_base)}
        """
        base_sums = df_base.groupby(groupby_col)[sum_cols].sum().sum(axis=1)
        merged_sums = df_merged.groupby(groupby_col)[sum_cols].sum().sum(axis=1)
        
        results = {}
        for group in sorted(df_merged[groupby_col].unique()):
            g_base = int(base_sums.get(group, 0))
            g_merged = int(merged_sums.get(group, 0))
            match = "OK" if g_base == g_merged else "DIFF"
            results[str(group)] = (match, g_merged, g_base)
            
        return results

    @staticmethod
    def get_goals_cross_check(df_xg: pd.DataFrame, df_core: pd.DataFrame, mapping: Dict[str, str], goals_xg: List[str] = ["home_goals", "away_goals"], goals_core: List[str] = ["FTHG", "FTAG"]) -> Dict[str, Tuple[str, int, int]]:
        """
        Realiza el cruce estadístico de goles entre el Core y xG usando un mapping de ligas.
        Retorna {Liga: (Status, goles_xg, goles_core)}
        """
        results = {}
        for lg_us, lg_core in mapping.items():
            # Si df_xg tiene liga en un MultiIndex
            g_xg = df_xg.loc[lg_us][goals_xg].sum().sum() if lg_us in df_xg.index.get_level_values("league") else 0
            g_core = df_core[df_core["League"] == lg_core][goals_core].sum().sum()
            
            match = "OK" if g_xg == g_core else "DIFF"
            results[lg_us] = (match, int(g_xg), int(g_core))
            
        return results


