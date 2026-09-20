from __future__ import annotations

import json
import re
import secrets
import shutil
import time
from copy import deepcopy
from pathlib import Path

from backend.application.catalog_service import (
    current_hero_pool,
    current_map_capabilities,
    load_settings_preset,
    normalize_key,
)
from backend.config import CONFIG_PRESET_ID_PATTERN, CONFIG_PRESETS_DIR, DEFAULT_GLOBAL_SETTINGS
from backend.domain.contracts import ConfigPreset, ConfigSource, JsonObject, RoomConfigState, RoomRecord, RoomStore
from backend.domain.state_models import StateValidationError, default_config, normalize_config
from backend.infrastructure.json_store import save_json_atomic


def get_config_preset_path(preset_id: str) -> Path | None:
    return CONFIG_PRESETS_DIR / f"{preset_id}.json" if CONFIG_PRESET_ID_PATTERN.fullmatch(preset_id) else None


def load_config_preset(preset_id: str) -> ConfigPreset | None:
    path = get_config_preset_path(preset_id)
    if path is None or not path.exists():
        return None
    with path.open(encoding="utf-8") as file:
        payload = json.load(file)
    return payload if isinstance(payload, dict) else None


def load_all_config_presets() -> list[ConfigPreset]:
    CONFIG_PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    presets: list[ConfigPreset] = []
    for path in CONFIG_PRESETS_DIR.glob("*.json"):
        try:
            with path.open(encoding="utf-8") as file:
                payload = json.load(file)
            if isinstance(payload, dict) and get_config_preset_path(str(payload.get("id") or "")) == path:
                presets.append(payload)
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(presets, key=lambda preset: (str(preset.get("name") or "").casefold(), str(preset.get("id") or "")))


def save_config_preset(payload: object, *, replace: bool) -> ConfigPreset:
    if not isinstance(payload, dict):
        raise ValueError("模板必须是 JSON 对象")
    preset_id = str(payload.get("id") or "").strip().lower()
    if not preset_id and not replace:
        for _ in range(20):
            candidate = secrets.token_hex(12)
            if load_config_preset(candidate) is None:
                preset_id = candidate
                break
    path = get_config_preset_path(preset_id)
    if path is None:
        raise ValueError("无法生成有效的模板标识")
    name = str(payload.get("name") or "").strip()
    description = str(payload.get("description") or "").strip()
    if not name or len(name) > 80:
        raise ValueError("模板名称必须是 1–80 个字符")
    if len(description) > 500:
        raise ValueError("模板说明不能超过 500 个字符")
    existing = load_config_preset(preset_id)
    if existing is not None and not replace:
        raise FileExistsError(preset_id)
    if existing is None and replace:
        raise FileNotFoundError(preset_id)
    normalized = normalize_config(
        payload.get("config", payload),
        accept_legacy=True,
        hero_pool=current_hero_pool(),
        map_capabilities=current_map_capabilities(),
    )
    now = int(time.time())
    preset: ConfigPreset = {
        "schemaVersion": 1,
        "id": preset_id,
        "name": name,
        "description": description,
        "revision": int(existing.get("revision") or 0) + 1 if existing else 1,
        "createdAt": int(existing.get("createdAt") or now) if existing else now,
        "updatedAt": now,
        "config": normalized,
    }
    save_json_atomic(path, preset)
    return preset


def build_room_config(value: object = None, source: ConfigSource | None = None) -> RoomConfigState:
    hero_pool = current_hero_pool()
    map_capabilities = current_map_capabilities()
    try:
        normalized = normalize_config(
            value if isinstance(value, dict) else {},
            accept_legacy=True,
            hero_pool=hero_pool,
            map_capabilities=map_capabilities,
        )
    except StateValidationError:
        normalized = default_config(hero_pool, map_capabilities)
    return {
        "status": "draft", "revision": 1,
        "source": source or {"type": "builtin"}, "value": normalized,
        "confirmedAt": None, "lockedAt": None,
    }


def ensure_room_config_unlocked(room: RoomRecord) -> RoomConfigState:
    config = room.get("config")
    if isinstance(config, dict) and isinstance(config.get("value"), dict):
        config.setdefault("status", "draft")
        config.setdefault("revision", 1)
        config.setdefault("source", {"type": "manual"})
        config.setdefault("confirmedAt", None)
        config.setdefault("lockedAt", None)
        return config
    snapshot = room.get("snapshot") if isinstance(room.get("snapshot"), dict) else {}
    settings = snapshot.get("settingsState") if isinstance(snapshot.get("settingsState"), dict) else room.get("settings")
    config = build_room_config(settings)
    if snapshot.get("roomStarted"):
        config["status"] = "locked"
        config["lockedAt"] = int(room.get("lastActiveAt") or time.time())
    room["config"] = config
    room["settings"] = deepcopy(config["value"])
    return config


def migrate_legacy_config_presets_unlocked(store: RoomStore) -> None:
    existing_ids = {preset["id"] for preset in load_all_config_presets()}
    legacy_payload: JsonObject = {"presets": {}}
    try:
        legacy_payload = load_settings_preset()
    except (OSError, json.JSONDecodeError):
        pass
    legacy_presets = legacy_payload.get("presets") if isinstance(legacy_payload, dict) else {}
    if not existing_ids and isinstance(legacy_presets, dict):
        for index, (name, config) in enumerate(legacy_presets.items(), start=1):
            base_id = re.sub(r"[^a-z0-9_-]+", "-", normalize_key(str(name))).strip("-") or f"legacy-{index}"
            preset_id, suffix = base_id[:64], 2
            while preset_id in existing_ids:
                preset_id, suffix = f"{base_id[:58]}-{suffix}", suffix + 1
            try:
                save_config_preset({
                    "id": preset_id, "name": str(name),
                    "description": "从旧命名预设自动迁移", "config": config,
                }, replace=False)
                existing_ids.add(preset_id)
            except (ValueError, StateValidationError, FileExistsError):
                continue

    settings = store.setdefault("globalSettings", dict(DEFAULT_GLOBAL_SETTINGS))
    inline_default = settings.get("defaultSettings")
    if isinstance(inline_default, dict) and not settings.get("defaultPresetId"):
        try:
            if "legacy-default" not in existing_ids:
                save_config_preset({
                    "id": "legacy-default", "name": "旧版全局默认配置",
                    "description": "从 rooms.json 自动迁移", "config": inline_default,
                }, replace=False)
            settings["defaultPresetId"] = "legacy-default"
        except (ValueError, StateValidationError, FileExistsError):
            pass


def migrate_authoritative_config_presets_unlocked() -> None:
    """Migrate legacy preset files once while retaining an adjacent backup."""
    for path in CONFIG_PRESETS_DIR.glob("*.json"):
        if ".legacy-v" in path.name:
            continue
        try:
            with path.open(encoding="utf-8") as file:
                preset = json.load(file)
            if not isinstance(preset, dict) or not isinstance(preset.get("config"), dict):
                continue
            config = preset["config"]
            if config.get("schemaVersion") == 1 and "drawMapReserve" in config and "lineupSlots" in config:
                continue
            normalized = normalize_config(
                config, accept_legacy=True,
                hero_pool=current_hero_pool(), map_capabilities=current_map_capabilities(),
            )
            backup = path.with_name(f"{path.stem}.legacy-v0.json")
            if not backup.exists():
                shutil.copy2(path, backup)
            preset.update(schemaVersion=2, config=normalized, migration={"from": "legacy", "usedCanonicalDefaults": True})
            save_json_atomic(path, preset)
        except (OSError, json.JSONDecodeError, StateValidationError):
            continue
