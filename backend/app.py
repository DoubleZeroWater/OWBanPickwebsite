from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import threading
import time
import unicodedata
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, redirect, request, send_from_directory


ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
STATIC_DIR = ROOT / "static"
ASSETS_DATA_PATH = ROOT / "backend" / "data" / "assets.json"
MAPS_DATA_PATH = ROOT / "backend" / "data" / "maps.json"
ASSET_SCRIPT_PATH = ROOT / "scripts" / "scrape_assets.py"
MAP_PLACEHOLDER = "/static/placeholders/map-blank.svg"
HERO_PLACEHOLDER = "/static/placeholders/hero-blank.svg"
SETTINGS_PRESET_PATH = ROOT / "backend" / "data" / "settings_preset.json"
SETTINGS_PRESETS_PATH = ROOT / "backend" / "data" / "settings_presets.json"
ROOM_STORE_PATH = ROOT / "backend" / "data" / "runtime" / "rooms.json"
ROOM_ROLES = {
    "A": {"role": "red-team", "label": "红队入口", "side": "right"},
    "B": {"role": "blue-team", "label": "蓝队入口", "side": "left"},
    "C": {"role": "admin", "label": "房间管理员入口", "side": None},
    "D": {"role": "broadcast", "label": "直播入口", "side": None},
}
DEFAULT_GLOBAL_SETTINGS = {
    "roomsPerHour": 5,
    "inactiveTimeoutMinutes": 30,
    "defaultSettings": None,
}
room_store_lock = threading.Lock()


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

    @app.get("/")
    def index() -> Any:
        return frontend_page()

    @app.get("/r/<room_token>")
    def room_page(room_token: str) -> Any:
        return frontend_page()

    @app.get("/admin/<admin_hash>")
    def admin_page(admin_hash: str) -> Any:
        return frontend_page()

    @app.get("/<portal_code>")
    def match_portal_page(portal_code: str) -> Any:
        if portal_code.upper() not in {"A", "B", "C", "D"}:
            return redirect("/")

        return frontend_page()

    def frontend_page() -> Any:
        if not (DIST_DIR / "index.html").exists():
            return (
                "Frontend assets are missing. Run `npm install` and `npm run build` "
                "before opening this site.",
                503,
            )
        return send_from_directory(DIST_DIR, "index.html")

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str) -> Any:
        return send_from_directory(DIST_DIR / "assets", filename)

    @app.get("/api/matches/<room_code>/state")
    def match_state(room_code: str) -> Any:
        return jsonify(build_match_state(room_code))

    @app.get("/api/maps/catalog")
    def maps_catalog() -> Any:
        return jsonify(build_maps_catalog())

    @app.get("/api/settings/preset")
    def get_settings_preset() -> Any:
        return jsonify(load_settings_preset())

    @app.post("/api/settings/preset")
    def save_settings_preset() -> Any:
        from flask import request

        payload = request.get_json(silent=True) or {}
        name = str(payload.get("name") or "默认预设").strip() or "默认预设"
        settings = payload.get("settings", payload)
        presets_payload = load_settings_preset()
        presets = presets_payload.setdefault("presets", {})
        presets[name] = settings
        presets_payload["last"] = name
        SETTINGS_PRESETS_PATH.parent.mkdir(parents=True, exist_ok=True)
        with SETTINGS_PRESETS_PATH.open("w", encoding="utf-8") as file:
            json.dump(presets_payload, file, ensure_ascii=False, indent=2)
        return jsonify({"ok": True, "name": name})

    @app.post("/api/rooms")
    def create_room() -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            client_ip = get_client_ip()
            creation_window = prune_creation_window_unlocked(store, client_ip, now)
            limit = int(store["globalSettings"].get("roomsPerHour") or DEFAULT_GLOBAL_SETTINGS["roomsPerHour"])

            if len(creation_window) >= limit:
                return jsonify({"error": "rate_limited", "limit": limit}), 429

            room = create_room_record_unlocked(store, now)
            creation_window.append(now)
            store.setdefault("createLog", {})[client_ip] = creation_window
            save_room_store_unlocked(store)

        return jsonify(format_created_room(room))

    @app.get("/api/rooms/token/<room_token>")
    def get_room_token(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            lookup = find_room_by_token_unlocked(store, room_token)

            if not lookup:
                save_room_store_unlocked(store)
                return jsonify({"error": "not_found"}), 404

            room, portal_code = lookup

            if room.get("closedAt"):
                save_room_store_unlocked(store)
                return jsonify({"error": "closed"}), 410

            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)

        return jsonify(format_room_token_payload(room, portal_code))

    @app.get("/api/rooms/token/<room_token>/snapshot")
    def get_room_snapshot(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            lookup = find_room_by_token_unlocked(store, room_token)

            if not lookup:
                save_room_store_unlocked(store)
                return jsonify({"error": "not_found"}), 404

            room, _portal_code = lookup

            if room.get("closedAt"):
                save_room_store_unlocked(store)
                return jsonify({"error": "closed"}), 410

            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)

        return jsonify({"version": room.get("version", 0), "snapshot": room.get("snapshot")})

    @app.put("/api/rooms/token/<room_token>/snapshot")
    def update_room_snapshot(room_token: str) -> Any:
        payload = request.get_json(silent=True) or {}
        expected_version = payload.get("version")

        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            lookup = find_room_by_token_unlocked(store, room_token)

            if not lookup:
                save_room_store_unlocked(store)
                return jsonify({"error": "not_found"}), 404

            room, _portal_code = lookup

            if room.get("closedAt"):
                save_room_store_unlocked(store)
                return jsonify({"error": "closed"}), 410

            current_version = int(room.get("version") or 0)

            if isinstance(expected_version, int) and expected_version != current_version:
                save_room_store_unlocked(store)
                return jsonify({"error": "version_conflict", "version": current_version, "snapshot": room.get("snapshot")}), 409

            room["snapshot"] = payload.get("snapshot")
            room["version"] = current_version + 1
            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)

        return jsonify({"ok": True, "version": room["version"]})

    @app.get("/api/admin/<admin_hash>/rooms")
    def admin_rooms(admin_hash: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            save_room_store_unlocked(store)

        return jsonify({"rooms": [format_admin_room(room) for room in store.get("rooms", [])]})

    @app.post("/api/admin/<admin_hash>/rooms/<room_id>/close")
    def admin_close_room(admin_hash: str, room_id: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            room = next((entry for entry in store.get("rooms", []) if entry.get("id") == room_id), None)

            if not room:
                return jsonify({"error": "not_found"}), 404

            room["closedAt"] = room.get("closedAt") or current_timestamp()
            save_room_store_unlocked(store)

        return jsonify({"ok": True})

    @app.get("/api/admin/<admin_hash>/settings")
    def get_admin_settings(admin_hash: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

        return jsonify(store.get("globalSettings", DEFAULT_GLOBAL_SETTINGS))

    @app.put("/api/admin/<admin_hash>/settings")
    def update_admin_settings(admin_hash: str) -> Any:
        payload = request.get_json(silent=True) or {}

        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            settings = store.setdefault("globalSettings", dict(DEFAULT_GLOBAL_SETTINGS))
            settings["roomsPerHour"] = clamp_int(payload.get("roomsPerHour"), 1, 500, settings.get("roomsPerHour", 5))
            settings["inactiveTimeoutMinutes"] = clamp_int(
                payload.get("inactiveTimeoutMinutes"),
                1,
                60 * 24 * 30,
                settings.get("inactiveTimeoutMinutes", 30),
            )

            if "defaultSettings" in payload:
                settings["defaultSettings"] = payload.get("defaultSettings")

            save_room_store_unlocked(store)

        return jsonify(settings)

    return app


def current_timestamp() -> int:
    return int(time.time())


def load_room_store_unlocked() -> dict[str, Any]:
    if ROOM_STORE_PATH.exists():
        with ROOM_STORE_PATH.open(encoding="utf-8") as file:
            store = json.load(file)
    else:
        store = {}

    admin_hash = os.environ.get("OW_ADMIN_HASH") or store.get("adminHash") or generate_hash()
    global_settings = {
        **DEFAULT_GLOBAL_SETTINGS,
        **(store.get("globalSettings") if isinstance(store.get("globalSettings"), dict) else {}),
    }
    store = {
        "adminHash": admin_hash,
        "globalSettings": global_settings,
        "createLog": store.get("createLog") if isinstance(store.get("createLog"), dict) else {},
        "rooms": store.get("rooms") if isinstance(store.get("rooms"), list) else [],
    }

    return store


def save_room_store_unlocked(store: dict[str, Any]) -> None:
    ROOM_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = ROOM_STORE_PATH.with_suffix(".tmp")

    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(store, file, ensure_ascii=False, indent=2)

    os.replace(temporary_path, ROOM_STORE_PATH)


def initialize_room_store() -> None:
    with room_store_lock:
        store = load_room_store_unlocked()
        save_room_store_unlocked(store)
        print(f"Global admin URL: /admin/{store['adminHash']}")


def generate_hash() -> str:
    return secrets.token_urlsafe(24)


def create_room_record_unlocked(store: dict[str, Any], now: int) -> dict[str, Any]:
    existing_ids = {room.get("id") for room in store.get("rooms", [])}
    room_id = generate_hash()

    while room_id in existing_ids:
        room_id = generate_hash()

    tokens = {portal_code: generate_hash() for portal_code in ROOM_ROLES}
    room = {
        "id": room_id,
        "tokens": tokens,
        "createdAt": now,
        "lastActiveAt": now,
        "closedAt": None,
        "version": 0,
        "snapshot": None,
        "settings": store.get("globalSettings", {}).get("defaultSettings"),
    }
    store.setdefault("rooms", []).append(room)
    return room


def get_client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")

    if forwarded:
        return forwarded.split(",", 1)[0].strip()

    return request.remote_addr or "unknown"


def prune_creation_window_unlocked(store: dict[str, Any], client_ip: str, now: int) -> list[int]:
    create_log = store.setdefault("createLog", {})
    window_start = now - 3600
    timestamps = [int(value) for value in create_log.get(client_ip, []) if int(value) >= window_start]
    create_log[client_ip] = timestamps
    return timestamps


def cleanup_inactive_rooms_unlocked(store: dict[str, Any], now: int) -> None:
    timeout_minutes = int(store.get("globalSettings", {}).get("inactiveTimeoutMinutes") or 30)
    timeout_seconds = timeout_minutes * 60

    for room in store.get("rooms", []):
        if room.get("closedAt"):
            continue

        last_active = int(room.get("lastActiveAt") or room.get("createdAt") or now)

        if now - last_active > timeout_seconds:
            room["closedAt"] = now


def touch_room_unlocked(room: dict[str, Any], now: int) -> None:
    room["lastActiveAt"] = now


def find_room_by_token_unlocked(store: dict[str, Any], token: str) -> tuple[dict[str, Any], str] | None:
    for room in store.get("rooms", []):
        tokens = room.get("tokens") if isinstance(room.get("tokens"), dict) else {}

        for portal_code, room_token in tokens.items():
            if secrets.compare_digest(str(room_token), token):
                return room, portal_code

    return None


def is_admin_hash_valid_unlocked(store: dict[str, Any], admin_hash: str) -> bool:
    return secrets.compare_digest(str(store.get("adminHash") or ""), admin_hash)


def format_created_room(room: dict[str, Any]) -> dict[str, Any]:
    return {
        "roomId": room["id"],
        "createdAt": room["createdAt"],
        "lastActiveAt": room["lastActiveAt"],
        "links": format_room_links(room),
    }


def format_room_links(room: dict[str, Any]) -> dict[str, Any]:
    tokens = room.get("tokens", {})
    base_url = request.host_url.rstrip("/")

    return {
        portal_code: {
            **ROOM_ROLES[portal_code],
            "hash": tokens.get(portal_code),
            "url": f"{base_url}/r/{tokens.get(portal_code)}",
        }
        for portal_code in ROOM_ROLES
    }


def format_room_token_payload(room: dict[str, Any], portal_code: str) -> dict[str, Any]:
    return {
        "room": {
            "id": room.get("id"),
            "createdAt": room.get("createdAt"),
            "lastActiveAt": room.get("lastActiveAt"),
            "closedAt": room.get("closedAt"),
            "settings": room.get("settings"),
        },
        "portal": {"code": portal_code, **ROOM_ROLES[portal_code]},
        "version": room.get("version", 0),
        "snapshot": room.get("snapshot"),
    }


def format_admin_room(room: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": room.get("id"),
        "createdAt": room.get("createdAt"),
        "lastActiveAt": room.get("lastActiveAt"),
        "closedAt": room.get("closedAt"),
        "version": room.get("version", 0),
        "links": format_room_links(room),
    }


def clamp_int(value: Any, minimum: int, maximum: int, fallback: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = int(fallback)

    return max(minimum, min(maximum, number))


def build_match_state(room_code: str) -> dict[str, Any]:
    """Return the display model for the tournament admin match page."""

    assets = load_assets()

    return {
        "roomCode": room_code,
        "matchName": "OW Ban Pick Invitational",
        "phase": "after",
        "currentCountdownSeconds": 116,
        "currentOperation": "等待赛事管理员根据选择设置下一张地图",
        "teams": {
            "left": {
                "id": "team-a",
                "name": "蓝色方",
                "seriesScore": 1,
                "seed": 1,
            },
            "right": {
                "id": "team-b",
                "name": "红色方",
                "seriesScore": 0,
                "seed": 2,
            },
        },
        "maps": [
            {
                "id": "lijang-tower",
                "mode": "Control",
                "modeIconUrl": mode_icon(assets, "Control"),
                "nameZh": "漓江塔",
                "nameEn": "Lijiang Tower",
                "status": "completed",
                "imageUrl": map_image(assets, "Control", "Lijiang Tower"),
                "score": {"left": 2, "right": 1},
                "bans": {
                    "left": hero_ban(assets, "Ana", "安娜", "支援"),
                    "right": hero_ban(assets, "Tracer", "猎空", "输出"),
                },
                "firstBanSide": "left",
            },
            {
                "id": "kings-row",
                "mode": "Hybrid",
                "modeIconUrl": mode_icon(assets, "Hybrid"),
                "nameZh": "国王大道",
                "nameEn": "King's Row",
                "status": "after",
                "imageUrl": map_image(assets, "Hybrid", "King's Row"),
                "score": {"left": None, "right": None},
                "bans": {
                    "left": hero_ban(assets, "Mauga", "毛加", "重装"),
                    "right": hero_ban(assets, "Lúcio", "卢西奥", "支援"),
                },
                "firstBanSide": "right",
            },
            {
                "id": "tbd-3",
                "mode": None,
                "modeIconUrl": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": MAP_PLACEHOLDER,
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
            {
                "id": "tbd-4",
                "mode": None,
                "modeIconUrl": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": MAP_PLACEHOLDER,
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
            {
                "id": "tbd-5",
                "mode": None,
                "modeIconUrl": None,
                "nameZh": None,
                "nameEn": None,
                "status": "tbd",
                "imageUrl": MAP_PLACEHOLDER,
                "score": {"left": None, "right": None},
                "bans": {"left": None, "right": None},
                "firstBanSide": None,
            },
        ],
    }


def build_maps_catalog() -> dict[str, Any]:
    assets = load_assets()
    maps = assets.get("maps", {})

    return {
        "modes": assets.get("modes") or list(maps.keys()),
        "modeIcons": assets.get("modeIcons", {}),
        "maps": maps,
        "heroes": assets.get("heroes", []),
    }


def refresh_static_assets() -> None:
    if os.environ.get("OW_REFRESH_ASSETS_ON_STARTUP", "").lower() not in {"1", "true", "yes"}:
        return

    if not ASSET_SCRIPT_PATH.exists():
        return

    try:
        result = subprocess.run(
            [sys.executable, str(ASSET_SCRIPT_PATH)],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
            timeout=180,
        )
    except Exception as exc:
        print(f"Asset refresh skipped: {exc}")
        return

    if result.stdout:
        print(result.stdout.strip())
    if result.returncode != 0:
        print(result.stderr.strip())
        print(f"Asset refresh exited with {result.returncode}; continuing with cached data.")



def load_settings_preset() -> dict[str, Any]:
    if SETTINGS_PRESETS_PATH.exists():
        with SETTINGS_PRESETS_PATH.open(encoding="utf-8") as file:
            return json.load(file)

    if SETTINGS_PRESET_PATH.exists():
        with SETTINGS_PRESET_PATH.open(encoding="utf-8") as file:
            return {"presets": {"默认预设": json.load(file)}, "last": "默认预设"}
    return {"presets": {}, "last": None}

def load_assets() -> dict[str, Any]:
    if ASSETS_DATA_PATH.exists():
        with ASSETS_DATA_PATH.open(encoding="utf-8") as file:
            return json.load(file)

    if not MAPS_DATA_PATH.exists():
        return {}

    with MAPS_DATA_PATH.open(encoding="utf-8") as file:
        payload = json.load(file)

    return {"maps": payload.get("maps", {}), "modeIcons": {}, "heroes": []}


def map_catalog(assets: dict[str, Any]) -> dict[str, dict[str, str]]:
    catalog: dict[str, dict[str, str]] = {}
    for mode, maps in assets.get("maps", {}).items():
        for map_info in maps:
            catalog[f"{mode}:{map_info['nameEn']}"] = map_info
    return catalog


def hero_catalog(assets: dict[str, Any]) -> dict[str, dict[str, str]]:
    catalog: dict[str, dict[str, str]] = {}
    for hero in assets.get("heroes", []):
        catalog[normalize_key(hero["nameEn"])] = hero
    return catalog


def map_image(assets: dict[str, Any], mode: str, name_en: str) -> str:
    return map_catalog(assets).get(f"{mode}:{name_en}", {}).get(
        "imageUrl",
        MAP_PLACEHOLDER,
    )


def mode_icon(assets: dict[str, Any], mode: str) -> str | None:
    return assets.get("modeIcons", {}).get(mode, {}).get("imageUrl")


def hero_ban(assets: dict[str, Any], name_en: str, name_zh: str, role: str) -> dict[str, str]:
    hero = hero_catalog(assets).get(normalize_key(name_en), {})
    return {
        "hero": name_zh,
        "nameEn": name_en,
        "role": role,
        "imageUrl": hero.get("imageUrl", HERO_PLACEHOLDER),
    }


def normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    stripped = "".join(character for character in normalized if not unicodedata.combining(character))
    return "".join(character.lower() for character in stripped if character.isalnum())


refresh_static_assets()
initialize_room_store()
app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5174, debug=True, use_reloader=False)
