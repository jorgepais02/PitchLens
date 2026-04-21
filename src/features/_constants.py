WINDOW: int = 5
ELO_K: int = 20
ELO_BASE: int = 1500

FEATURES_ROLLING: list[str] = [
    "goal_diff_last5_global",
    "xg_diff_last5_global",
    "xg_conceded_diff_last5_global",
    "sot_diff_last5_global",
    "goal_diff_last5_venue",
    "rest_days_diff",
]

FEATURES: list[str] = [
    "elo_diff_pre",
    "points_diff_global",
    "points_diff_venue",
    *FEATURES_ROLLING,
    "prob_diff_market",
]
