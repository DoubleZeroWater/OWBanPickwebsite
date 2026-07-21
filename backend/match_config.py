from __future__ import annotations

from copy import deepcopy
from typing import Any


MATCH_FORMAT_STAGE_COUNTS = {"ft2": 5, "ft3": 7, "ft4": 9}
LEGACY_MATCH_FORMAT_STAGE_COUNTS = {"ft2": 3, "ft3": 5, "ft4": 7}
MAP_SELECTION_MODES = {
    "unique_map",
    "unique_mode_until_cycle",
    "first_mode_then_unique_mode",
    "strict_mode_order",
    "fixed_map_order",
}
ROSTER_MODES = {"free_input", "preset_only", "skip"}
FIRST_BAN_POLICIES = {"allow_loser_choose", "loser_must_first"}
SIDE_POLICIES = {"random", "interactive_random", "left", "right"}
OPENING_SIDE_POLICIES = SIDE_POLICIES | {"follow_map_picker"}
SCORE_REPORT_MODES = {"admin_only", "team_submit_opponent_confirm"}
MAP_TIMEOUT_POLICIES = {"warn_extend_30", "random_legal_map", "forfeit_map", "admin_decision"}
LINEUP_TIMEOUT_POLICIES = {"warn_extend_30", "forfeit_map", "admin_decision"}
BAN_TIMEOUT_POLICIES = {"warn_extend_30", "random_legal_ban", "forfeit_map", "admin_decision"}
FIRST_SIDE_CHOICE_POLICIES = {"none", "map_picker", "left", "right", "left_attack", "left_defense"}
SUBSEQUENT_SIDE_CHOICE_POLICIES = {"previous_winner", "previous_loser"}
CHECKPOINT_KEYS = (
    "preCountdown",
    "mapPick",
    "lineupPick",
    "firstSecondBanChoice",
    "firstBan",
    "secondBan",
    "scorePick",
)
STAGE_LIMIT_KEYS = (
    "preStartRestSeconds",
    "mapSelectSeconds",
    "playerSelectSeconds",
    "firstBanChoiceSeconds",
    "firstBanActionSeconds",
    "secondBanActionSeconds",
    "scoreConfirmSeconds",
    "postMatchRestSeconds",
)
MATCH_CONFIG_KEYS = {
    "matchName",
    "teams",
    "matchFormat",
    "startWithDefaultConfig",
    "teamsCanEditOwnName",
    "stageCount",
    "checkpoints",
    "stageLimits",
    "mapPool",
    "mapSelectionMode",
    "firstMapMode",
    "modeOrder",
    "fixedMapOrderText",
    "fixedFirstMapEnabled",
    "fixedFirstMapName",
    "firstMapPickerPolicy",
    "mapPickerPolicy",
    "mapTimeoutPolicy",
    "symmetricSideChoiceEnabled",
    "firstSideChoicePolicy",
    "subsequentSideChoicePolicy",
    "sideChoicePickerPolicy",
    "rosterMode",
    "presetRosterText",
    "lineupTimeoutPolicy",
    "banEnabled",
    "firstBanPolicy",
    "openingSidePolicy",
    "banTimeoutPolicy",
    "scoreReportMode",
}


class MatchConfigValidationError(ValueError):
    def __init__(self, errors: list[dict[str, str]]):
        super().__init__("Invalid match configuration")
        self.errors = errors


