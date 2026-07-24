from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from copy import deepcopy
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping


SIDES = ("left", "right")
PORTAL_SIDES = {"A": "left", "B": "right", "C": None, "D": None}
PORTAL_ROLES = {"A": "blue-team", "B": "red-team", "C": "admin", "D": "broadcast"}
MATCH_WINS = {"ft2": 2, "ft3": 3, "ft4": 4}
MAP_SLOTS = {"ft2": 5, "ft3": 7, "ft4": 9}


class StateValidationError(ValueError):
    def __init__(self, errors: list[dict[str, str]]):
        super().__init__("Invalid authoritative state")
        self.errors = errors


def stable_id(value: Any) -> str:
    text = str(value or "").strip().lower().replace("'", "")
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text or "unknown"


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def status_hash(value: Mapping[str, Any]) -> str:
    payload = {key: deepcopy(item) for key, item in value.items() if key != "hash"}
    digest = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


def other_side(side: str) -> str:
    return "right" if side == "left" else "left"


def hero_pool_from_catalog(heroes: Any) -> dict[str, list[str]]:
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


def catalog_hero_id(value: Any) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(
        character.lower()
        for character in normalized
        if not unicodedata.combining(character) and character.isascii() and character.isalnum()
    )


def bundled_hero_pool() -> dict[str, list[str]]:
    assets_path = Path(__file__).resolve().parent / "data" / "assets.json"
    try:
        with assets_path.open(encoding="utf-8") as file:
            assets = json.load(file)
    except (OSError, json.JSONDecodeError):
        return {"tank": [], "damage": [], "support": []}
    return hero_pool_from_catalog(assets.get("heroes") if isinstance(assets, dict) else [])


def default_config(hero_pool: Mapping[str, list[str]] | None = None) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "matchName": "OW Ban Pick Invitational",
        "teams": {"left": "队伍 1", "right": "队伍 2"},
        "matchFormat": "ft2",
        "drawMapReserve": 2,
        "startWithDefaultConfig": False,
        "teamsCanEditOwnName": False,
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
            "control": ["lijiang_tower", "ilios"],
            "escort": ["circuit_royal", "dorado"],
            "hybrid": ["kings_row", "hollywood"],
            "push": ["colosseo", "new_queen_street"],
            "flashpoint": ["suravasa", "new_junk_city"],
        },
        "mapSelectionMode": "first_mode_then_unique_mode",
        "firstMapMode": "control",
        "modeOrder": ["control", "push", "hybrid", "escort", "flashpoint"],
        "fixedMapOrder": [],
        "fixedFirstMapEnabled": False,
        "fixedFirstMapId": "lijiang_tower",
        "firstMapPickerPolicy": "interactive_random",
        "firstSideChoicePolicy": "map_picker",
        "mapPickerPolicy": "loser_choose",
        "mapTimeoutPolicy": "warn_extend_30",
        "symmetricSideChoiceEnabled": True,
        "subsequentSideChoicePolicy": "previous_loser",
        "heroPool": deepcopy(dict(hero_pool if hero_pool is not None else bundled_hero_pool())),
        "rosterMode": "free_input",
        "lineupSlots": [
            {"id": "tank", "role": "tank", "label": "重装"},
            {"id": "damage_1", "role": "damage", "label": "输出 1"},
            {"id": "damage_2", "role": "damage", "label": "输出 2"},
            {"id": "support_1", "role": "support", "label": "支援 1"},
            {"id": "support_2", "role": "support", "label": "支援 2"},
        ],
        "presetRosters": {"left": [], "right": []},
        "lineupTimeoutPolicy": "warn_extend_30",
        "banEnabled": True,
        "bansPerSide": 1,
        "firstBanPolicy": "allow_loser_choose",
        "openingSidePolicy": "follow_map_picker",
        "banTimeoutPolicy": "warn_extend_30",
        "scoreReportMode": "team_submit_opponent_confirm",
        "scoreTimeoutPolicy": "auto_confirm_submitted",
        "history": {
            "recordPolicy": "major_status_revision",
            "rollbackPolicy": "any_recorded_revision",
        },
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


def _legacy_config(value: Mapping[str, Any]) -> dict[str, Any]:
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


