from __future__ import annotations

import os
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
STATIC_DIR = ROOT / "static"
CONFIG_DOCS_DIR = STATIC_DIR / "config"
ASSETS_DATA_PATH = ROOT / "backend" / "data" / "assets.json"
MAPS_DATA_PATH = ROOT / "backend" / "data" / "maps.json"
BUNDLED_TRANSLATION_PATH = ROOT / "backend" / "data" / "catalog_translation.zh-CN.json"
MAP_PLACEHOLDER = "/static/placeholders/map-blank.svg"
HERO_PLACEHOLDER = "/static/placeholders/hero-blank.svg"
SETTINGS_PRESET_PATH = ROOT / "backend" / "data" / "settings_preset.json"
SETTINGS_PRESETS_PATH = ROOT / "backend" / "data" / "settings_presets.json"
RUNTIME_DATA_DIR = Path(os.environ.get("OW_RUNTIME_DIR", ROOT / "backend" / "data" / "runtime"))
ROOM_STORE_PATH = RUNTIME_DATA_DIR / "rooms.json"
ROOM_HISTORY_DIR = RUNTIME_DATA_DIR / "room_history"
ROOM_HISTORY_INDEX_PATH = RUNTIME_DATA_DIR / "room_history_index.json"
CONFIG_PRESETS_DIR = RUNTIME_DATA_DIR / "config_presets"
RUNTIME_CATALOG_DIR = RUNTIME_DATA_DIR / "catalog"

ROOM_ROLES = {
    "A": {"role": "blue-team", "label": "队伍1入口", "side": "left"},
    "B": {"role": "red-team", "label": "队伍2入口", "side": "right"},
    "C": {"role": "admin", "label": "房间管理员入口", "side": None},
    "D": {"role": "broadcast", "label": "直播入口", "side": None},
}
ROOM_STORE_SCHEMA_VERSION = 2
ROOM_HISTORY_SCHEMA_VERSION = 1
ROOM_HISTORY_INDEX_SCHEMA_VERSION = 1
SHORT_CODE_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
SHORT_CODE_LENGTH = 4
SHORT_CODE_PATTERN = re.compile(r"^[0-9a-z]{4}$")
ARCHIVE_KEY_PATTERN = re.compile(r"^[0-9a-z]{4}(?:-[0-9a-z]{4}){3}$")
CONFIG_PRESET_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
OPERATION_PART_PATTERN = re.compile(r"^[a-z0-9_]{1,64}$")

# Visiting this fixed, unlisted URL creates a room without applying the per-IP limit.
# Set OW_UNLIMITED_CREATE_HASH when deploying if this URL needs to be rotated.
DEFAULT_UNLIMITED_CREATE_HASH = "4b7dc102e5fa8c39b6d1e4f0729a5cb8e3f61d94a70c2be58f39d6a1c4e8072b"
MAX_SHORT_CODE_ATTEMPTS = 10_000
PORTAL_PRESENCE_TTL_SECONDS = 5
ALLOWED_OPERATION_CATEGORIES = {
    "room", "settings", "map", "lineup", "ban", "score", "rest", "pause", "notice", "ui",
}
DEFAULT_GLOBAL_SETTINGS = {
    "roomsPerHour": 5,
    "inactiveTimeoutMinutes": 30,
    "notificationDurationSeconds": 20,
    "defaultSettings": None,
    "defaultPresetId": None,
}