def default_match_config() -> dict[str, Any]:
    match_format = "ft3"
    stage_count = MATCH_FORMAT_STAGE_COUNTS[match_format]
    return {
        "matchName": "OW Ban Pick Invitational",
        "teams": {"left": "蓝色方", "right": "红色方"},
        "matchFormat": match_format,
        "startWithDefaultConfig": False,
        "teamsCanEditOwnName": False,
        "stageCount": stage_count,
        "checkpoints": create_default_checkpoints(stage_count),
        "stageLimits": {
            "preStartRestSeconds": 30,
            "mapSelectSeconds": 45,
            "playerSelectSeconds": 60,
            "firstBanChoiceSeconds": 25,
            "firstBanActionSeconds": 25,
            "secondBanActionSeconds": 25,
            "scoreConfirmSeconds": 30,
            "postMatchRestSeconds": 120,
        },
        "mapPool": {
            "Control": ["Lijiang Tower", "Ilios", "Oasis", "Antarctic Peninsula"],
            "Escort": ["Circuit Royal", "Dorado", "Rialto"],
            "Hybrid": ["Hollywood", "King's Row", "Numbani"],
            "Push": ["Colosseo", "New Queen Street", "Runasapi"],
            "Flashpoint": ["Suravasa", "New Junk City"],
        },
        "mapSelectionMode": "first_mode_then_unique_mode",
        "firstMapMode": "Control",
        "modeOrder": ["Control", "Push", "Hybrid", "Escort", "Flashpoint", "Control", "Push"],
        "fixedMapOrderText": "Lijiang Tower\nKing's Row\nDorado\nColosseo\nSuravasa\nIlios\nRunasapi",
        "fixedFirstMapEnabled": False,
        "fixedFirstMapName": "Antarctic Peninsula",
        "firstMapPickerPolicy": "random",
        "mapPickerPolicy": "loser_choose",
        "mapTimeoutPolicy": "warn_extend_30",
        "symmetricSideChoiceEnabled": False,
        "firstSideChoicePolicy": "map_picker",
        "subsequentSideChoicePolicy": "previous_loser",
        "rosterMode": "free_input",
        "presetRosterText": "蓝色方: A1,A2,A3,A4,A5\n红色方: B1,B2,B3,B4,B5",
        "banEnabled": True,
        "lineupTimeoutPolicy": "warn_extend_30",
        "firstBanPolicy": "allow_loser_choose",
        "openingSidePolicy": "random",
        "banTimeoutPolicy": "warn_extend_30",
        "scoreReportMode": "team_submit_opponent_confirm",
    }


def create_default_checkpoints(stage_count: int) -> list[dict[str, dict[str, Any]]]:
    labels = {
        "preCountdown": "开始前倒计时",
        "mapPick": "选择地图",
        "lineupPick": "选择上场成员",
        "firstSecondBanChoice": "选择先后Ban",
        "firstBan": "先手Ban",
        "secondBan": "后手Ban",
        "scorePick": "比分录入",
    }
    return [
        {
            key: {"enabled": key != "preCountdown" or index > 0, "label": label}
            for key, label in labels.items()
        }
        for index in range(stage_count)
    ]


