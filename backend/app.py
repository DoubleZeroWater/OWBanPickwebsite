from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
import unicodedata
from copy import deepcopy
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, redirect, request, send_file, send_from_directory

try:
    from backend.match_config import (
        MatchConfigValidationError,
        default_match_config,
        normalize_match_config,
    )
except ModuleNotFoundError:  # Support `python backend/app.py` from the repository root.
    from match_config import (  # type: ignore[no-redef]
        MatchConfigValidationError,
        default_match_config,
        normalize_match_config,
    )


ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
STATIC_DIR = ROOT / "static"
CONFIG_DOCS_DIR = STATIC_DIR / "config"
ASSETS_DATA_PATH = ROOT / "backend" / "data" / "assets.json"
MAPS_DATA_PATH = ROOT / "backend" / "data" / "maps.json"
ASSET_SCRIPT_PATH = ROOT / "scripts" / "scrape_assets.py"
MAP_PLACEHOLDER = "/static/placeholders/map-blank.svg"
HERO_PLACEHOLDER = "/static/placeholders/hero-blank.svg"
SETTINGS_PRESET_PATH = ROOT / "backend" / "data" / "settings_preset.json"
SETTINGS_PRESETS_PATH = ROOT / "backend" / "data" / "settings_presets.json"
RUNTIME_DATA_DIR = Path(os.environ.get("OW_RUNTIME_DIR", ROOT / "backend" / "data" / "runtime"))
ROOM_STORE_PATH = RUNTIME_DATA_DIR / "rooms.json"
ROOM_HISTORY_DIR = RUNTIME_DATA_DIR / "room_history"
ROOM_HISTORY_INDEX_PATH = RUNTIME_DATA_DIR / "room_history_index.json"
CONFIG_PRESETS_DIR = RUNTIME_DATA_DIR / "config_presets"
ROOM_ROLES = {
    "A": {"role": "red-team", "label": "红队入口", "side": "right"},
    "B": {"role": "blue-team", "label": "蓝队入口", "side": "left"},
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
MAX_SHORT_CODE_ATTEMPTS = 10_000
ALLOWED_OPERATION_CATEGORIES = {
    "room",
    "settings",
    "map",
    "lineup",
    "ban",
    "score",
    "rest",
    "pause",
    "notice",
    "ui",
}
DEFAULT_GLOBAL_SETTINGS = {
    "roomsPerHour": 5,
    "inactiveTimeoutMinutes": 30,
    "defaultSettings": None,
    "defaultPresetId": None,
}
room_store_lock = threading.Lock()


class CodeSpaceExhausted(RuntimeError):
    pass


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

    @app.get("/docs/config/<path:filename>")
    def config_document(filename: str) -> Any:
        if filename not in {"match-config.example.json", "match-config.schema.json", "match-config.md"}:
            return jsonify({"error": "not_found"}), 404
        return send_from_directory(CONFIG_DOCS_DIR, filename)

    @app.get("/api/settings/preset")
    def get_settings_preset() -> Any:
        presets = load_all_config_presets()
        return jsonify({
            "presets": {preset["name"]: preset["config"] for preset in presets},
            "last": presets[0]["name"] if presets else None,
        })

    @app.post("/api/settings/preset")
    def save_settings_preset() -> Any:
        return jsonify({"error": "global_admin_required"}), 403

    @app.get("/api/admin/<admin_hash>/config-presets")
    def admin_list_config_presets(admin_hash: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            return jsonify({"items": load_all_config_presets()})

    @app.post("/api/admin/<admin_hash>/config-presets")
    def admin_create_config_preset(admin_hash: str) -> Any:
        payload = request.get_json(silent=True) or {}
        with room_store_lock:
            store = load_room_store_unlocked()
            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            try:
                preset = save_config_preset(payload, replace=False)
            except MatchConfigValidationError as exc:
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            except FileExistsError:
                return jsonify({"error": "already_exists"}), 409
            except ValueError as exc:
                return jsonify({"error": "invalid_preset", "message": str(exc)}), 400
        return jsonify(preset), 201

    @app.put("/api/admin/<admin_hash>/config-presets/<preset_id>")
    def admin_update_config_preset(admin_hash: str, preset_id: str) -> Any:
        payload = request.get_json(silent=True) or {}
        payload = {**payload, "id": preset_id}
        with room_store_lock:
            store = load_room_store_unlocked()
            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            try:
                preset = save_config_preset(payload, replace=True)
            except MatchConfigValidationError as exc:
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            except FileNotFoundError:
                return jsonify({"error": "not_found"}), 404
            except ValueError as exc:
                return jsonify({"error": "invalid_preset", "message": str(exc)}), 400
        return jsonify(preset)

    @app.delete("/api/admin/<admin_hash>/config-presets/<preset_id>")
    def admin_delete_config_preset(admin_hash: str, preset_id: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            path = get_config_preset_path(preset_id)
            if path is None or not path.exists():
                return jsonify({"error": "not_found"}), 404
            path.unlink()
        return jsonify({"ok": True})

    @app.post("/api/rooms")
    def create_room() -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            store_changed = cleanup_inactive_rooms_unlocked(store, now)
            client_ip = get_client_ip()
            creation_window = prune_creation_window_unlocked(store, client_ip, now)
            limit = int(store["globalSettings"].get("roomsPerHour") or DEFAULT_GLOBAL_SETTINGS["roomsPerHour"])

            if len(creation_window) >= limit:
                if store_changed:
                    save_room_store_unlocked(store)
                return jsonify({"error": "rate_limited", "limit": limit}), 429

            try:
                room = create_room_record_unlocked(store, now)
            except CodeSpaceExhausted:
                if store_changed:
                    save_room_store_unlocked(store)
                return jsonify({"error": "code_space_exhausted"}), 503

            creation_window.append(now)
            store.setdefault("createLog", {})[client_ip] = creation_window

            try:
                save_room_store_unlocked(store)
            except Exception:
                rollback_created_room_unlocked(store, room)
                raise

        return jsonify(format_created_room(room))

    @app.get("/api/rooms/token/<room_token>")
    def get_room_token(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            store_changed = cleanup_inactive_rooms_unlocked(store, now)
            lookup = find_room_by_token_unlocked(store, room_token)

            if not lookup:
                if store_changed:
                    save_room_store_unlocked(store)
                if is_archived_token_unlocked(room_token):
                    return jsonify({"error": "closed"}), 410
                return jsonify({"error": "not_found"}), 404

            room, portal_code = lookup
            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)

        return jsonify(format_room_token_payload(room, portal_code))

    @app.get("/api/rooms/token/<room_token>/config-presets")
    def get_room_config_presets(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            _room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            return jsonify({"items": load_all_config_presets()})

    @app.get("/api/rooms/token/<room_token>/config")
    def get_room_config(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            room, _portal_code = lookup
            ensure_room_config_unlocked(room)
            save_room_store_unlocked(store)
            return jsonify(room["config"])

    @app.put("/api/rooms/token/<room_token>/config")
    def update_room_config(room_token: str) -> Any:
        payload = request.get_json(silent=True) or {}
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            config_state = ensure_room_config_unlocked(room)
            if config_state["status"] == "locked":
                return jsonify({"error": "config_locked"}), 409
            expected_revision = payload.get("revision")
            if isinstance(expected_revision, int) and expected_revision != config_state["revision"]:
                return jsonify({"error": "revision_conflict", "config": config_state}), 409
            try:
                normalized = normalize_match_config(payload.get("config", payload), load_assets().get("maps", {}))
            except MatchConfigValidationError as exc:
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            config_state["value"] = normalized
            config_state["status"] = "draft"
            config_state["revision"] += 1
            config_state["source"] = normalize_room_config_source(payload.get("source"))
            config_state["confirmedAt"] = None
            room["settings"] = normalized
            record_room_config_event_unlocked(room, "updated", portal_code)
            save_room_store_unlocked(store)
            return jsonify(config_state)

    @app.post("/api/rooms/token/<room_token>/config/apply-preset")
    def apply_room_config_preset(room_token: str) -> Any:
        payload = request.get_json(silent=True) or {}
        preset_id = str(payload.get("presetId") or "")
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            config_state = ensure_room_config_unlocked(room)
            if config_state["status"] == "locked":
                return jsonify({"error": "config_locked"}), 409
            preset = load_config_preset(preset_id)
            if preset is None:
                return jsonify({"error": "not_found"}), 404
            config_state["value"] = deepcopy(preset["config"])
            config_state["status"] = "draft"
            config_state["revision"] += 1
            config_state["source"] = {
                "type": "preset",
                "presetId": preset["id"],
                "presetName": preset["name"],
                "presetRevision": preset["revision"],
            }
            config_state["confirmedAt"] = None
            room["settings"] = deepcopy(preset["config"])
            record_room_config_event_unlocked(room, "preset_applied", portal_code, {"presetId": preset_id})
            save_room_store_unlocked(store)
            return jsonify(config_state)

    @app.post("/api/rooms/token/<room_token>/config/confirm")
    def confirm_room_config(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            config_state = ensure_room_config_unlocked(room)
            if config_state["status"] == "locked":
                return jsonify({"error": "config_locked"}), 409
            try:
                config_state["value"] = normalize_match_config(config_state["value"], load_assets().get("maps", {}))
            except MatchConfigValidationError as exc:
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            config_state["status"] = "ready"
            config_state["confirmedAt"] = current_timestamp()
            record_room_config_event_unlocked(room, "confirmed", portal_code)
            save_room_store_unlocked(store)
            return jsonify(config_state)

    @app.post("/api/rooms/token/<room_token>/start")
    def start_room(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            config_state = ensure_room_config_unlocked(room)
            if config_state["status"] != "ready":
                return jsonify({"error": "config_not_ready", "config": config_state}), 409
            config_state["status"] = "locked"
            config_state["lockedAt"] = current_timestamp()
            record_room_config_event_unlocked(room, "locked", portal_code)
            save_room_store_unlocked(store)
            return jsonify({"ok": True, "config": config_state, "version": room.get("version", 0)})

    @app.post("/api/rooms/token/<room_token>/rollback-to-config")
    def rollback_room_to_config(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            config_state = ensure_room_config_unlocked(room)
            config_state["status"] = "draft"
            config_state["revision"] += 1
            config_state["confirmedAt"] = None
            config_state["lockedAt"] = None
            next_version = int(room.get("version") or 0) + 1
            now = current_timestamp()
            append_room_history_unlocked(
                room,
                now,
                next_version,
                None,
                {"type": "portal", "portalCode": portal_code, "role": "admin"},
                {"category": "room", "action": "rolled_back_to_config", "details": {}},
            )
            room["snapshot"] = None
            room["version"] = next_version
            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)
            return jsonify({"ok": True, "config": config_state, "version": next_version})

    @app.get("/api/rooms/token/<room_token>/snapshot")
    def get_room_snapshot(room_token: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            store_changed = cleanup_inactive_rooms_unlocked(store, now)
            lookup = find_room_by_token_unlocked(store, room_token)

            if not lookup:
                if store_changed:
                    save_room_store_unlocked(store)
                if is_archived_token_unlocked(room_token):
                    return jsonify({"error": "closed"}), 410
                return jsonify({"error": "not_found"}), 404

            room, _portal_code = lookup
            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)

        return jsonify({"version": room.get("version", 0), "snapshot": room.get("snapshot")})

    @app.put("/api/rooms/token/<room_token>/snapshot")
    def update_room_snapshot(room_token: str) -> Any:
        payload = request.get_json(silent=True) or {}
        expected_version = payload.get("version")

        try:
            operation = normalize_operation(payload.get("operation"))
        except ValueError:
            return jsonify({"error": "invalid_operation"}), 400

        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            store_changed = cleanup_inactive_rooms_unlocked(store, now)
            lookup = find_room_by_token_unlocked(store, room_token)

            if not lookup:
                if store_changed:
                    save_room_store_unlocked(store)
                if is_archived_token_unlocked(room_token):
                    return jsonify({"error": "closed"}), 410
                return jsonify({"error": "not_found"}), 404

            room, portal_code = lookup

            config_state = ensure_room_config_unlocked(room)
            next_snapshot = payload.get("snapshot")
            if not isinstance(next_snapshot, dict):
                return jsonify({"error": "invalid_snapshot"}), 400
            if operation["category"] == "settings" and portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            if bool(next_snapshot.get("roomStarted")) and config_state["status"] != "locked":
                return jsonify({"error": "config_not_locked", "config": config_state}), 409
            if config_state["status"] == "locked" and not bool(next_snapshot.get("roomStarted")):
                return jsonify({"error": "config_locked"}), 409
            next_snapshot["settingsState"] = deepcopy(config_state["value"])

            current_version = int(room.get("version") or 0)

            if isinstance(expected_version, int) and expected_version != current_version:
                if store_changed:
                    save_room_store_unlocked(store)
                return jsonify({"error": "version_conflict", "version": current_version, "snapshot": room.get("snapshot")}), 409

            next_version = current_version + 1
            actor = {
                "type": "portal",
                "portalCode": portal_code,
                "role": ROOM_ROLES[portal_code]["role"],
            }
            append_room_history_unlocked(room, now, next_version, next_snapshot, actor, operation)
            room["snapshot"] = next_snapshot
            room["version"] = next_version
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

            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            room = next((entry for entry in store.get("rooms", []) if entry.get("id") == room_id), None)

            if not room:
                save_room_store_unlocked(store)
                return jsonify({"error": "not_found"}), 404

            close_room_unlocked(room, now, "manual")
            store["rooms"] = [entry for entry in store.get("rooms", []) if entry is not room]
            save_room_store_unlocked(store)

        return jsonify({"ok": True})

    @app.get("/api/admin/<admin_hash>/room-history")
    def admin_room_history(admin_hash: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            now = current_timestamp()
            cleanup_inactive_rooms_unlocked(store, now)
            save_room_store_unlocked(store)
            index = load_history_index_unlocked()
            active_rooms = {
                str(room.get("archiveKey")): room
                for room in store.get("rooms", [])
                if room.get("archiveKey")
            }
            items = []

            for summary in index.get("items", {}).values():
                item = dict(summary)
                active_room = active_rooms.get(str(item.get("archiveKey")))

                if active_room:
                    item["status"] = "active"
                    item["lastActiveAt"] = active_room.get("lastActiveAt")
                    item["currentVersion"] = active_room.get("version", 0)

                items.append(item)

            items.sort(key=lambda item: (int(item.get("createdAt") or 0), str(item.get("archiveKey") or "")), reverse=True)
            page = clamp_int(request.args.get("page"), 1, 1_000_000, 1)
            page_size = clamp_int(request.args.get("pageSize"), 1, 100, 20)
            start = (page - 1) * page_size
            paged_items = items[start : start + page_size]

        return jsonify({"items": paged_items, "total": len(items), "page": page, "pageSize": page_size})

    @app.get("/api/admin/<admin_hash>/room-history/<archive_key>")
    def admin_room_history_detail(admin_hash: str, archive_key: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            document = load_history_document_by_key_unlocked(archive_key)

            if document is None:
                return jsonify({"error": "not_found"}), 404

        return jsonify(document)

    @app.get("/api/admin/<admin_hash>/room-history/<archive_key>/download")
    def admin_room_history_download(admin_hash: str, archive_key: str) -> Any:
        with room_store_lock:
            store = load_room_store_unlocked()

            if not is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            history_path = get_history_path(archive_key)

            if history_path is None or not history_path.is_file():
                return jsonify({"error": "not_found"}), 404

        return send_file(history_path, as_attachment=True, download_name=history_path.name, mimetype="application/json")

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

            if "defaultPresetId" in payload:
                default_preset_id = payload.get("defaultPresetId")
                if default_preset_id is not None and load_config_preset(str(default_preset_id)) is None:
                    return jsonify({"error": "preset_not_found"}), 400
                settings["defaultPresetId"] = default_preset_id

            save_room_store_unlocked(store)

        return jsonify(settings)

    return app


def current_timestamp() -> int:
    return int(time.time())


def load_room_store_unlocked() -> dict[str, Any]:
    if ROOM_STORE_PATH.exists():
        with ROOM_STORE_PATH.open(encoding="utf-8") as file:
            raw_store = json.load(file)
    else:
        raw_store = {}

    schema_version = int(raw_store.get("schemaVersion") or 0)
    admin_hash = os.environ.get("OW_ADMIN_HASH") or raw_store.get("adminHash") or generate_admin_hash()
    global_settings = {
        **DEFAULT_GLOBAL_SETTINGS,
        **(raw_store.get("globalSettings") if isinstance(raw_store.get("globalSettings"), dict) else {}),
    }
    store = {
        "schemaVersion": ROOM_STORE_SCHEMA_VERSION,
        "adminHash": admin_hash,
        "globalSettings": global_settings,
        "createLog": raw_store.get("createLog") if isinstance(raw_store.get("createLog"), dict) else {},
        "rooms": (
            [room for room in raw_store.get("rooms", []) if isinstance(room, dict)]
            if schema_version == ROOM_STORE_SCHEMA_VERSION and isinstance(raw_store.get("rooms"), list)
            else []
        ),
    }

    if schema_version == ROOM_STORE_SCHEMA_VERSION and store["rooms"]:
        reconcile_active_store_from_history_index_unlocked(store)

    return store


def save_room_store_unlocked(store: dict[str, Any]) -> None:
    save_json_atomic(ROOM_STORE_PATH, store)


def save_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.tmp")

    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())

    os.replace(temporary_path, path)


def get_config_preset_path(preset_id: str) -> Path | None:
    if not CONFIG_PRESET_ID_PATTERN.fullmatch(preset_id):
        return None
    return CONFIG_PRESETS_DIR / f"{preset_id}.json"


def load_config_preset(preset_id: str) -> dict[str, Any] | None:
    path = get_config_preset_path(preset_id)
    if path is None or not path.exists():
        return None
    with path.open(encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict):
        return None
    return payload


def load_all_config_presets() -> list[dict[str, Any]]:
    CONFIG_PRESETS_DIR.mkdir(parents=True, exist_ok=True)
    presets: list[dict[str, Any]] = []
    for path in CONFIG_PRESETS_DIR.glob("*.json"):
        try:
            with path.open(encoding="utf-8") as file:
                payload = json.load(file)
            if isinstance(payload, dict) and get_config_preset_path(str(payload.get("id") or "")) == path:
                presets.append(payload)
        except (OSError, json.JSONDecodeError):
            continue
    return sorted(presets, key=lambda preset: (str(preset.get("name") or "").casefold(), str(preset.get("id") or "")))


def save_config_preset(payload: Any, *, replace: bool) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("模板必须是 JSON 对象")
    preset_id = str(payload.get("id") or "").strip().lower()
    path = get_config_preset_path(preset_id)
    if path is None:
        raise ValueError("模板 ID 只允许小写字母、数字、下划线和短横线，长度不超过 64")
    name = str(payload.get("name") or "").strip()
    if not name or len(name) > 80:
        raise ValueError("模板名称必须是 1–80 个字符")
    description = str(payload.get("description") or "").strip()
    if len(description) > 500:
        raise ValueError("模板说明不能超过 500 个字符")
    existing = load_config_preset(preset_id)
    if existing is not None and not replace:
        raise FileExistsError(preset_id)
    if existing is None and replace:
        raise FileNotFoundError(preset_id)
    normalized = normalize_match_config(payload.get("config", payload), load_assets().get("maps", {}))
    now = current_timestamp()
    preset = {
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


def build_room_config(value: Any = None, source: dict[str, Any] | None = None) -> dict[str, Any]:
    try:
        normalized = normalize_match_config(value if isinstance(value, dict) else {}, load_assets().get("maps", {}))
    except MatchConfigValidationError:
        normalized = default_match_config()
    return {
        "status": "draft",
        "revision": 1,
        "source": source or {"type": "builtin"},
        "value": normalized,
        "confirmedAt": None,
        "lockedAt": None,
    }


def ensure_room_config_unlocked(room: dict[str, Any]) -> dict[str, Any]:
    config_state = room.get("config")
    if isinstance(config_state, dict) and isinstance(config_state.get("value"), dict):
        config_state.setdefault("status", "draft")
        config_state.setdefault("revision", 1)
        config_state.setdefault("source", {"type": "manual"})
        config_state.setdefault("confirmedAt", None)
        config_state.setdefault("lockedAt", None)
        return config_state
    snapshot = room.get("snapshot") if isinstance(room.get("snapshot"), dict) else {}
    settings = snapshot.get("settingsState") if isinstance(snapshot.get("settingsState"), dict) else room.get("settings")
    config_state = build_room_config(settings)
    if snapshot.get("roomStarted"):
        config_state["status"] = "locked"
        config_state["lockedAt"] = int(room.get("lastActiveAt") or current_timestamp())
    room["config"] = config_state
    room["settings"] = deepcopy(config_state["value"])
    return config_state


def normalize_room_config_source(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"type": "manual"}
    source_type = value.get("type") if value.get("type") in {"manual", "json", "builtin", "preset"} else "manual"
    if source_type != "preset":
        return {"type": source_type}
    return {
        "type": "preset",
        "presetId": str(value.get("presetId") or ""),
        "presetName": str(value.get("presetName") or ""),
        "presetRevision": int(value.get("presetRevision") or 0),
    }


def record_room_config_event_unlocked(
    room: dict[str, Any], action: str, portal_code: str, details: dict[str, Any] | None = None
) -> None:
    now = current_timestamp()
    append_room_history_unlocked(
        room,
        now,
        int(room.get("version") or 0),
        room.get("snapshot"),
        {"type": "portal", "portalCode": portal_code, "role": ROOM_ROLES[portal_code]["role"]},
        {"category": "settings", "action": action, "details": details or {}},
    )
    touch_room_unlocked(room, now)


def migrate_legacy_config_presets_unlocked(store: dict[str, Any]) -> None:
    existing_ids = {preset["id"] for preset in load_all_config_presets()}
    legacy_payload: dict[str, Any] = {"presets": {}}
    try:
        legacy_payload = load_settings_preset()
    except (OSError, json.JSONDecodeError):
        pass
    legacy_presets = legacy_payload.get("presets") if isinstance(legacy_payload, dict) else {}
    if not existing_ids and isinstance(legacy_presets, dict):
        for index, (name, config) in enumerate(legacy_presets.items(), start=1):
            base_id = re.sub(r"[^a-z0-9_-]+", "-", normalize_key(str(name))).strip("-") or f"legacy-{index}"
            preset_id = base_id[:64]
            suffix = 2
            while preset_id in existing_ids:
                preset_id = f"{base_id[:58]}-{suffix}"
                suffix += 1
            try:
                save_config_preset(
                    {"id": preset_id, "name": str(name), "description": "从旧命名预设自动迁移", "config": config},
                    replace=False,
                )
                existing_ids.add(preset_id)
            except (ValueError, MatchConfigValidationError, FileExistsError):
                continue

    global_settings = store.setdefault("globalSettings", dict(DEFAULT_GLOBAL_SETTINGS))
    inline_default = global_settings.get("defaultSettings")
    if isinstance(inline_default, dict) and not global_settings.get("defaultPresetId"):
        preset_id = "legacy-default"
        try:
            if preset_id not in existing_ids:
                save_config_preset(
                    {"id": preset_id, "name": "旧版全局默认配置", "description": "从 rooms.json 自动迁移", "config": inline_default},
                    replace=False,
                )
            global_settings["defaultPresetId"] = preset_id
        except (ValueError, MatchConfigValidationError, FileExistsError):
            pass


def initialize_room_store() -> None:
    with room_store_lock:
        ROOM_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        rebuild_history_index_unlocked()
        store = load_room_store_unlocked()
        migrate_legacy_config_presets_unlocked(store)
        for room in store.get("rooms", []):
            ensure_room_config_unlocked(room)
        reconcile_active_rooms_unlocked(store)
        cleanup_inactive_rooms_unlocked(store, current_timestamp())
        save_room_store_unlocked(store)
        print(f"Global admin URL: /admin/{store['adminHash']}")


def generate_admin_hash() -> str:
    return secrets.token_urlsafe(24)


def generate_short_code() -> str:
    return "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(SHORT_CODE_LENGTH))


def allocate_short_code(used_codes: set[str]) -> str:
    for _ in range(MAX_SHORT_CODE_ATTEMPTS):
        code = generate_short_code()

        if code not in used_codes:
            used_codes.add(code)
            return code

    raise CodeSpaceExhausted("Unable to allocate a unique short code")


def collect_active_codes(store: dict[str, Any]) -> set[str]:
    codes: set[str] = set()

    for room in store.get("rooms", []):
        room_id = room.get("id")

        if isinstance(room_id, str):
            codes.add(room_id)

        tokens = room.get("tokens") if isinstance(room.get("tokens"), dict) else {}
        codes.update(str(token) for token in tokens.values())

    return codes


def build_archive_key(tokens: dict[str, Any]) -> str:
    return "-".join(str(tokens.get(portal_code) or "") for portal_code in ROOM_ROLES)


def create_room_record_unlocked(store: dict[str, Any], now: int) -> dict[str, Any]:
    active_codes = collect_active_codes(store)

    for _ in range(MAX_SHORT_CODE_ATTEMPTS):
        candidate_codes = set(active_codes)
        room_id = allocate_short_code(candidate_codes)
        tokens = {portal_code: allocate_short_code(candidate_codes) for portal_code in ROOM_ROLES}
        archive_key = build_archive_key(tokens)
        history_path = get_history_path(archive_key)

        if history_path is None or history_path.exists():
            continue

        room = {
            "id": room_id,
            "archiveKey": archive_key,
            "tokens": tokens,
            "createdAt": now,
            "lastActiveAt": now,
            "version": 0,
            "snapshot": None,
            "settings": store.get("globalSettings", {}).get("defaultSettings"),
        }
        default_preset_id = store.get("globalSettings", {}).get("defaultPresetId")
        default_preset = load_config_preset(str(default_preset_id)) if default_preset_id else None
        if default_preset:
            room["config"] = build_room_config(
                default_preset["config"],
                {
                    "type": "preset",
                    "presetId": default_preset["id"],
                    "presetName": default_preset["name"],
                    "presetRevision": default_preset["revision"],
                },
            )
        else:
            room["config"] = build_room_config(room["settings"])
        room["settings"] = deepcopy(room["config"]["value"])
        create_history_document_unlocked(build_initial_history_document(room))
        store.setdefault("rooms", []).append(room)
        return room

    raise CodeSpaceExhausted("Unable to allocate an unused room archive key")


def rollback_created_room_unlocked(store: dict[str, Any], room: dict[str, Any]) -> None:
    store["rooms"] = [entry for entry in store.get("rooms", []) if entry is not room]
    archive_key = str(room.get("archiveKey") or "")
    history_path = get_history_path(archive_key)

    if history_path and history_path.exists():
        history_path.unlink()

    try:
        remove_history_index_entry_unlocked(archive_key)
    except Exception:
        pass


def normalize_operation(value: Any) -> dict[str, Any]:
    if value is None:
        return {"category": "room", "action": "snapshot_updated", "details": {}}

    if not isinstance(value, dict):
        raise ValueError("Operation must be an object")

    category = str(value.get("category") or "").strip().lower()
    action = str(value.get("action") or "").strip().lower()
    details = value.get("details", {})

    if category not in ALLOWED_OPERATION_CATEGORIES:
        raise ValueError("Unsupported operation category")

    if not OPERATION_PART_PATTERN.fullmatch(action):
        raise ValueError("Invalid operation action")

    if not isinstance(details, dict):
        raise ValueError("Operation details must be an object")

    return {"category": category, "action": action, "details": details}


def build_initial_history_document(room: dict[str, Any]) -> dict[str, Any]:
    created_at = int(room.get("createdAt") or current_timestamp())
    archive_key = str(room.get("archiveKey") or build_archive_key(room.get("tokens", {})))
    return {
        "schemaVersion": ROOM_HISTORY_SCHEMA_VERSION,
        "archiveKey": archive_key,
        "roomId": room.get("id"),
        "tokens": dict(room.get("tokens", {})),
        "status": "active",
        "createdAt": created_at,
        "updatedAt": created_at,
        "lastActiveAt": int(room.get("lastActiveAt") or created_at),
        "closedAt": None,
        "closeReason": None,
        "currentVersion": int(room.get("version") or 0),
        "currentSnapshot": room.get("snapshot"),
        "currentConfig": deepcopy(room.get("config")),
        "history": [
            {
                "sequence": 0,
                "timestamp": created_at,
                "version": int(room.get("version") or 0),
                "actor": {"type": "system", "portalCode": None, "role": "system"},
                "operation": {"category": "lifecycle", "action": "created", "details": {}},
                "snapshot": room.get("snapshot"),
                "config": deepcopy(room.get("config")),
            }
        ],
    }


def create_history_document_unlocked(document: dict[str, Any]) -> None:
    archive_key = str(document.get("archiveKey") or "")
    history_path = get_history_path(archive_key)

    if history_path is None:
        raise ValueError("Invalid archive key")

    ROOM_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    descriptor: int | None = None

    try:
        descriptor = os.open(history_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL)

        with os.fdopen(descriptor, "w", encoding="utf-8") as file:
            descriptor = None
            json.dump(document, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())

        update_history_index_unlocked(document)
    except Exception:
        if descriptor is not None:
            os.close(descriptor)

        if history_path.exists():
            history_path.unlink()

        raise


def append_room_history_unlocked(
    room: dict[str, Any],
    timestamp: int,
    version: int,
    snapshot: Any,
    actor: dict[str, Any],
    operation: dict[str, Any],
    *,
    status: str | None = None,
    closed_at: int | None = None,
    close_reason: str | None = None,
    last_active_at: int | None = None,
) -> None:
    archive_key = str(room.get("archiveKey") or "")
    document = load_history_document_by_key_unlocked(archive_key)

    if document is None:
        raise FileNotFoundError(f"Missing history document for room {room.get('id')}")

    history = document.get("history") if isinstance(document.get("history"), list) else []
    last_sequence = int(history[-1].get("sequence") or 0) if history else -1
    history.append(
        {
            "sequence": last_sequence + 1,
            "timestamp": timestamp,
            "version": version,
            "actor": actor,
            "operation": operation,
            "snapshot": snapshot,
            "config": deepcopy(room.get("config")),
        }
    )
    document["history"] = history
    document["updatedAt"] = timestamp
    document["lastActiveAt"] = int(last_active_at if last_active_at is not None else timestamp)
    document["currentVersion"] = version
    document["currentSnapshot"] = snapshot
    document["currentConfig"] = deepcopy(room.get("config"))

    if status is not None:
        document["status"] = status
        document["closedAt"] = closed_at
        document["closeReason"] = close_reason

    save_json_atomic(get_history_path_or_raise(archive_key), document)
    update_history_index_unlocked(document)


def close_room_unlocked(room: dict[str, Any], now: int, reason: str) -> None:
    archive_key = str(room.get("archiveKey") or "")
    document = load_history_document_by_key_unlocked(archive_key)

    if document is None:
        raise FileNotFoundError(f"Missing history document for room {room.get('id')}")

    if document.get("status") != "active":
        return

    is_manual = reason == "manual"
    append_room_history_unlocked(
        room,
        now,
        int(room.get("version") or 0),
        room.get("snapshot"),
        (
            {"type": "global_admin", "portalCode": None, "role": "global-admin"}
            if is_manual
            else {"type": "system", "portalCode": None, "role": "system"}
        ),
        {
            "category": "lifecycle",
            "action": "closed" if is_manual else "expired",
            "details": {"reason": reason},
        },
        status="closed" if is_manual else "expired",
        closed_at=now,
        close_reason=reason,
        last_active_at=int(room.get("lastActiveAt") or room.get("createdAt") or now),
    )


def get_history_path(archive_key: str) -> Path | None:
    if not ARCHIVE_KEY_PATTERN.fullmatch(archive_key):
        return None

    return ROOM_HISTORY_DIR / f"{archive_key}.json"


def get_history_path_or_raise(archive_key: str) -> Path:
    history_path = get_history_path(archive_key)

    if history_path is None:
        raise ValueError("Invalid archive key")

    return history_path


def load_history_document_by_key_unlocked(archive_key: str) -> dict[str, Any] | None:
    history_path = get_history_path(archive_key)

    if history_path is None or not history_path.is_file():
        return None

    with history_path.open(encoding="utf-8") as file:
        document = json.load(file)

    return document if isinstance(document, dict) else None


def history_summary_from_document(document: dict[str, Any]) -> dict[str, Any]:
    history = document.get("history") if isinstance(document.get("history"), list) else []
    return {
        "archiveKey": document.get("archiveKey"),
        "roomId": document.get("roomId"),
        "tokens": document.get("tokens") if isinstance(document.get("tokens"), dict) else {},
        "status": document.get("status"),
        "createdAt": document.get("createdAt"),
        "updatedAt": document.get("updatedAt"),
        "lastActiveAt": document.get("lastActiveAt"),
        "closedAt": document.get("closedAt"),
        "closeReason": document.get("closeReason"),
        "currentVersion": document.get("currentVersion", 0),
        "operationCount": len(history),
    }


def empty_history_index() -> dict[str, Any]:
    return {"schemaVersion": ROOM_HISTORY_INDEX_SCHEMA_VERSION, "items": {}}


def load_history_index_unlocked() -> dict[str, Any]:
    if not ROOM_HISTORY_INDEX_PATH.is_file():
        return rebuild_history_index_unlocked()

    try:
        with ROOM_HISTORY_INDEX_PATH.open(encoding="utf-8") as file:
            index = json.load(file)
    except (OSError, json.JSONDecodeError):
        return rebuild_history_index_unlocked()

    if not isinstance(index, dict) or not isinstance(index.get("items"), dict):
        return rebuild_history_index_unlocked()

    return index


def rebuild_history_index_unlocked() -> dict[str, Any]:
    ROOM_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    index = empty_history_index()

    for history_path in ROOM_HISTORY_DIR.glob("*.json"):
        if not ARCHIVE_KEY_PATTERN.fullmatch(history_path.stem):
            continue

        try:
            with history_path.open(encoding="utf-8") as file:
                document = json.load(file)
        except (OSError, json.JSONDecodeError):
            continue

        if not isinstance(document, dict):
            continue

        archive_key = str(document.get("archiveKey") or "")

        if ARCHIVE_KEY_PATTERN.fullmatch(archive_key):
            index["items"][archive_key] = history_summary_from_document(document)

    save_json_atomic(ROOM_HISTORY_INDEX_PATH, index)
    return index


def update_history_index_unlocked(document: dict[str, Any]) -> None:
    archive_key = str(document.get("archiveKey") or "")

    if not ARCHIVE_KEY_PATTERN.fullmatch(archive_key):
        raise ValueError("Invalid archive key")

    index = load_history_index_unlocked()
    index.setdefault("items", {})[archive_key] = history_summary_from_document(document)
    save_json_atomic(ROOM_HISTORY_INDEX_PATH, index)


def remove_history_index_entry_unlocked(archive_key: str) -> None:
    index = load_history_index_unlocked()
    index.setdefault("items", {}).pop(archive_key, None)
    save_json_atomic(ROOM_HISTORY_INDEX_PATH, index)


def reconcile_active_rooms_unlocked(store: dict[str, Any]) -> None:
    active_rooms: list[dict[str, Any]] = []

    for room in store.get("rooms", []):
        tokens = room.get("tokens") if isinstance(room.get("tokens"), dict) else {}
        codes = [room.get("id"), *(tokens.get(portal_code) for portal_code in ROOM_ROLES)]

        if len(codes) != 5 or any(not isinstance(code, str) or not SHORT_CODE_PATTERN.fullmatch(code) for code in codes):
            continue

        if len(set(codes)) != 5:
            continue

        archive_key = build_archive_key(tokens)
        room["archiveKey"] = archive_key
        document = load_history_document_by_key_unlocked(archive_key)

        if document is None:
            create_history_document_unlocked(build_initial_history_document(room))
            document = load_history_document_by_key_unlocked(archive_key)

        if not document or document.get("status") != "active":
            continue

        history_version = int(document.get("currentVersion") or 0)

        if history_version > int(room.get("version") or 0):
            room["version"] = history_version
            room["snapshot"] = document.get("currentSnapshot")

        active_rooms.append(room)

    store["rooms"] = active_rooms


def reconcile_active_store_from_history_index_unlocked(store: dict[str, Any]) -> None:
    index = load_history_index_unlocked()
    summaries = index.get("items", {})
    active_rooms: list[dict[str, Any]] = []

    for room in store.get("rooms", []):
        archive_key = str(room.get("archiveKey") or build_archive_key(room.get("tokens", {})))
        summary = summaries.get(archive_key)

        if isinstance(summary, dict) and summary.get("status") != "active":
            continue

        if isinstance(summary, dict) and int(summary.get("currentVersion") or 0) > int(room.get("version") or 0):
            document = load_history_document_by_key_unlocked(archive_key)

            if document is not None:
                room["version"] = int(document.get("currentVersion") or 0)
                room["snapshot"] = document.get("currentSnapshot")

        room["archiveKey"] = archive_key
        active_rooms.append(room)

    store["rooms"] = active_rooms


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


def cleanup_inactive_rooms_unlocked(store: dict[str, Any], now: int) -> bool:
    timeout_minutes = int(store.get("globalSettings", {}).get("inactiveTimeoutMinutes") or 30)
    timeout_seconds = timeout_minutes * 60
    active_rooms: list[dict[str, Any]] = []
    changed = False

    for room in store.get("rooms", []):
        if room.get("closedAt"):
            close_room_unlocked(room, int(room.get("closedAt") or now), "manual")
            changed = True
            continue

        last_active = int(room.get("lastActiveAt") or room.get("createdAt") or now)

        if now - last_active > timeout_seconds:
            close_room_unlocked(room, now, "inactive_timeout")
            changed = True
            continue

        active_rooms.append(room)

    if changed:
        store["rooms"] = active_rooms

    return changed


def touch_room_unlocked(room: dict[str, Any], now: int) -> None:
    room["lastActiveAt"] = now


def find_room_by_token_unlocked(store: dict[str, Any], token: str) -> tuple[dict[str, Any], str] | None:
    if not SHORT_CODE_PATTERN.fullmatch(token):
        return None

    for room in store.get("rooms", []):
        tokens = room.get("tokens") if isinstance(room.get("tokens"), dict) else {}

        for portal_code, room_token in tokens.items():
            if secrets.compare_digest(str(room_token), token):
                return room, portal_code

    return None


def is_archived_token_unlocked(token: str) -> bool:
    if not SHORT_CODE_PATTERN.fullmatch(token):
        return False

    index = load_history_index_unlocked()

    for summary in index.get("items", {}).values():
        tokens = summary.get("tokens") if isinstance(summary.get("tokens"), dict) else {}

        if any(secrets.compare_digest(str(value), token) for value in tokens.values()):
            return True

    return False


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
    config_state = ensure_room_config_unlocked(room)
    return {
        "room": {
            "id": room.get("id"),
            "createdAt": room.get("createdAt"),
            "lastActiveAt": room.get("lastActiveAt"),
            "closedAt": None,
            "settings": room.get("settings"),
            "config": config_state,
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
        "closedAt": None,
        "version": room.get("version", 0),
        "configStatus": ensure_room_config_unlocked(room).get("status"),
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
