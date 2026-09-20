from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Mapping

from .contracts import (
    HeroPool,
    JsonObject,
    JsonValue,
    Lineup,
    MapCapabilities,
    MapFacts,
    MatchConfig,
    MatchFacts,
    PhaseState,
    PortalCode,
    PresenceEntry,
    RoomRuntimeData,
    RoomStatusData,
    RuntimePause,
    Side,
    ValidationIssue,
)

SIDES = ("left", "right")
PORTAL_SIDES = {"A": "left", "B": "right", "C": None, "D": None}
PORTAL_ROLES = {"A": "blue-team", "B": "red-team", "C": "admin", "D": "broadcast"}
MATCH_WINS = {"ft2": 2, "ft3": 3, "ft4": 4}
MAP_SLOTS = {"ft2": 5, "ft3": 7, "ft4": 9}


class StateValidationError(ValueError):
    def __init__(self, errors: list[ValidationIssue]):
        super().__init__("Invalid authoritative state")
        self.errors = errors


def stable_id(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = text.replace("'", "")
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text or "unknown"


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def status_hash(value: Mapping[str, JsonValue]) -> str:
    payload = {key: deepcopy(item) for key, item in value.items() if key != "hash"}
    digest = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def other_side(side: str) -> str:
    return "right" if side == "left" else "left"


def hero_pool_from_catalog(heroes: object) -> HeroPool:
    pool = {"tank": [], "damage": [], "support": []}
    if not isinstance(heroes, list):
        return pool

    for hero in heroes:
        if not isinstance(hero, dict):
            continue
        role = stable_id(hero.get("role"))
        name = hero.get("nameEn")
        if role not in pool or not isinstance(name, str) or not name.strip():
            continue
        hero_id = catalog_hero_id(name)
        if hero_id and hero_id not in pool[role]:
            pool[role].append(hero_id)

    return pool


def catalog_hero_id(value: object) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(
        character.lower()
        for character in normalized
        if not unicodedata.combining(character) and character.isascii() and character.isalnum()
    )


def bundled_hero_pool() -> HeroPool:
    assets_path = Path(__file__).resolve().parent.parent / "data" / "assets.json"
    try:
        with assets_path.open(encoding="utf-8") as file:
            assets = json.load(file)
    except (OSError, json.JSONDecodeError):
        return {"tank": [], "damage": [], "support": []}
    return hero_pool_from_catalog(assets.get("heroes") if isinstance(assets, dict) else [])


def map_capabilities_from_catalog(assets: object) -> MapCapabilities:
    capabilities: MapCapabilities = {}
    if not isinstance(assets, dict):
        return capabilities
    for maps in assets.get("maps", {}).values():
        if not isinstance(maps, list):
            continue
        for item in maps:
            if not isinstance(item, dict) or not isinstance(item.get("nameEn"), str):
                continue
            capability = item.get("sideSelectionKind")
            if capability in {"attack_defense", "red_blue", "none"}:
                capabilities[stable_id(item["nameEn"])] = capability
    return capabilities


def bundled_map_capabilities() -> MapCapabilities:
    assets_path = Path(__file__).resolve().parent.parent / "data" / "assets.json"
    try:
        with assets_path.open(encoding="utf-8") as file:
            assets = json.load(file)
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(assets, dict):
        return {}
    mode_defaults = {
        "escort": "attack_defense",
        "hybrid": "attack_defense",
        "control": "red_blue",
        "push": "red_blue",
        "flashpoint": "red_blue",
    }
    enriched = deepcopy(assets)
    for mode, maps in enriched.get("maps", {}).items():
        for item in maps if isinstance(maps, list) else []:
            if isinstance(item, dict):
                item.setdefault("sideSelectionKind", mode_defaults.get(stable_id(mode), "none"))
    return map_capabilities_from_catalog(enriched)


def default_config(
    hero_pool: Mapping[str, list[str]] | None = None,
    map_capabilities: Mapping[str, str] | None = None,
) -> MatchConfig:
    return {
        "schemaVersion": 2,
        "matchName": "OW Ban Pick Invitational",
        "teamNames": {"left": "队伍 1", "right": "队伍 2"},
        "matchFormat": "ft3",
        "startPolicy": "manual",
        "teamsCanEditOwnName": False,
        "timing": {
            "preMatchRestSeconds": 30,
            "interMapRestSeconds": 120,
            "interactiveRandomSeconds": 30,
            "mapPickSeconds": 45,
            "sidePickSeconds": 30,
            "lineupSubmitSeconds": 60,
            "banOrderSeconds": 25,
            "firstBanSeconds": 25,
            "secondBanSeconds": 25,
            "scoreConfirmationSeconds": 30,
            "timeoutExtensionSeconds": 30,
        },
        "map": {
            "mapPool": {
                "control": ["lijiang_tower", "ilios"],
                "escort": ["circuit_royal", "dorado"],
                "hybrid": ["kings_row", "hollywood"],
                "push": ["colosseo", "new_queen_street"],
                "flashpoint": ["suravasa", "new_junk_city"],
            },
            "selectionPolicy": "first_mode_then_unique_mode",
            "firstMapMode": "control",
            "modeOrder": ["control", "push", "hybrid", "escort", "flashpoint"],
            "fixedMapOrder": [],
            "fixedFirstMapEnabled": False,
            "fixedFirstMapId": None,
            "initialPriorityPolicy": "interactive_random",
            "subsequentPriorityPolicy": "previous_loser",
            "mapPickTimeoutPolicy": "retry_after_delay",
            "interactiveRandomMissingInputPolicy": "use_zero",
        },
        "sideChoice": {
            "firstMapSideChoiceEnabled": False,
            "symmetricSideChoiceEnabled": False,
            "chooserRelation": "priority",
            "timeoutPolicy": "chooser_blue_defense",
        },
        "lineup": {"mode": "free_input", "presetRosters": {"left": [], "right": []}, "timeoutPolicy": "retry_after_delay"},
        "ban": {
            "enabled": True,
            "advantageRelation": "priority",
            "orderPolicy": "advantage_chooses",
            "orderTimeoutPolicy": "advantage_first",
            "actionTimeoutPolicy": "retry_after_delay",
        },
        "score": {"confirmationTimeoutPolicy": "auto_confirm"},
        "pause": {
            "globalPauseEnabled": True,
            "teamPauseEnabled": True,
            "teamPauseMaxCountPerMap": None,
            "teamPauseMaxSingleSeconds": None,
            "teamPauseMaxTotalSeconds": None,
        },
        "rollback": {
            "enabled": True,
            "defaultCheckpoints": ["pre_countdown", "map_pick", "lineup", "ban_order", "first_ban", "second_ban", "score_entry"],
            "mapOverrides": {},
            "allowAfterCompletion": False,
        },
        "_heroPool": deepcopy(dict(hero_pool if hero_pool is not None else bundled_hero_pool())),
        "_mapCapabilities": deepcopy(dict(map_capabilities if map_capabilities is not None else bundled_map_capabilities())),
    }


ENUMS: dict[str, set[str]] = {
    "matchFormat": set(MATCH_WINS),
    "mapSelectionMode": {
        "unique_map", "unique_mode_until_cycle", "first_mode_then_unique_mode",
        "strict_mode_order", "fixed_map_order",
    },
    "firstMapPickerPolicy": {"random", "interactive_random", "left", "right"},
    "firstSideChoicePolicy": {"none", "map_picker", "left", "right", "left_attack", "left_defense"},
    "mapPickerPolicy": {"loser_choose"},
    "mapTimeoutPolicy": {"warn_extend_30", "random_legal_map", "forfeit_map", "admin_decision"},
    "subsequentSideChoicePolicy": {"previous_winner", "previous_loser"},
    "rosterMode": {"free_input", "preset_only", "skip"},
    "lineupTimeoutPolicy": {"warn_extend_30", "forfeit_map", "admin_decision"},
    "firstBanPolicy": {"allow_loser_choose", "loser_must_first"},
    "openingSidePolicy": {"follow_map_picker", "random", "interactive_random", "left", "right"},
    "banTimeoutPolicy": {"warn_extend_30", "random_legal_ban", "forfeit_map", "admin_decision"},
    "scoreReportMode": {"admin_only", "team_submit_opponent_confirm"},
    "scoreTimeoutPolicy": {"auto_confirm_submitted", "admin_decision"},
}


def _legacy_config(value: Mapping[str, JsonValue]) -> JsonObject:
    result = deepcopy(dict(value))
    pool = result.get("mapPool")
    if isinstance(pool, dict):
        result["mapPool"] = {
            stable_id(mode): [stable_id(name) for name in names if isinstance(name, str)]
            for mode, names in pool.items() if isinstance(names, list)
        }
    for key in ("firstMapMode", "fixedFirstMapName"):
        if key in result:
            result["fixedFirstMapId" if key == "fixedFirstMapName" else key] = stable_id(result[key])
    result.pop("fixedFirstMapName", None)
    if isinstance(result.get("modeOrder"), list):
        result["modeOrder"] = [stable_id(item) for item in result["modeOrder"]]
    fixed_text = result.pop("fixedMapOrderText", None)
    if isinstance(fixed_text, str):
        result["fixedMapOrder"] = [stable_id(line) for line in fixed_text.splitlines() if line.strip()]
    preset_text = result.pop("presetRosterText", None)
    if isinstance(preset_text, str):
        members = [item.strip() for line in preset_text.splitlines() for item in line.split(",") if item.strip()]
        result["presetRosters"] = {"left": members, "right": members}
    result.pop("stageCount", None)
    result.pop("checkpoints", None)
    result.pop("sideChoicePickerPolicy", None)
    return result


def _target_from_legacy(
    source: Mapping[str, JsonValue],
    hero_pool: Mapping[str, list[str]] | None,
    map_capabilities: Mapping[str, str] | None,
) -> MatchConfig:
    legacy = _legacy_config(source)
    defaults = default_config(hero_pool, map_capabilities)
    limits = legacy.get("stageLimits") if isinstance(legacy.get("stageLimits"), dict) else {}
    first_policy = legacy.get("firstMapPickerPolicy", "interactive_random")
    timeout = legacy.get("mapTimeoutPolicy", "warn_extend_30")
    ban_timeout = legacy.get("banTimeoutPolicy", "warn_extend_30")
    target = deepcopy(defaults)
    target.update({
        "matchName": legacy.get("matchName", target["matchName"]),
        "teamNames": legacy.get("teams", target["teamNames"]),
        "matchFormat": legacy.get("matchFormat", target["matchFormat"]),
        "startPolicy": "auto_when_both_ready" if legacy.get("startWithDefaultConfig") else "manual",
        "teamsCanEditOwnName": bool(legacy.get("teamsCanEditOwnName", False)),
    })
    timing_map = {
        "preMatchRestSeconds": "preStartRestSeconds", "interMapRestSeconds": "postMatchRestSeconds",
        "mapPickSeconds": "mapSelectSeconds", "lineupSubmitSeconds": "playerSelectSeconds",
        "banOrderSeconds": "firstBanChoiceSeconds", "firstBanSeconds": "firstBanActionSeconds",
        "secondBanSeconds": "secondBanActionSeconds", "scoreConfirmationSeconds": "scoreConfirmSeconds",
    }
    for target_key, old_key in timing_map.items():
        if old_key in limits:
            target["timing"][target_key] = limits[old_key]
    target["map"].update({
        "mapPool": legacy.get("mapPool", target["map"]["mapPool"]),
        "selectionPolicy": legacy.get("mapSelectionMode", target["map"]["selectionPolicy"]),
        "firstMapMode": legacy.get("firstMapMode", target["map"]["firstMapMode"]),
        "modeOrder": legacy.get("modeOrder", target["map"]["modeOrder"]),
        "fixedMapOrder": legacy.get("fixedMapOrder", []),
        "fixedFirstMapEnabled": bool(legacy.get("fixedFirstMapEnabled", False)),
        "fixedFirstMapId": legacy.get("fixedFirstMapId"),
        "initialPriorityPolicy": "system_random" if first_policy == "random" else first_policy,
        "subsequentPriorityPolicy": legacy.get("subsequentSideChoicePolicy", "previous_loser"),
        "mapPickTimeoutPolicy": "retry_after_delay" if timeout == "warn_extend_30" else timeout,
    })
    target["sideChoice"].update({
        "firstMapSideChoiceEnabled": legacy.get("firstSideChoicePolicy") not in {None, "none", "left_attack", "left_defense"},
        "symmetricSideChoiceEnabled": bool(legacy.get("symmetricSideChoiceEnabled", False)),
    })
    target["lineup"].update({
        "mode": legacy.get("rosterMode", "free_input"),
        "presetRosters": legacy.get("presetRosters", {"left": [], "right": []}),
        "timeoutPolicy": "retry_after_delay" if legacy.get("lineupTimeoutPolicy") == "warn_extend_30" else legacy.get("lineupTimeoutPolicy", "retry_after_delay"),
    })
    target["ban"].update({
        "enabled": bool(legacy.get("banEnabled", True)),
        "orderPolicy": "advantage_must_first" if legacy.get("firstBanPolicy") == "loser_must_first" else "advantage_chooses",
        "actionTimeoutPolicy": "retry_after_delay" if ban_timeout == "warn_extend_30" else "random_legal_hero" if ban_timeout == "random_legal_ban" else ban_timeout,
    })
    target["score"]["confirmationTimeoutPolicy"] = "admin_decision" if legacy.get("scoreTimeoutPolicy") == "admin_decision" else "auto_confirm"
    return target


def normalize_config(
    value: object,
    *,
    accept_legacy: bool = False,
    hero_pool: Mapping[str, list[str]] | None = None,
    map_capabilities: Mapping[str, str] | None = None,
) -> MatchConfig:
    if not isinstance(value, dict):
        raise StateValidationError([{"path": "$", "message": "配置必须是对象"}])
    source = deepcopy(value.get("config") if isinstance(value.get("config"), dict) else value)
    if source.get("schemaVersion") != 2 or not isinstance(source.get("map"), dict):
        if not accept_legacy:
            raise StateValidationError([{"path": "schemaVersion", "message": "必须是目标配置 schemaVersion 2"}])
        source = _target_from_legacy(source, hero_pool, map_capabilities)
    defaults = default_config(hero_pool, map_capabilities)
    result = deepcopy(defaults)
    errors: list[ValidationIssue] = []

    allowed = set(defaults) - {"_heroPool", "_mapCapabilities"}
    unknown = sorted(set(source) - allowed - {"_heroPool", "_mapCapabilities"})
    if unknown:
        errors.append({"path": "$", "message": f"不支持的配置字段：{', '.join(unknown)}"})
    name = source.get("matchName", result["matchName"])
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        errors.append({"path": "matchName", "message": "必须是 1 到 120 个字符"})
    else:
        result["matchName"] = name.strip()
    teams = source.get("teamNames", result["teamNames"])
    if not isinstance(teams, dict):
        errors.append({"path": "teamNames", "message": "必须是对象"})
    else:
        for side in SIDES:
            team_name = teams.get(side)
            if not isinstance(team_name, str) or not team_name.strip() or len(team_name.strip()) > 60:
                errors.append({"path": f"teamNames.{side}", "message": "必须是 1 到 60 个字符"})
            else:
                result["teamNames"][side] = team_name.strip()
    for key, choices in {"matchFormat": set(MATCH_WINS), "startPolicy": {"manual", "auto_when_both_ready"}}.items():
        item = source.get(key, result[key])
        if item not in choices:
            errors.append({"path": key, "message": f"必须是：{' | '.join(sorted(choices))}"})
        else:
            result[key] = item
    editable = source.get("teamsCanEditOwnName", result["teamsCanEditOwnName"])
    if not isinstance(editable, bool):
        errors.append({"path": "teamsCanEditOwnName", "message": "必须是布尔值"})
    else:
        result["teamsCanEditOwnName"] = editable

    timing = source.get("timing", {})
    if not isinstance(timing, dict):
        errors.append({"path": "timing", "message": "必须是对象"})
    else:
        for key, fallback in result["timing"].items():
            item = timing.get(key, fallback)
            minimum = 0 if key in {"preMatchRestSeconds", "interMapRestSeconds"} else 1
            if isinstance(item, bool) or not isinstance(item, int) or not minimum <= item <= 3600:
                errors.append({"path": f"timing.{key}", "message": f"必须是 {minimum} 到 3600 的整数"})
            else:
                result["timing"][key] = item

    section_enums = {
        "map": {
            "selectionPolicy": {"unique_map", "unique_mode_until_cycle", "first_mode_then_unique_mode", "strict_mode_order", "fixed_map_order"},
            "initialPriorityPolicy": {"system_random", "interactive_random", "left", "right"},
            "subsequentPriorityPolicy": {"previous_loser", "previous_winner"},
            "mapPickTimeoutPolicy": {"retry_after_delay", "random_legal_map", "forfeit_map", "admin_decision"},
            "interactiveRandomMissingInputPolicy": {"use_zero", "server_random", "admin_decision"},
        },
        "sideChoice": {
            "chooserRelation": {"priority", "non_priority"},
            "timeoutPolicy": {"random_legal_choice", "chooser_blue_defense", "chooser_red_attack", "admin_decision", "retry_after_delay", "forfeit_map"},
        },
        "lineup": {"mode": {"free_input", "preset_only", "skip"}, "timeoutPolicy": {"retry_after_delay", "forfeit_map", "admin_decision"}},
        "ban": {
            "advantageRelation": {"priority", "non_priority"},
            "orderPolicy": {"advantage_chooses", "advantage_must_first"},
            "orderTimeoutPolicy": {"random_legal_order", "advantage_first", "advantage_second", "admin_decision", "retry_after_delay", "forfeit_map"},
            "actionTimeoutPolicy": {"random_legal_hero", "retry_after_delay", "forfeit_map", "admin_decision"},
        },
        "score": {"confirmationTimeoutPolicy": {"auto_confirm", "admin_decision"}},
    }
    for section, enums in section_enums.items():
        supplied = source.get(section, {})
        if not isinstance(supplied, dict):
            errors.append({"path": section, "message": "必须是对象"})
            continue
        result[section].update(deepcopy(supplied))
        for key, choices in enums.items():
            if result[section].get(key) not in choices:
                errors.append({"path": f"{section}.{key}", "message": f"必须是：{' | '.join(sorted(choices))}"})

    map_config = result["map"]
    pool = map_config.get("mapPool")
    normalized_pool: dict[str, list[str]] = {}
    if not isinstance(pool, dict) or not pool:
        errors.append({"path": "map.mapPool", "message": "必须是非空对象"})
    else:
        for mode, entries in pool.items():
            if not isinstance(mode, str) or not isinstance(entries, list):
                errors.append({"path": f"map.mapPool.{mode}", "message": "必须是地图 ID 数组"})
                continue
            values = list(dict.fromkeys(stable_id(item) for item in entries if isinstance(item, str) and item.strip()))
            if values:
                normalized_pool[stable_id(mode)] = values
        if normalized_pool:
            map_config["mapPool"] = normalized_pool
    for key in ("modeOrder", "fixedMapOrder"):
        values = map_config.get(key)
        if not isinstance(values, list) or any(not isinstance(item, str) for item in values):
            errors.append({"path": f"map.{key}", "message": "必须是 ID 数组"})
        else:
            map_config[key] = [stable_id(item) for item in values]
    map_config["firstMapMode"] = stable_id(map_config.get("firstMapMode"))
    fixed_id = map_config.get("fixedFirstMapId")
    map_config["fixedFirstMapId"] = stable_id(fixed_id) if isinstance(fixed_id, str) and fixed_id.strip() else None
    for key in ("fixedFirstMapEnabled",):
        if not isinstance(map_config.get(key), bool):
            errors.append({"path": f"map.{key}", "message": "必须是布尔值"})
    if map_config["fixedFirstMapEnabled"] and not map_config["fixedFirstMapId"]:
        errors.append({"path": "map.fixedFirstMapId", "message": "启用固定首图时必须选择地图"})
    distinct_maps = {item for items in map_config.get("mapPool", {}).values() for item in items}
    if len(distinct_maps) < MAP_SLOTS[result["matchFormat"]]:
        errors.append({"path": "map.mapPool", "message": f"至少需要 {MAP_SLOTS[result['matchFormat']]} 张不同地图"})
    for index, map_id in enumerate(map_config.get("fixedMapOrder", [])):
        if map_id not in distinct_maps:
            errors.append({"path": f"map.fixedMapOrder[{index}]", "message": "固定顺序地图必须属于本场地图池"})

    effective_capabilities = dict(
        map_capabilities
        if map_capabilities is not None
        else source.get("_mapCapabilities") or bundled_map_capabilities()
    )
    for mode, map_ids in map_config.get("mapPool", {}).items():
        for index, map_id in enumerate(map_ids):
            capability = effective_capabilities.get(map_id)
            if capability not in {"attack_defense", "red_blue", "none"}:
                errors.append({
                    "path": f"map.mapPool.{mode}[{index}]",
                    "message": "地图必须存在于当前锁定目录并具有有效的地图能力定义",
                })

    for section, keys in {"sideChoice": ("firstMapSideChoiceEnabled", "symmetricSideChoiceEnabled"), "ban": ("enabled",)}.items():
        for key in keys:
            if not isinstance(result[section].get(key), bool):
                errors.append({"path": f"{section}.{key}", "message": "必须是布尔值"})
    rosters = result["lineup"].get("presetRosters")
    if not isinstance(rosters, dict):
        errors.append({"path": "lineup.presetRosters", "message": "必须是对象"})
    else:
        for side in SIDES:
            entries = rosters.get(side, [])
            if not isinstance(entries, list) or any(not isinstance(item, str) for item in entries):
                errors.append({"path": f"lineup.presetRosters.{side}", "message": "必须是字符串数组"})
            else:
                rosters[side] = list(dict.fromkeys(item.strip() for item in entries if item.strip()))

    for section in ("pause", "rollback"):
        supplied = source.get(section, {})
        if isinstance(supplied, dict):
            result[section].update(deepcopy(supplied))
        else:
            errors.append({"path": section, "message": "必须是对象"})
    for key in ("globalPauseEnabled", "teamPauseEnabled"):
        if not isinstance(result["pause"].get(key), bool):
            errors.append({"path": f"pause.{key}", "message": "必须是布尔值"})
    for key in ("teamPauseMaxCountPerMap", "teamPauseMaxSingleSeconds", "teamPauseMaxTotalSeconds"):
        item = result["pause"].get(key)
        if item is not None and (isinstance(item, bool) or not isinstance(item, int) or item < 1):
            errors.append({"path": f"pause.{key}", "message": "必须是正整数或 null"})
    for key in ("enabled", "allowAfterCompletion"):
        if not isinstance(result["rollback"].get(key), bool):
            errors.append({"path": f"rollback.{key}", "message": "必须是布尔值"})
    result["schemaVersion"] = 2
    result["_heroPool"] = deepcopy(dict(hero_pool if hero_pool is not None else source.get("_heroPool") or bundled_hero_pool()))
    result["_mapCapabilities"] = deepcopy(effective_capabilities)
    if errors:
        raise StateValidationError(errors)
    return result


@dataclass
class RoomStatus:
    schemaVersion: int
    roomId: str
    epoch: int
    revision: int
    hash: str
    catalogHash: str
    lifecycle: str
    config: MatchConfig
    match: MatchFacts
    phase: PhaseState

    def to_dict(self) -> RoomStatusData:
        return deepcopy(asdict(self))

    def seal(self) -> None:
        self.hash = status_hash(self.to_dict())

    @classmethod
    def initial(cls, room_id: str, config: MatchConfig, catalog_hash: str = "") -> "RoomStatus":
        maps = [empty_map(index) for index in range(MAP_SLOTS[config["matchFormat"]])]
        status = cls(
            schemaVersion=2,
            roomId=room_id,
            epoch=1,
            revision=1,
            hash="",
            catalogHash=catalog_hash,
            lifecycle="preparing",
            config=deepcopy(config),
            match={
                "teams": {
                    side: {"id": f"team-{side}", "name": config["teamNames"][side], "seed": index + 1, "seriesScore": 0}
                    for index, side in enumerate(SIDES)
                },
                "decisions": {
                    "initialPrioritySide": None,
                    "firstMapPickerSide": None,
                    "firstMapSidePickerSide": None,
                    "openingBanSide": None,
                },
                "winnerSide": None,
                "maps": maps,
            },
            phase={"phaseId": "", "type": "configuring", "mapIndex": None, "actorSide": None, "data": {}},
        )
        status.phase["phaseId"] = f"{status.epoch}:{status.revision}:configuring:initial"
        status.seal()
        return status


def empty_map(index: int) -> MapFacts:
    return {
        "index": index,
        "status": "pending",
        "mapId": None,
        "modeId": None,
        "pickerSide": None,
        "sideChoice": None,
        "lineups": None,
        "bans": {"firstBanSide": None, "leftHeroId": None, "rightHeroId": None},
        "score": None,
        "resultType": None,
        "winnerSide": None,
        "forfeitSide": None,
        "forfeitReason": None,
    }


@dataclass
class RoomRuntime:
    baseStatusRevision: int
    baseStatusHash: str
    phaseId: str
    runtimeId: str = ""
    runtimeSeq: int = 1
    totalTimeMs: int = 0
    remainingTimeMs: int = 0
    pause: RuntimePause = field(default_factory=lambda: {
        "global": {"active": False, "totalMs": 0},
        "scoreTeams": {
            "left": {"active": False, "phaseTotalMs": 0, "matchTotalMs": 0, "count": 0},
            "right": {"active": False, "phaseTotalMs": 0, "matchTotalMs": 0, "count": 0},
        },
    })
    presence: dict[PortalCode, PresenceEntry] = field(default_factory=dict)
    interactiveRandom: JsonObject | None = None
    interactiveRandomResult: JsonObject | None = None
    lineupSubmissions: dict[Side, Lineup | None] = field(default_factory=lambda: {"left": None, "right": None})
    scoreProposal: JsonObject | None = None
    restSkip: dict[str, bool] = field(default_factory=lambda: {"left": False, "right": False})
    timedOut: bool = False
    awaitingAdminDecision: bool = False

    def to_dict(self) -> RoomRuntimeData:
        return deepcopy(asdict(self))