def normalize_match_config(value: Any, maps: dict[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise MatchConfigValidationError([{"path": "$", "message": "配置必须是 JSON 对象"}])

    source = value.get("config") if isinstance(value.get("config"), dict) else value
    unknown_keys = sorted(set(source) - MATCH_CONFIG_KEYS)
    errors: list[dict[str, str]] = []
    if unknown_keys:
        errors.append({"path": "$", "message": f"不支持的字段：{', '.join(unknown_keys)}"})

    result = default_match_config()
    match_format = source.get("matchFormat", result["matchFormat"])
    if match_format not in MATCH_FORMAT_STAGE_COUNTS:
        errors.append({"path": "matchFormat", "message": "必须是 ft2、ft3 或 ft4"})
        match_format = result["matchFormat"]
    stage_count = MATCH_FORMAT_STAGE_COUNTS[match_format]
    supplied_stage_count = source.get("stageCount")
    legacy_stage_count = LEGACY_MATCH_FORMAT_STAGE_COUNTS[match_format]
    if supplied_stage_count is not None and supplied_stage_count not in {stage_count, legacy_stage_count}:
        errors.append({"path": "stageCount", "message": f"{match_format} 的 stageCount 必须是 {stage_count}"})
    result["matchFormat"] = match_format
    result["stageCount"] = stage_count
    result["startWithDefaultConfig"] = _bool_value(
        source, "startWithDefaultConfig", result["startWithDefaultConfig"], errors
    )
    result["teamsCanEditOwnName"] = _bool_value(
        source, "teamsCanEditOwnName", result["teamsCanEditOwnName"], errors
    )

    match_name = source.get("matchName", result["matchName"])
    if not isinstance(match_name, str) or not match_name.strip() or len(match_name.strip()) > 120:
        errors.append({"path": "matchName", "message": "比赛名称必须是 1–120 个字符"})
    else:
        result["matchName"] = match_name.strip()

    teams = source.get("teams", result["teams"])
    if not isinstance(teams, dict):
        errors.append({"path": "teams", "message": "队伍信息必须是对象"})
    else:
        normalized_teams: dict[str, str] = {}
        for side in ("left", "right"):
            name = teams.get(side, result["teams"][side])
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
                errors.append({"path": f"teams.{side}", "message": "队伍名称必须是 1–60 个字符"})
            else:
                normalized_teams[side] = name.strip()
        if len(normalized_teams) == 2:
            result["teams"] = normalized_teams

    stage_limits = source.get("stageLimits", result["stageLimits"])
    if not isinstance(stage_limits, dict):
        errors.append({"path": "stageLimits", "message": "阶段时间必须是对象"})
    else:
        unknown_limits = sorted(set(stage_limits) - set(STAGE_LIMIT_KEYS))
        if unknown_limits:
            errors.append({"path": "stageLimits", "message": f"不支持的时间字段：{', '.join(unknown_limits)}"})
        for key in STAGE_LIMIT_KEYS:
            seconds = stage_limits.get(key, result["stageLimits"][key])
            minimum = 0 if key in {"preStartRestSeconds", "postMatchRestSeconds"} else 1
            if isinstance(seconds, bool) or not isinstance(seconds, int) or not minimum <= seconds <= 3600:
                errors.append({"path": f"stageLimits.{key}", "message": f"必须是 {minimum}–3600 之间的整数秒数"})
            else:
                result["stageLimits"][key] = seconds

    catalog = _build_catalog(maps or {})
    map_pool = source.get("mapPool", result["mapPool"])
    if not isinstance(map_pool, dict) or not map_pool:
        errors.append({"path": "mapPool", "message": "地图池必须是非空对象"})
    else:
        normalized_pool: dict[str, list[str]] = {}
        for mode, names in map_pool.items():
            if not isinstance(mode, str) or not isinstance(names, list):
                errors.append({"path": f"mapPool.{mode}", "message": "每个地图类别必须对应一个数组"})
                continue
            normalized_names: list[str] = []
            for index, name in enumerate(names):
                if not isinstance(name, str) or not name.strip():
                    errors.append({"path": f"mapPool.{mode}[{index}]", "message": "地图名称必须是非空字符串"})
                    continue
                canonical = catalog.get(mode, {}).get(name.casefold())
                if catalog and canonical is None:
                    errors.append({"path": f"mapPool.{mode}[{index}]", "message": f"地图目录中不存在 {name}"})
                    continue
                canonical = canonical or name.strip()
                if canonical not in normalized_names:
                    normalized_names.append(canonical)
            if normalized_names:
                normalized_pool[mode] = normalized_names
        if normalized_pool:
            result["mapPool"] = normalized_pool

    result["mapSelectionMode"] = _enum_value(
        source, "mapSelectionMode", MAP_SELECTION_MODES, result, errors
    )
    result["rosterMode"] = _enum_value(source, "rosterMode", ROSTER_MODES, result, errors)
    legacy_no_ban = source.get("firstBanPolicy") == "no_ban"
    result["banEnabled"] = _bool_value(source, "banEnabled", not legacy_no_ban and result["banEnabled"], errors)
    if legacy_no_ban:
        result["firstBanPolicy"] = "allow_loser_choose"
    else:
        result["firstBanPolicy"] = _enum_value(
            source, "firstBanPolicy", FIRST_BAN_POLICIES, result, errors
        )
    result["openingSidePolicy"] = _enum_value(
        source, "openingSidePolicy", OPENING_SIDE_POLICIES, result, errors
    )
    result["firstMapPickerPolicy"] = _side_policy_value(source, "firstMapPickerPolicy", result, errors)
    result["mapPickerPolicy"] = _enum_value(
        source, "mapPickerPolicy", {"loser_choose"}, result, errors
    )
    result["mapTimeoutPolicy"] = _enum_value(
        source, "mapTimeoutPolicy", MAP_TIMEOUT_POLICIES, result, errors
    )
    result["symmetricSideChoiceEnabled"] = _bool_value(
        source,
        "symmetricSideChoiceEnabled",
        result["symmetricSideChoiceEnabled"],
        errors,
    )
    legacy_side_policy = source.get("sideChoicePickerPolicy")
    result["firstSideChoicePolicy"] = _enum_value(
        source,
        "firstSideChoicePolicy",
        FIRST_SIDE_CHOICE_POLICIES,
        result,
        errors,
    )
    result["subsequentSideChoicePolicy"] = _enum_value(
        source,
        "subsequentSideChoicePolicy",
        SUBSEQUENT_SIDE_CHOICE_POLICIES,
        result,
        errors,
    )
    if "subsequentSideChoicePolicy" not in source and legacy_side_policy in SUBSEQUENT_SIDE_CHOICE_POLICIES:
        result["subsequentSideChoicePolicy"] = legacy_side_policy
    result["lineupTimeoutPolicy"] = _enum_value(
        source, "lineupTimeoutPolicy", LINEUP_TIMEOUT_POLICIES, result, errors
    )
    result["banTimeoutPolicy"] = _enum_value(
        source, "banTimeoutPolicy", BAN_TIMEOUT_POLICIES, result, errors
    )
    result["scoreReportMode"] = _enum_value(
        source, "scoreReportMode", SCORE_REPORT_MODES, result, errors
    )

    first_map_mode = source.get("firstMapMode", result["firstMapMode"])
    if not isinstance(first_map_mode, str) or (catalog and first_map_mode not in catalog):
        errors.append({"path": "firstMapMode", "message": "必须是地图目录中的有效类别"})
    else:
        result["firstMapMode"] = first_map_mode

    mode_order = source.get("modeOrder", result["modeOrder"])
    if not isinstance(mode_order, list):
        errors.append({"path": "modeOrder", "message": "必须是地图模式数组"})
    else:
        normalized_mode_order: list[str] = []
        for index, mode in enumerate(mode_order):
            if not isinstance(mode, str) or (catalog and mode not in catalog):
                errors.append({"path": f"modeOrder[{index}]", "message": "必须是地图目录中的有效模式"})
            else:
                normalized_mode_order.append(mode)
        if normalized_mode_order:
            result["modeOrder"] = normalized_mode_order

    result["fixedFirstMapEnabled"] = _bool_value(
        source, "fixedFirstMapEnabled", result["fixedFirstMapEnabled"], errors
    )
    if result["fixedFirstMapEnabled"] and "firstSideChoicePolicy" not in source:
        result["firstSideChoicePolicy"] = "left"
    if result["fixedFirstMapEnabled"] and result["firstSideChoicePolicy"] == "map_picker":
        errors.append({
            "path": "firstSideChoicePolicy",
            "message": "启用固定首图时不能选择第一张地图选择方",
        })
    if result["fixedFirstMapEnabled"] and result["openingSidePolicy"] == "follow_map_picker":
        errors.append({
            "path": "openingSidePolicy",
            "message": "启用固定首图时禁用首次先手方不能跟随地图选图权",
        })
    fixed_first_map_name = source.get("fixedFirstMapName", result["fixedFirstMapName"])
    if not isinstance(fixed_first_map_name, str):
        errors.append({"path": "fixedFirstMapName", "message": "必须是字符串"})
    else:
        result["fixedFirstMapName"] = fixed_first_map_name.strip()

    for key in ("fixedMapOrderText", "presetRosterText"):
        text = source.get(key, result[key])
        if not isinstance(text, str) or len(text) > 20_000:
            errors.append({"path": key, "message": "必须是长度不超过 20000 的字符串"})
        else:
            result[key] = text

    if result["mapSelectionMode"] == "fixed_map_order":
        fixed_names = [line.strip() for line in result["fixedMapOrderText"].splitlines() if line.strip()]
        if len(fixed_names) < stage_count:
            errors.append({"path": "fixedMapOrderText", "message": f"固定地图顺序至少需要 {stage_count} 张地图"})
        all_maps = {name.casefold() for names in catalog.values() for name in names.values()}
        for index, name in enumerate(fixed_names):
            if all_maps and name.casefold() not in all_maps:
                errors.append({"path": f"fixedMapOrderText[{index}]", "message": f"地图目录中不存在 {name}"})

    selected_map_count = sum(len(names) for names in result["mapPool"].values())
    if result["mapSelectionMode"] != "fixed_map_order" and selected_map_count < stage_count:
        errors.append({"path": "mapPool", "message": f"{match_format.upper()} 至少需要选择 {stage_count} 张地图，以支持最多 2 场平局"})

    if result["mapSelectionMode"] == "strict_mode_order":
        if len(result["modeOrder"]) < stage_count:
            errors.append({"path": "modeOrder", "message": f"模式顺序至少需要 {stage_count} 项"})
        else:
            for mode in set(result["modeOrder"][:stage_count]):
                required = result["modeOrder"][:stage_count].count(mode)
                available = len(result["mapPool"].get(mode, []))
                if available < required:
                    errors.append({"path": f"mapPool.{mode}", "message": f"模式顺序需要 {required} 张{mode}地图，当前只有 {available} 张"})

    if result["fixedFirstMapEnabled"]:
        if result["mapSelectionMode"] == "fixed_map_order":
            errors.append({"path": "fixedFirstMapEnabled", "message": "固定地图顺序下不能单独设置首图"})
        fixed_map = next(
            (
                (mode, name)
                for mode, names in result["mapPool"].items()
                for name in names
                if name.casefold() == result["fixedFirstMapName"].casefold()
            ),
            None,
        )
        if fixed_map is None:
            errors.append({"path": "fixedFirstMapName", "message": "首图必须来自当前地图池"})
        elif result["mapSelectionMode"] == "first_mode_then_unique_mode" and fixed_map[0] != result["firstMapMode"]:
            errors.append({"path": "fixedFirstMapName", "message": "首图模式与第一张地图模式不一致"})
        elif result["mapSelectionMode"] == "strict_mode_order" and result["modeOrder"] and fixed_map[0] != result["modeOrder"][0]:
            errors.append({"path": "fixedFirstMapName", "message": "首图模式与模式顺序第一项不一致"})

    result["checkpoints"] = _normalize_checkpoints(source.get("checkpoints"), stage_count, errors)

    if errors:
        raise MatchConfigValidationError(errors)
    return deepcopy(result)


def _enum_value(
    source: dict[str, Any],
    key: str,
    allowed: set[str],
    result: dict[str, Any],
    errors: list[dict[str, str]],
) -> str:
    value = source.get(key, result[key])
    if value not in allowed:
        errors.append({"path": key, "message": f"必须是以下值之一：{', '.join(sorted(allowed))}"})
        return result[key]
    return str(value)


def _bool_value(
    source: dict[str, Any],
    key: str,
    default: bool,
    errors: list[dict[str, str]],
) -> bool:
    value = source.get(key, default)
    if not isinstance(value, bool):
        errors.append({"path": key, "message": "必须是布尔值"})
        return default
    return value


def _side_policy_value(
    source: dict[str, Any],
    key: str,
    result: dict[str, Any],
    errors: list[dict[str, str]],
) -> str:
    value = source.get(key, result[key])
    value = {"red": "right", "blue": "left"}.get(value, value)
    if value not in SIDE_POLICIES:
        errors.append({"path": key, "message": "必须是 random、interactive_random、left 或 right"})
        return result[key]
    return str(value)


def _normalize_checkpoints(
    value: Any, stage_count: int, errors: list[dict[str, str]]
) -> list[dict[str, dict[str, Any]]]:
    defaults = create_default_checkpoints(stage_count)
    if value is None:
        return defaults
    if not isinstance(value, list):
        errors.append({"path": "checkpoints", "message": f"必须包含不超过 {stage_count} 个地图阶段"})
        return defaults
    if len(value) > stage_count:
        errors.append({"path": "checkpoints", "message": f"最多包含 {stage_count} 个地图阶段"})
        value = value[:stage_count]
    normalized = deepcopy(defaults)
    for stage_index, stage in enumerate(value):
        if not isinstance(stage, dict):
            errors.append({"path": f"checkpoints[{stage_index}]", "message": "必须是对象"})
            continue
        unknown = sorted(set(stage) - set(CHECKPOINT_KEYS))
        if unknown:
            errors.append({"path": f"checkpoints[{stage_index}]", "message": f"不支持的检查点：{', '.join(unknown)}"})
        for key in CHECKPOINT_KEYS:
            checkpoint = stage.get(key, normalized[stage_index][key])
            if not isinstance(checkpoint, dict):
                errors.append({"path": f"checkpoints[{stage_index}].{key}", "message": "必须是对象"})
                continue
            enabled = checkpoint.get("enabled", normalized[stage_index][key]["enabled"])
            label = checkpoint.get("label", normalized[stage_index][key]["label"])
            if not isinstance(enabled, bool):
                errors.append({"path": f"checkpoints[{stage_index}].{key}.enabled", "message": "必须是布尔值"})
            if not isinstance(label, str) or not label.strip() or len(label.strip()) > 40:
                errors.append({"path": f"checkpoints[{stage_index}].{key}.label", "message": "必须是 1–40 个字符"})
            if isinstance(enabled, bool) and isinstance(label, str) and label.strip():
                normalized[stage_index][key] = {"enabled": enabled, "label": label.strip()}
    return normalized


def _build_catalog(maps: dict[str, Any]) -> dict[str, dict[str, str]]:
    catalog: dict[str, dict[str, str]] = {}
    for mode, items in maps.items():
        if not isinstance(items, list):
            continue
        mode_catalog: dict[str, str] = {}
        for item in items:
            name = item.get("nameEn") if isinstance(item, dict) else None
            if isinstance(name, str) and name.strip():
                mode_catalog[name.casefold()] = name
        if mode_catalog:
            catalog[str(mode)] = mode_catalog
    return catalog