def normalize_config(
    value: Any,
    *,
    accept_legacy: bool = False,
    hero_pool: Mapping[str, list[str]] | None = None,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise StateValidationError([{"path": "$", "message": "配置必须是对象"}])
    source: dict[str, Any] = deepcopy(value.get("config") if isinstance(value.get("config"), dict) else value)
    if accept_legacy and (
        source.get("schemaVersion") != 1
        or any(key in source for key in ("stageCount", "checkpoints", "fixedMapOrderText", "fixedFirstMapName", "presetRosterText"))
    ):
        source = _legacy_config(source)
    defaults = default_config(hero_pool)
    result = deepcopy(defaults)
    errors: list[dict[str, str]] = []

    allowed = set(defaults)
    unknown = sorted(set(source) - allowed)
    if unknown:
        errors.append({"path": "$", "message": f"不支持的配置字段：{', '.join(unknown)}"})

    for key in ("matchName",):
        item = source.get(key, result[key])
        if not isinstance(item, str) or not item.strip() or len(item.strip()) > 120:
            errors.append({"path": key, "message": "必须是 1 到 120 个字符"})
        else:
            result[key] = item.strip()
    teams = source.get("teams", result["teams"])
    if not isinstance(teams, dict):
        errors.append({"path": "teams", "message": "必须是对象"})
    else:
        for side in SIDES:
            name = teams.get(side, result["teams"][side])
            if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
                errors.append({"path": f"teams.{side}", "message": "必须是 1 到 60 个字符"})
            else:
                result["teams"][side] = name.strip()

    for key, choices in ENUMS.items():
        item = source.get(key, result[key])
        if item not in choices:
            errors.append({"path": key, "message": f"必须是：{' | '.join(sorted(choices))}"})
        else:
            result[key] = item
    for key in ("startWithDefaultConfig", "teamsCanEditOwnName", "fixedFirstMapEnabled", "symmetricSideChoiceEnabled", "banEnabled"):
        item = source.get(key, result[key])
        if not isinstance(item, bool):
            errors.append({"path": key, "message": "必须是布尔值"})
        else:
            result[key] = item

    for key, minimum, maximum in (("drawMapReserve", 0, 10), ("bansPerSide", 1, 3)):
        item = source.get(key, result[key])
        if isinstance(item, bool) or not isinstance(item, int) or not minimum <= item <= maximum:
            errors.append({"path": key, "message": f"必须是 {minimum} 到 {maximum} 的整数"})
        else:
            result[key] = item

    limits = source.get("stageLimits", result["stageLimits"])
    if not isinstance(limits, dict):
        errors.append({"path": "stageLimits", "message": "必须是对象"})
    else:
        for key, fallback in result["stageLimits"].items():
            item = limits.get(key, fallback)
            minimum = 0 if key in {"preStartRestSeconds", "postMatchRestSeconds"} else 1
            if isinstance(item, bool) or not isinstance(item, int) or not minimum <= item <= 3600:
                errors.append({"path": f"stageLimits.{key}", "message": f"必须是 {minimum} 到 3600 的整数"})
            else:
                result["stageLimits"][key] = item

    for key in ("mapPool", "heroPool"):
        item = source.get(key, result[key])
        if not isinstance(item, dict) or not item:
            errors.append({"path": key, "message": "必须是非空对象"})
            continue
        normalized: dict[str, list[str]] = {}
        for group, entries in item.items():
            if not isinstance(group, str) or not isinstance(entries, list):
                errors.append({"path": f"{key}.{group}", "message": "必须是 ID 数组"})
                continue
            values = list(dict.fromkeys(stable_id(entry) for entry in entries if isinstance(entry, str) and entry.strip()))
            if values:
                normalized[stable_id(group)] = values
        if normalized:
            result[key] = normalized

    for key in ("modeOrder", "fixedMapOrder"):
        item = source.get(key, result[key])
        if not isinstance(item, list) or any(not isinstance(entry, str) for entry in item):
            errors.append({"path": key, "message": "必须是 ID 数组"})
        else:
            result[key] = [stable_id(entry) for entry in item]
    for key in ("firstMapMode", "fixedFirstMapId"):
        item = source.get(key, result[key])
        if not isinstance(item, str) or not item.strip():
            errors.append({"path": key, "message": "必须是非空 ID"})
        else:
            result[key] = stable_id(item)

    slots = source.get("lineupSlots", result["lineupSlots"])
    if not isinstance(slots, list) or not slots:
        errors.append({"path": "lineupSlots", "message": "必须是非空数组"})
    else:
        normalized_slots = []
        seen: set[str] = set()
        for index, slot in enumerate(slots):
            if not isinstance(slot, dict) or slot.get("role") not in {"tank", "damage", "support"}:
                errors.append({"path": f"lineupSlots[{index}]", "message": "阵容位无效"})
                continue
            slot_id = stable_id(slot.get("id"))
            if slot_id in seen:
                errors.append({"path": f"lineupSlots[{index}].id", "message": "阵容位 ID 重复"})
                continue
            seen.add(slot_id)
            normalized_slots.append({"id": slot_id, "role": slot["role"], "label": str(slot.get("label") or slot_id)[:60]})
        if normalized_slots:
            result["lineupSlots"] = normalized_slots

    rosters = source.get("presetRosters", result["presetRosters"])
    if not isinstance(rosters, dict):
        errors.append({"path": "presetRosters", "message": "必须是对象"})
    else:
        for side in SIDES:
            entries = rosters.get(side, [])
            if not isinstance(entries, list) or any(not isinstance(entry, str) for entry in entries):
                errors.append({"path": f"presetRosters.{side}", "message": "必须是字符串数组"})
            else:
                result["presetRosters"][side] = list(dict.fromkeys(entry.strip() for entry in entries if entry.strip()))

    history = source.get("history", result["history"])
    if history != defaults["history"]:
        errors.append({"path": "history", "message": "当前版本只支持 major_status_revision/any_recorded_revision"})
    result["schemaVersion"] = 1
    if result["fixedFirstMapEnabled"] and result["openingSidePolicy"] == "follow_map_picker":
        errors.append({"path": "openingSidePolicy", "message": "固定首图时不能跟随选图方"})
    if result["fixedFirstMapEnabled"] and result["firstSideChoicePolicy"] == "map_picker":
        errors.append({"path": "firstSideChoicePolicy", "message": "固定首图时不能由选图方选边"})
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
    config: dict[str, Any]
    match: dict[str, Any]
    phase: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return deepcopy(asdict(self))

    def seal(self) -> None:
        self.hash = status_hash(self.to_dict())

    @classmethod
    def initial(cls, room_id: str, config: dict[str, Any], catalog_hash: str = "") -> "RoomStatus":
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
                    side: {"id": f"team-{side}", "name": config["teams"][side], "seed": index + 1, "seriesScore": 0}
                    for index, side in enumerate(SIDES)
                },
                "decisions": {"firstMapPickerSide": None, "firstMapSidePickerSide": None, "openingBanSide": None},
                "winnerSide": None,
                "maps": maps,
            },
            phase={"phaseId": "", "type": "configuring", "mapIndex": None, "actorSide": None, "data": {}},
        )
        status.phase["phaseId"] = f"{status.epoch}:{status.revision}:configuring:initial"
        status.seal()
        return status


