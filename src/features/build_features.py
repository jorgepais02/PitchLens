from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

# ─── Parámetros globales ──────────────────────────────────────────────────────

WINDOW: int = 5  # Ventana rolling (últimos N partidos)
ELO_K: int = 20  # K-factor ELO (sensibilidad por partido)
ELO_BASE: int = 1500  # Rating inicial para todos los equipos

# Features con cold start real — producen NaN hasta acumular historial suficiente
# Se usan para el dropna en build_features y para check_leakage
FEATURES_ROLLING: list[str] = [
    "goal_diff_last5_global",
    "xg_diff_last5_global",
    "xg_conceded_diff_last5_global",
    "sot_diff_last5_global",
    "goal_diff_last5_venue",
    "venue_win_rate_diff",
    "rest_days_diff",
]

# Todas las features del ml_dataset
FEATURES: list[str] = [
    "elo_diff_pre",
    "points_diff_table",
    *FEATURES_ROLLING,
    "prob_diff_market",
]


def _build_team_view(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convierte el dataset de partidos en una vista por equipo.

    Cada partido genera dos filas — una por equipo local y otra por visitante.
    Base común para todas las features vectorizadas (rolling, clasificación, descanso).

    Devuelve un DataFrame con las columnas:
        match_id, Date, Season, League, team, is_home, gf, gc, xgf, xgc, sot, soc
    """
    cols_base = ["match_id", "Date", "Season", "League"]

    locales = df[
        cols_base + ["HomeTeam", "FTHG", "FTAG", "home_xg", "away_xg", "HST", "AST"]
    ].copy()
    locales = locales.rename(
        columns={
            "HomeTeam": "team",
            "FTHG": "gf",
            "FTAG": "gc",
            "home_xg": "xgf",
            "away_xg": "xgc",
            "HST": "sot",
            "AST": "soc",
        }
    )
    locales["is_home"] = 1

    visitantes = df[
        cols_base + ["AwayTeam", "FTAG", "FTHG", "away_xg", "home_xg", "AST", "HST"]
    ].copy()
    visitantes = visitantes.rename(
        columns={
            "AwayTeam": "team",
            "FTAG": "gf",
            "FTHG": "gc",
            "away_xg": "xgf",
            "home_xg": "xgc",
            "AST": "sot",
            "HST": "soc",
        }
    )
    visitantes["is_home"] = 0

    return (
        pd.concat([locales, visitantes], ignore_index=True)
        .sort_values(["League", "team", "Date"])
        .reset_index(drop=True)
    )


def compute_global_rolling(df: pd.DataFrame, window: int) -> pd.DataFrame:
    """
    Calcula rolling stats globales (sin distinción de localía) para cada equipo.

    Garantía anti-leakage: shift(1) desplaza el rolling un partido hacia adelante,
    garantizando que el valor de cada partido usa solo los `window` partidos anteriores.

    Devuelve un DataFrame indexado por match_id con las columnas:
        goal_diff_last5_global, xg_diff_last5_global,
        xg_conceded_diff_last5_global, sot_diff_last5_global
    """
    tv = _build_team_view(df)
    tv["gd"] = tv["gf"] - tv["gc"]
    tv["xgd"] = tv["xgf"] - tv["xgc"]
    grp = tv.groupby(["League", "team"])

    tv["gd_roll"] = grp["gd"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["xgd_roll"] = grp["xgd"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["xgc_roll"] = grp["xgc"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["sot_roll"] = grp["sot"].transform(lambda x: x.shift(1).rolling(window).mean())
    tv["soc_roll"] = grp["soc"].transform(lambda x: x.shift(1).rolling(window).mean())

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["goal_diff_last5_global"] = home["gd_roll"] - away["gd_roll"]
    result["xg_diff_last5_global"] = home["xgd_roll"] - away["xgd_roll"]
    result["xg_conceded_diff_last5_global"] = home["xgc_roll"] - away["xgc_roll"]
    result["sot_diff_last5_global"] = (home["sot_roll"] - home["soc_roll"]) - (
        away["sot_roll"] - away["soc_roll"]
    )

    return result


def compute_venue_rolling(df: pd.DataFrame, window: int) -> pd.DataFrame:
    """
    Calcula rolling stats separando localía.

    Local: últimos `window` partidos jugados en casa.
    Visitante: últimos `window` partidos jugados fuera.

    Garantía anti-leakage: shift(1) antes del rolling.

    Devuelve un DataFrame indexado por match_id con la columna:
        goal_diff_last5_venue
    """
    tv = _build_team_view(df)
    tv["gd"] = tv["gf"] - tv["gc"]
    grp = tv.groupby(["League", "team", "is_home"])

    tv["gd_venue_roll"] = grp["gd"].transform(
        lambda x: x.shift(1).rolling(window).mean()
    )

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["goal_diff_last5_venue"] = home["gd_venue_roll"] - away["gd_venue_roll"]

    return result


def compute_elo(df: pd.DataFrame, k: float, base: float) -> pd.DataFrame:
    """
    Calcula el rating ELO acumulado histórico partido a partido.

    La feature es elo_diff_pre = elo_local - elo_visitante antes de actualizar
    los ratings con el resultado del partido. Todos los equipos arrancan en `base`.

    Sin leakage por construcción: el valor pre-partido se registra antes de
    procesar el resultado. La actualización ocurre después del registro.

    Devuelve un DataFrame indexado por match_id con la columna:
        elo_diff_pre
    """
    elo: dict[str, float] = {}
    records = []

    for _, row in df.iterrows():
        local = row["HomeTeam"]
        visitante = row["AwayTeam"]
        ftr = row["FTR"]

        elo_h = elo.get(local, base)
        elo_a = elo.get(visitante, base)

        esperado_h = 1 / (1 + 10 ** ((elo_a - elo_h) / 400))
        resultado_h = 1.0 if ftr == "H" else (0.5 if ftr == "D" else 0.0)

        delta = k * (resultado_h - esperado_h)
        elo[local] = elo_h + delta
        elo[visitante] = elo_a - delta

        records.append(
            {
                "match_id": row["match_id"],
                "elo_diff_pre": elo_h - elo_a,
            }
        )

    return pd.DataFrame(records).set_index("match_id")


def compute_table_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula features de clasificación acumuladas en la temporada actual.

    Garantía anti-leakage: shift(1) sobre el cumsum garantiza que cada partido
    usa solo los puntos acumulados en partidos anteriores de la misma temporada y liga.

    Devuelve un DataFrame indexado por match_id con las columnas:
        points_diff_table, venue_win_rate_diff
    """
    tv = _build_team_view(df)

    ftr_map = df.set_index("match_id")[["FTR"]]
    tv = tv.join(ftr_map, on="match_id")

    tv["pts"] = np.where(
        tv["is_home"] == 1,
        tv["FTR"].map({"H": 3, "D": 1, "A": 0}),
        tv["FTR"].map({"H": 0, "D": 1, "A": 3}),
    )
    tv["win"] = np.where(
        tv["is_home"] == 1,
        (tv["FTR"] == "H").astype(int),
        (tv["FTR"] == "A").astype(int),
    )
    tv["jugado"] = 1

    grp = tv.groupby(["Season", "League", "team"])

    tv["pts_cum"] = grp["pts"].transform(lambda x: x.shift(1).cumsum().fillna(0))
    tv["wins_cum"] = grp["win"].transform(lambda x: x.shift(1).cumsum().fillna(0))
    tv["jugado_cum"] = grp["jugado"].transform(lambda x: x.shift(1).cumsum().fillna(0))

    tv["win_rate_venue"] = (
        tv["wins_cum"].div(tv["jugado_cum"]).where(tv["jugado_cum"] > 0, np.nan)
    )

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["points_diff_table"] = home["pts_cum"] - away["pts_cum"]
    result["venue_win_rate_diff"] = home["win_rate_venue"] - away["win_rate_venue"]

    return result


def compute_rest_days(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula la diferencia de días de descanso entre local y visitante.

    rest_days_diff = días_descanso_local - días_descanso_visitante
    Valores positivos indican que el local descansó más.
    Primer partido de temporada de un equipo → NaN.

    Garantía anti-leakage: diff() sobre fechas ordenadas dentro de la misma
    temporada y liga — nunca cruza temporadas.

    Devuelve un DataFrame indexado por match_id con la columna:
        rest_days_diff
    """
    tv = _build_team_view(df)
    grp = tv.groupby(["Season", "League", "team"])

    tv["rest_days"] = grp["Date"].transform(lambda x: x.diff().dt.days)

    home = tv[tv["is_home"] == 1].set_index("match_id")
    away = tv[tv["is_home"] == 0].set_index("match_id")

    result = pd.DataFrame(index=home.index)
    result["rest_days_diff"] = home["rest_days"] - away["rest_days"]

    return result


def compute_market_feature(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calcula la diferencia de probabilidad implícita del mercado normalizada
    por overround a partir de las cuotas Pinnacle (cierre).

    prob_diff_market = (1/PSH - 1/PSA) / overround
    donde overround = 1/PSH + 1/PSD + 1/PSA (margen típico Pinnacle: 1.02-1.03)

    Pinnacle se usa como fuente principal por su menor margen y mayor eficiencia
    informacional frente a casas recreacionales. Sin leakage por definición:
    las cuotas son información publicada antes del partido.

    Devuelve un DataFrame indexado por match_id con la columna:
        prob_diff_market
    """
    p_h = 1 / df["PSH"]
    p_d = 1 / df["PSD"]
    p_a = 1 / df["PSA"]

    overround = p_h + p_d + p_a
    prob_diff_market = (p_h / overround) - (p_a / overround)

    return pd.DataFrame(
        {"prob_diff_market": prob_diff_market.values},
        index=df["match_id"],
    )


def check_leakage(df_features: pd.DataFrame, df_original: pd.DataFrame) -> None:
    """
    Verifica ausencia de leakage temporal en el dataset de features.

    Comprueba que el primer partido absoluto de cada equipo tiene NaN en todas
    las features rolling. ELO y prob_diff_market se excluyen del check —
    ELO arranca en base por diseño y el mercado no tiene cold start.

    Lanza AssertionError con el nombre de las columnas afectadas si hay leakage.

    Parámetros
    ----------
    df_features : pd.DataFrame
        Dataset de features con columna match_id.
    df_original : pd.DataFrame
        Dataset core_enriched original (para recuperar fechas y equipos).
    """
    first_match_ids = (
        pd.concat(
            [
                df_original[["HomeTeam", "Date"]].rename(columns={"HomeTeam": "team"}),
                df_original[["AwayTeam", "Date"]].rename(columns={"AwayTeam": "team"}),
            ]
        )
        .groupby("team")["Date"]
        .min()
        .reset_index()
    )
    first_match_ids["match_id"] = first_match_ids.apply(
        lambda r: df_original[
            (
                (df_original["HomeTeam"] == r["team"])
                | (df_original["AwayTeam"] == r["team"])
            )
            & (df_original["Date"] == r["Date"])
        ]["match_id"].values[0],
        axis=1,
    )

    cols_rolling = [c for c in df_features.columns if c in FEATURES_ROLLING]

    vals = df_features.set_index("match_id").loc[
        first_match_ids["match_id"], cols_rolling
    ]
    leakage_cols = vals.columns[~vals.isna().all()].tolist()

    assert not leakage_cols, f"⚠ Leakage detectado en columnas: {leakage_cols}"


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Pipeline completo de feature engineering sobre core_enriched.

    Pasos:
        1. Ordenar cronológicamente (imprescindible para rolling sin leakage).
        2. Calcular cada bloque de features de forma independiente.
        3. Unir todos los bloques por match_id.
        4. Verificar ausencia de leakage.
        5. Eliminar filas cold start (NaN en cualquiera de las 9 features base).

    Garantía anti-leakage: shift(1) en todos los bloques vectorizados.
    ELO: valor pre-partido por construcción.
    Verificar tras la llamada: corr(features, ftr).abs().max() < 0.99

    Parámetros
    ----------
    df : pd.DataFrame
        Dataset core_enriched (10.660 × 35). Debe contener las columnas:
        match_id, Date, HomeTeam, AwayTeam, League, Season, FTR,
        FTHG, FTAG, HST, AST, home_xg, away_xg, PSH, PSD, PSA.

    Devuelve
    --------
    pd.DataFrame
        ml_dataset con columnas: match_id, League, Season, Date, HomeTeam,
        AwayTeam, ftr + 9 features base + prob_diff_market.
        Filas cold start eliminadas. Cero nulos en features base.
    """
    df = df.sort_values("Date").reset_index(drop=True)

    df_elo = compute_elo(df, ELO_K, ELO_BASE)
    df_global = compute_global_rolling(df, WINDOW)
    df_venue = compute_venue_rolling(df, WINDOW)
    df_table = compute_table_features(df)
    df_market = compute_market_feature(df)
    df_rest = compute_rest_days(df)

    df_base = (
        df[["match_id", "League", "Season", "Date", "HomeTeam", "AwayTeam", "FTR"]]
        .set_index("match_id")
        .rename(columns={"FTR": "ftr"})
    )

    df_ml = (
        df_base.join(df_elo[["elo_diff_pre"]])
        .join(
            df_global[
                [
                    "goal_diff_last5_global",
                    "xg_diff_last5_global",
                    "xg_conceded_diff_last5_global",
                    "sot_diff_last5_global",
                ]
            ]
        )
        .join(df_venue[["goal_diff_last5_venue"]])
        .join(df_table[["points_diff_table", "venue_win_rate_diff"]])
        .join(df_market[["prob_diff_market"]])
        .join(df_rest[["rest_days_diff"]])
    )

    check_leakage(df_ml.reset_index(), df)
    return df_ml.dropna(subset=FEATURES_ROLLING).copy().reset_index()