def empty_map(index: int) -> dict[str, Any]:
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
        "winnerSide": None,
        "forfeitSide": None,
        "forfeitReason": None,
    }


@dataclass
class RoomRuntime:
    baseStatusRevision: int
    baseStatusHash: str
    phaseId: str
    totalTimeMs: int = 0
    remainingTimeMs: int = 0
    pause: dict[str, Any] = field(default_factory=lambda: {
        "global": {"active": False, "totalMs": 0},
        "scoreTeams": {
            "left": {"active": False, "phaseTotalMs": 0, "matchTotalMs": 0, "count": 0},
            "right": {"active": False, "phaseTotalMs": 0, "matchTotalMs": 0, "count": 0},
        },
    })
    presence: dict[str, Any] = field(default_factory=dict)
    interactiveRandom: dict[str, Any] | None = None
    interactiveRandomResult: dict[str, Any] | None = None
    lineupSubmissions: dict[str, Any] = field(default_factory=lambda: {"left": None, "right": None})
    scoreProposal: dict[str, Any] | None = None
    restSkip: dict[str, bool] = field(default_factory=lambda: {"left": False, "right": False})
    timedOut: bool = False
    awaitingAdminDecision: bool = False

    def to_dict(self) -> dict[str, Any]:
        return deepcopy(asdict(self))
