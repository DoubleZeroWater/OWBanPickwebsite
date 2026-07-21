from __future__ import annotations

import json
import os
import re
import secrets
import threading
import time
import unicodedata
from copy import deepcopy
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, redirect, request, send_file, send_from_directory

try:
    from backend import catalog as catalog_data
except ModuleNotFoundError:  # Support `python backend/app.py` from the repository root.
    import catalog as catalog_data  # type: ignore[no-redef]

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
    "notificationDurationSeconds": 20,
    "defaultSettings": None,
    "defaultPresetId": None,
}
room_store_lock = threading.Lock()
catalog_refresh_lock = threading.Lock()
catalog_refresh_jobs: dict[str, dict[str, Any]] = {}
active_catalog_refresh_job_id: str | None = None


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
        response = jsonify(build_maps_catalog())
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/runtime-assets/<path:filename>")
    def runtime_catalog_asset(filename: str) -> Any:
        assets, source = catalog_data.load_catalog_assets(ASSETS_DATA_PATH, RUNTIME_CATALOG_DIR)
        normalized = filename.replace("\\", "/").strip("/")
        if source != "runtime" or normalized not in catalog_data.allowed_runtime_asset_paths(assets):
            return jsonify({"error": "not_found"}), 404
        return send_from_directory(RUNTIME_CATALOG_DIR / "current", normalized)

    @app.get("/api/admin/<admin_hash>/catalog-maintenance")
    def admin_catalog_maintenance(admin_hash: str) -> Any:
        if not is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        payload = catalog_data.build_maintenance_status(
            ASSETS_DATA_PATH,
            BUNDLED_TRANSLATION_PATH,
            RUNTIME_CATALOG_DIR,
        )
        with catalog_refresh_lock:
            payload["job"] = current_catalog_refresh_job_unlocked()
        return jsonify(payload)

    @app.post("/api/admin/<admin_hash>/catalog-refresh")
    def admin_catalog_refresh(admin_hash: str) -> Any:
        if not is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        job, started = start_catalog_refresh_job()
        return jsonify(job), 202 if started else 409

    @app.get("/api/admin/<admin_hash>/catalog-refresh/<job_id>")
    def admin_catalog_refresh_status(admin_hash: str, job_id: str) -> Any:
        if not is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        with catalog_refresh_lock:
            job = catalog_refresh_jobs.get(job_id)
            if job is None:
                return jsonify({"error": "not_found"}), 404
            return jsonify(deepcopy(job))

    @app.put("/api/admin/<admin_hash>/catalog-translation")
    def admin_catalog_translation(admin_hash: str) -> Any:
        if not is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "invalid_json_object"}), 400
        assets, _source = catalog_data.load_catalog_assets(ASSETS_DATA_PATH, RUNTIME_CATALOG_DIR)
        diagnostics = catalog_data.validate_translation(assets, payload)
        catalog_data.save_json_atomic(RUNTIME_CATALOG_DIR / "translation.json", payload)
        return jsonify({"ok": True, "active": diagnostics["valid"], "diagnostics": diagnostics})

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

    @app.post("/api/rooms/unlimited/<create_hash>")
    def create_unlimited_room(create_hash: str) -> Any:
        if not is_unlimited_create_hash(create_hash):
            return jsonify({"error": "not_found"}), 404

        with room_store_lock:
            store = load_room_store_unlocked()
            now = current_timestamp()
            store_changed = cleanup_inactive_rooms_unlocked(store, now)
            try:
                room = create_room_record_unlocked(store, now)
            except CodeSpaceExhausted:
                if store_changed:
                    save_room_store_unlocked(store)
                return jsonify({"error": "code_space_exhausted"}), 503

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

        return jsonify(format_room_token_payload(
            room,
            portal_code,
            store.get("globalSettings", {}).get("notificationDurationSeconds"),
        ))

    @app.post("/api/rooms/token/<room_token>/presence")
    def update_room_presence(room_token: str) -> Any:
        payload = request.get_json(silent=True) or {}
        requested_ready = payload.get("ready")
        requested_name = payload.get("name")
        if requested_ready is not None and not isinstance(requested_ready, bool):
            return jsonify({"error": "invalid_ready_state"}), 400
        if requested_name is not None and (
            not isinstance(requested_name, str)
            or not requested_name.strip()
            or len(requested_name.strip()) > 60
        ):
            return jsonify({"error": "invalid_team_name"}), 400

        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404

            room, portal_code = lookup
            now = current_timestamp()
            presence = ensure_room_presence_unlocked(room)
            presence[portal_code]["lastSeenAt"] = now
            if portal_code in {"A", "B"} and requested_ready is not None:
                if requested_ready is False:
                    return jsonify({"error": "ready_cannot_be_revoked"}), 409

            config_state = ensure_room_config_unlocked(room)
            preparation_open = (
                config_state["status"] in {"ready", "locked"}
                or config_state["value"].get("startWithDefaultConfig") is True
            )
            if portal_code in {"A", "B"} and requested_ready is True:
                if not preparation_open:
                    return jsonify({"error": "config_not_ready", "config": config_state}), 409
                if config_state["value"].get("teamsCanEditOwnName") is True:
                    if requested_name is not None:
                        if config_state["status"] == "locked":
                            return jsonify({"error": "config_locked"}), 409
                        if presence[portal_code]["ready"]:
                            return jsonify({"error": "team_already_ready"}), 409
                        side = ROOM_ROLES[portal_code]["side"]
                        next_name = requested_name.strip()
                        config_state["value"]["teams"][side] = next_name
                        config_state["revision"] = int(config_state.get("revision") or 0) + 1
                        room["settings"] = deepcopy(config_state["value"])
                        presence[portal_code]["nameConfirmed"] = True
                        record_room_config_event_unlocked(
                            room,
                            "team_name_confirmed",
                            portal_code,
                            {"side": side, "name": next_name},
                        )
                    elif not presence[portal_code]["nameConfirmed"]:
                        return jsonify({"error": "team_name_not_confirmed"}), 409
                presence[portal_code]["ready"] = True

            auto_started = False
            team_ready = bool(presence["A"]["ready"] and presence["B"]["ready"])
            if (
                config_state["status"] != "locked"
                and config_state["value"].get("startWithDefaultConfig") is True
                and team_ready
            ):
                try:
                    config_state["value"] = normalize_match_config(
                        config_state["value"], load_assets().get("maps", {})
                    )
                except MatchConfigValidationError as exc:
                    return jsonify({"error": "invalid_config", "details": exc.errors}), 400
                config_state["status"] = "locked"
                config_state["confirmedAt"] = config_state.get("confirmedAt") or now
                config_state["lockedAt"] = now
                room["settings"] = deepcopy(config_state["value"])
                record_room_config_event_unlocked(
                    room,
                    "auto_started_after_team_ready",
                    portal_code,
                    {"teamReady": True},
                )
                auto_started = True

            touch_room_unlocked(room, now)
            save_room_store_unlocked(store)
            response = {
                "presence": format_room_presence(room, now),
                "config": config_state,
                "autoStarted": auto_started,
                "version": room.get("version", 0),
            }

        return jsonify(response)

    @app.put("/api/rooms/token/<room_token>/team-name")
    def update_own_team_name(room_token: str) -> Any:
        payload = request.get_json(silent=True) or {}
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
            return jsonify({"error": "invalid_team_name"}), 400

        with room_store_lock:
            store = load_room_store_unlocked()
            lookup = find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404

            room, portal_code = lookup
            if portal_code not in {"A", "B"}:
                return jsonify({"error": "forbidden"}), 403

            config_state = ensure_room_config_unlocked(room)
            if config_state["status"] == "locked":
                return jsonify({"error": "config_locked"}), 409
            if config_state["value"].get("teamsCanEditOwnName") is not True:
                return jsonify({"error": "team_name_edit_disabled"}), 409
            if not (
                config_state["status"] == "ready"
                or config_state["value"].get("startWithDefaultConfig") is True
            ):
                return jsonify({"error": "config_not_ready"}), 409

            presence = ensure_room_presence_unlocked(room)
            if presence[portal_code]["ready"]:
                return jsonify({"error": "team_already_ready"}), 409

            side = ROOM_ROLES[portal_code]["side"]
            next_name = name.strip()
            config_state["value"]["teams"][side] = next_name
            config_state["revision"] = int(config_state.get("revision") or 0) + 1
            room["settings"] = deepcopy(config_state["value"])
            presence[portal_code]["nameConfirmed"] = True
            now = current_timestamp()
            touch_room_unlocked(room, now)
            record_room_config_event_unlocked(
                room,
                "team_name_confirmed",
                portal_code,
                {"side": side, "name": next_name},
            )
            save_room_store_unlocked(store)

            return jsonify({
                "config": config_state,
                "presence": format_room_presence(room, now),
            })

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
            reset_room_readiness_unlocked(room)
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
            reset_room_readiness_unlocked(room)
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
        payload = request.get_json(silent=True) or {}
        force_start = payload.get("force") is True
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
            presence = ensure_room_presence_unlocked(room)
            if not force_start and not (presence["A"]["ready"] and presence["B"]["ready"]):
                return jsonify({
                    "error": "teams_not_ready",
                    "presence": format_room_presence(room),
                }), 409
            config_state["status"] = "locked"
            config_state["lockedAt"] = current_timestamp()
            record_room_config_event_unlocked(
                room,
                "force_started" if force_start else "locked",
                portal_code,
            )
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
            reset_room_readiness_unlocked(room)
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

        return jsonify({
            "version": room.get("version", 0),
            "snapshot": room.get("snapshot"),
            "notificationDurationSeconds": clamp_int(
                store.get("globalSettings", {}).get("notificationDurationSeconds"),
                1,
                300,
                DEFAULT_GLOBAL_SETTINGS["notificationDurationSeconds"],
            ),
        })

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
            merge_team_lineup_snapshot_unlocked(
                room.get("snapshot"), next_snapshot, portal_code, operation
            )
            merge_team_score_pause_snapshot_unlocked(
                room.get("snapshot"), next_snapshot, portal_code, operation
            )
            merge_team_interactive_random_snapshot_unlocked(
                room.get("snapshot"), next_snapshot, portal_code, operation
            )
            merge_team_notice_snapshot_unlocked(
                room.get("snapshot"), next_snapshot, portal_code, operation
            )
            if operation["category"] == "settings" and portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            if bool(next_snapshot.get("roomStarted")) and config_state["status"] != "locked":
                return jsonify({"error": "config_not_locked", "config": config_state}), 409
            if config_state["status"] == "locked" and not bool(next_snapshot.get("roomStarted")):
                return jsonify({"error": "config_locked"}), 409
            next_snapshot["settingsState"] = deepcopy(config_state["value"])

            current_version = int(room.get("version") or 0)

            version_conflict = isinstance(expected_version, int) and expected_version != current_version
            merge_safe = is_merge_safe_snapshot_operation(operation)
            if version_conflict and not merge_safe:
                if store_changed:
                    save_room_store_unlocked(store)
                return jsonify({"error": "version_conflict", "version": current_version, "snapshot": room.get("snapshot")}), 409

            if version_conflict and merge_safe:
                next_snapshot = merge_conflicting_snapshot_unlocked(
                    room.get("snapshot"), next_snapshot, portal_code, operation
                )

            normalize_score_submission_pauses_unlocked(
                room.get("snapshot"), next_snapshot, operation
            )
            normalize_score_pause_transition_unlocked(
                room.get("snapshot"), next_snapshot, portal_code, operation
            )
            merge_notification_events_unlocked(room.get("snapshot"), next_snapshot)

            # Normal portal updates must never move a room backwards. A room
            # administrator can explicitly restore a completed checkpoint from
            # the live control panel, which is the sole intentional exception.
            is_admin_stage_restore = (
                portal_code == "C"
                and operation.get("category") == "room"
                and operation.get("action") == "stage_restored"
            )
            if (
                not is_admin_stage_restore
                and snapshot_progress_key(next_snapshot) < snapshot_progress_key(room.get("snapshot"))
            ):
                if store_changed:
                    save_room_store_unlocked(store)
                return jsonify({"error": "stage_regression", "version": current_version, "snapshot": room.get("snapshot")}), 409

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

        return jsonify({"ok": True, "version": room["version"], "snapshot": room["snapshot"]})

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
            settings["notificationDurationSeconds"] = clamp_int(
                payload.get("notificationDurationSeconds"),
                1,
                300,
                settings.get(
                    "notificationDurationSeconds",
                    DEFAULT_GLOBAL_SETTINGS["notificationDurationSeconds"],
                ),
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


def ensure_room_presence_unlocked(room: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw_presence = room.get("presence") if isinstance(room.get("presence"), dict) else {}
    presence: dict[str, dict[str, Any]] = {}
    for portal_code in ROOM_ROLES:
        raw_entry = raw_presence.get(portal_code) if isinstance(raw_presence.get(portal_code), dict) else {}
        presence[portal_code] = {
            "lastSeenAt": int(raw_entry.get("lastSeenAt") or 0),
            "ready": bool(raw_entry.get("ready")) if portal_code in {"A", "B"} else False,
            "nameConfirmed": bool(raw_entry.get("nameConfirmed")) if portal_code in {"A", "B"} else False,
        }
    room["presence"] = presence
    return presence


def reset_room_readiness_unlocked(room: dict[str, Any]) -> None:
    presence = ensure_room_presence_unlocked(room)
    presence["A"]["ready"] = False
    presence["B"]["ready"] = False
    presence["A"]["nameConfirmed"] = False
    presence["B"]["nameConfirmed"] = False


def format_room_presence(room: dict[str, Any], now: int | None = None) -> dict[str, dict[str, Any]]:
    timestamp = current_timestamp() if now is None else now
    presence = ensure_room_presence_unlocked(room)
    return {
        portal_code: {
            "connected": bool(
                presence[portal_code]["lastSeenAt"]
                and timestamp - presence[portal_code]["lastSeenAt"] <= PORTAL_PRESENCE_TTL_SECONDS
            ),
            "ready": bool(presence[portal_code]["ready"]),
            "nameConfirmed": bool(presence[portal_code]["nameConfirmed"]),
            "lastSeenAt": presence[portal_code]["lastSeenAt"],
        }
        for portal_code in ("B", "C", "A")
    }


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
        print(f"Unlimited room creation URL: /r/{unlimited_create_hash()}")
        print(f"Admin manage URL: /admin/{store['adminHash']}")


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
            "presence": {
                portal_code: {"lastSeenAt": 0, "ready": False, "nameConfirmed": False}
                for portal_code in ROOM_ROLES
            },
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


def merge_team_lineup_snapshot_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    portal_code: str,
    operation: dict[str, Any],
) -> None:
    if portal_code == "C" or operation.get("category") != "lineup":
        return
    side = ROOM_ROLES.get(portal_code, {}).get("side")
    if side not in {"left", "right"} or not isinstance(current_snapshot, dict):
        return
    current_lineup = current_snapshot.get("lineupSelectorState")
    next_lineup = next_snapshot.get("lineupSelectorState")
    if not isinstance(current_lineup, dict) or not isinstance(next_lineup, dict):
        return
    if current_lineup.get("mapIndex") != next_lineup.get("mapIndex"):
        return

    other_side = "right" if side == "left" else "left"
    current_values = current_lineup.get("values") if isinstance(current_lineup.get("values"), dict) else {}
    next_values = next_lineup.setdefault("values", {})
    if isinstance(next_values, dict) and isinstance(current_values.get(other_side), dict):
        next_values[other_side] = deepcopy(current_values[other_side])

    current_ready = current_lineup.get("ready") if isinstance(current_lineup.get("ready"), dict) else {}
    next_ready = next_lineup.setdefault("ready", {})
    if isinstance(next_ready, dict):
        next_ready[other_side] = bool(current_ready.get(other_side))


def merge_team_score_pause_snapshot_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    portal_code: str,
    operation: dict[str, Any],
) -> None:
    if portal_code == "C" or operation.get("category") != "pause":
        return
    if not str(operation.get("action") or "").startswith("score_team_"):
        return
    side = ROOM_ROLES.get(portal_code, {}).get("side")
    if side not in {"left", "right"} or not isinstance(current_snapshot, dict):
        return
    current_score = current_snapshot.get("scoreSelectorState")
    next_score = next_snapshot.get("scoreSelectorState")
    if not isinstance(current_score, dict) or not isinstance(next_score, dict):
        return
    if current_score.get("mapIndex") != next_score.get("mapIndex"):
        return

    other_side = "right" if side == "left" else "left"
    current_pauses = current_score.get("teamPauses") if isinstance(current_score.get("teamPauses"), dict) else {}
    next_pauses = next_score.setdefault("teamPauses", {})
    if isinstance(next_pauses, dict) and isinstance(current_pauses.get(other_side), dict):
        next_pauses[other_side] = deepcopy(current_pauses[other_side])

    if isinstance(next_pauses, dict):
        any_active = any(
            isinstance(next_pauses.get(candidate), dict) and bool(next_pauses[candidate].get("active"))
            for candidate in ("left", "right")
        )
        if not any_active:
            next_score["countdownPauseStartedAt"] = None
        elif not isinstance(next_score.get("countdownPauseStartedAt"), (int, float)):
            current_started_at = current_score.get("countdownPauseStartedAt")
            own_pause = next_pauses.get(side) if isinstance(next_pauses.get(side), dict) else {}
            next_score["countdownPauseStartedAt"] = (
                current_started_at
                if isinstance(current_started_at, (int, float))
                else own_pause.get("startedAt")
            )


def normalize_score_pause_transition_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    portal_code: str,
    operation: dict[str, Any],
) -> None:
    """Make the server authoritative for score-phase pause clocks and counters."""
    if operation.get("category") != "pause":
        return
    action = str(operation.get("action") or "")
    if action not in {"score_team_started", "score_team_resumed"}:
        return
    if not isinstance(current_snapshot, dict):
        return

    details = operation.get("details") if isinstance(operation.get("details"), dict) else {}
    side = details.get("side")
    if side not in {"left", "right"}:
        return
    actor_side = ROOM_ROLES.get(portal_code, {}).get("side")
    if portal_code != "C" and actor_side != side:
        return

    current_score = current_snapshot.get("scoreSelectorState")
    next_score = next_snapshot.get("scoreSelectorState")
    if not isinstance(current_score, dict) or not isinstance(next_score, dict):
        return
    if current_score.get("mapIndex") != next_score.get("mapIndex"):
        return

    if current_score.get("submittedBy"):
        current_pauses = current_score.get("teamPauses")
        if isinstance(current_pauses, dict):
            next_score["teamPauses"] = deepcopy(current_pauses)
        next_score["countdownPauseStartedAt"] = None
        return

    current_pauses = current_score.get("teamPauses")
    next_pauses = next_score.setdefault("teamPauses", {})
    if not isinstance(current_pauses, dict) or not isinstance(next_pauses, dict):
        return
    current_pause = current_pauses.get(side)
    if not isinstance(current_pause, dict):
        return

    normalized = deepcopy(current_pause)
    now_ms = int(time.time() * 1000)
    is_active = bool(current_pause.get("active"))
    total_ms = max(0, int(current_pause.get("totalMs") or 0))
    count = max(0, int(current_pause.get("count") or 0))

    if action == "score_team_started":
        if not is_active:
            normalized.update(
                {
                    "active": True,
                    "startedAt": now_ms,
                    "totalMs": total_ms,
                    "count": count + 1,
                }
            )
    elif is_active:
        started_at = current_pause.get("startedAt")
        elapsed_ms = max(0, now_ms - int(started_at)) if isinstance(started_at, (int, float)) else 0
        normalized.update(
            {
                "active": False,
                "startedAt": None,
                "totalMs": total_ms + elapsed_ms,
                "count": count,
            }
        )

    next_pauses[side] = normalized
    active_starts = [
        pause.get("startedAt")
        for pause in next_pauses.values()
        if isinstance(pause, dict)
        and pause.get("active")
        and isinstance(pause.get("startedAt"), (int, float))
    ]
    next_score["countdownPauseStartedAt"] = min(active_starts) if active_starts else None


def normalize_score_submission_pauses_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    operation: dict[str, Any],
) -> None:
    """Stop every team pause when a score is submitted for confirmation."""
    if operation.get("category") != "score" or operation.get("action") != "submitted":
        return
    if not isinstance(current_snapshot, dict):
        return

    current_score = current_snapshot.get("scoreSelectorState")
    next_score = next_snapshot.get("scoreSelectorState")
    if not isinstance(current_score, dict) or not isinstance(next_score, dict):
        return
    if current_score.get("mapIndex") != next_score.get("mapIndex"):
        return

    current_pauses = current_score.get("teamPauses")
    if not isinstance(current_pauses, dict):
        return

    now_ms = int(time.time() * 1000)
    normalized_pauses: dict[str, Any] = {}
    for side in ("left", "right"):
        current_pause = current_pauses.get(side)
        if not isinstance(current_pause, dict):
            continue
        normalized = deepcopy(current_pause)
        if current_pause.get("active"):
            started_at = current_pause.get("startedAt")
            elapsed_ms = max(0, now_ms - int(started_at)) if isinstance(started_at, (int, float)) else 0
            normalized["totalMs"] = max(0, int(current_pause.get("totalMs") or 0)) + elapsed_ms
        normalized["active"] = False
        normalized["startedAt"] = None
        normalized_pauses[side] = normalized

    next_score["teamPauses"] = normalized_pauses
    next_score["countdownPauseStartedAt"] = None


def merge_team_interactive_random_snapshot_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    portal_code: str,
    operation: dict[str, Any],
) -> None:
    if operation.get("action") != "interactive_random_submitted":
        return
    side = ROOM_ROLES.get(portal_code, {}).get("side")
    if side not in {"left", "right"} or not isinstance(current_snapshot, dict):
        return
    current_random = current_snapshot.get("interactiveRandomState")
    next_random = next_snapshot.get("interactiveRandomState")
    if not isinstance(current_random, dict) or not isinstance(next_random, dict):
        return
    if (
        current_random.get("purpose") != next_random.get("purpose")
        or current_random.get("mapIndex") != next_random.get("mapIndex")
    ):
        return
    other_side = "right" if side == "left" else "left"
    current_choices = current_random.get("choices") if isinstance(current_random.get("choices"), dict) else {}
    next_choices = next_random.setdefault("choices", {})
    if isinstance(next_choices, dict):
        next_choices[other_side] = current_choices.get(other_side)


def merge_team_notice_snapshot_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    portal_code: str,
    operation: dict[str, Any],
) -> None:
    if operation.get("category") != "notice" or operation.get("action") != "acknowledged":
        return
    side = ROOM_ROLES.get(portal_code, {}).get("side")
    if side not in {"left", "right"} or not isinstance(current_snapshot, dict):
        return
    current_notice = current_snapshot.get("teamAckNotice")
    next_notice = next_snapshot.get("teamAckNotice")
    if not isinstance(current_notice, dict):
        return
    if isinstance(next_notice, dict) and current_notice.get("message") != next_notice.get("message"):
        return
    other_side = "right" if side == "left" else "left"
    current_ack = current_notice.get("acknowledged") if isinstance(current_notice.get("acknowledged"), dict) else {}
    merged_ack = {side: True, other_side: bool(current_ack.get(other_side))}
    if all(merged_ack.get(candidate, False) for candidate in ("left", "right")):
        next_snapshot["teamAckNotice"] = None
        return
    if not isinstance(next_notice, dict):
        next_notice = deepcopy(current_notice)
        next_snapshot["teamAckNotice"] = next_notice
    next_notice["acknowledged"] = merged_ack


def merge_notification_events_unlocked(current_snapshot: Any, next_snapshot: dict[str, Any]) -> None:
    """Preserve the ordered notification stream across concurrent portal updates."""
    current_events = (
        current_snapshot.get("notificationEvents")
        if isinstance(current_snapshot, dict)
        and isinstance(current_snapshot.get("notificationEvents"), list)
        else []
    )
    next_events = (
        next_snapshot.get("notificationEvents")
        if isinstance(next_snapshot.get("notificationEvents"), list)
        else []
    )
    merged: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for event in [*current_events, *next_events]:
        if not isinstance(event, dict):
            continue
        event_id = event.get("id")
        segments = event.get("segments")
        if not isinstance(event_id, str) or not event_id or event_id in seen_ids:
            continue
        if not isinstance(segments, list) or not segments:
            continue
        seen_ids.add(event_id)
        merged.append(event)

    merged.sort(key=lambda event: (int(event.get("createdAt") or 0), str(event.get("id") or "")))
    next_snapshot["notificationEvents"] = merged[-100:]


def is_merge_safe_snapshot_operation(operation: dict[str, Any]) -> bool:
    category = operation.get("category")
    action = str(operation.get("action") or "")
    return (
        (category == "lineup" and action == "ready")
        or (category == "pause" and action.startswith("score_team_"))
        or action == "interactive_random_submitted"
        or (category == "notice" and action == "acknowledged")
    )


def merge_conflicting_snapshot_unlocked(
    current_snapshot: Any,
    next_snapshot: dict[str, Any],
    portal_code: str,
    operation: dict[str, Any],
) -> dict[str, Any]:
    """Merge only the actor-owned field when two clients submit from the same version."""
    if not isinstance(current_snapshot, dict):
        return next_snapshot
    side = ROOM_ROLES.get(portal_code, {}).get("side")
    if side not in {"left", "right"}:
        return deepcopy(current_snapshot)

    merged = deepcopy(current_snapshot)
    category = operation.get("category")
    action = str(operation.get("action") or "")

    if category == "lineup" and action == "ready":
        current_lineup = merged.get("lineupSelectorState")
        incoming_lineup = next_snapshot.get("lineupSelectorState")
        if not isinstance(current_lineup, dict) or not isinstance(incoming_lineup, dict):
            return merged
        if current_lineup.get("mapIndex") != incoming_lineup.get("mapIndex"):
            return merged
        incoming_values = incoming_lineup.get("values")
        incoming_ready = incoming_lineup.get("ready")
        if isinstance(incoming_values, dict) and isinstance(incoming_values.get(side), dict):
            current_lineup.setdefault("values", {})[side] = deepcopy(incoming_values[side])
        if isinstance(incoming_ready, dict):
            current_lineup.setdefault("ready", {})[side] = bool(incoming_ready.get(side))
        return merged

    if category == "pause" and action.startswith("score_team_"):
        current_score = merged.get("scoreSelectorState")
        incoming_score = next_snapshot.get("scoreSelectorState")
        if not isinstance(current_score, dict) or not isinstance(incoming_score, dict):
            return merged
        if current_score.get("mapIndex") != incoming_score.get("mapIndex"):
            return merged
        incoming_pauses = incoming_score.get("teamPauses")
        if isinstance(incoming_pauses, dict) and isinstance(incoming_pauses.get(side), dict):
            current_score.setdefault("teamPauses", {})[side] = deepcopy(incoming_pauses[side])
        pauses = current_score.get("teamPauses") if isinstance(current_score.get("teamPauses"), dict) else {}
        active_entries = [
            value for value in pauses.values()
            if isinstance(value, dict) and value.get("active")
        ]
        if not active_entries:
            current_score["countdownPauseStartedAt"] = None
        elif not isinstance(current_score.get("countdownPauseStartedAt"), (int, float)):
            starts = [value.get("startedAt") for value in active_entries if isinstance(value.get("startedAt"), (int, float))]
            current_score["countdownPauseStartedAt"] = min(starts) if starts else None
        return merged

    if action == "interactive_random_submitted":
        current_random = merged.get("interactiveRandomState")
        incoming_random = next_snapshot.get("interactiveRandomState")
        if not isinstance(current_random, dict) or not isinstance(incoming_random, dict):
            return merged
        if (
            current_random.get("purpose") != incoming_random.get("purpose")
            or current_random.get("mapIndex") != incoming_random.get("mapIndex")
        ):
            return merged
        incoming_choices = incoming_random.get("choices")
        if isinstance(incoming_choices, dict):
            current_random.setdefault("choices", {})[side] = incoming_choices.get(side)
        choices = current_random.get("choices") if isinstance(current_random.get("choices"), dict) else {}
        if choices.get("left") in {0, 1} and choices.get("right") in {0, 1}:
            resolved_side = "left" if (choices["left"] ^ choices["right"]) == 0 else "right"
            current_random["resolvedSide"] = resolved_side
            incoming_results = next_snapshot.get("interactiveRandomResults")
            if isinstance(incoming_results, dict):
                merged["interactiveRandomResults"] = deepcopy(incoming_results)
        return merged

    if category == "notice" and action == "acknowledged":
        current_notice = merged.get("teamAckNotice")
        if not isinstance(current_notice, dict):
            return merged
        current_notice.setdefault("acknowledged", {})[side] = True
        if all(bool(current_notice["acknowledged"].get(candidate)) for candidate in ("left", "right")):
            merged["teamAckNotice"] = None
        return merged

    return merged


def snapshot_progress_key(snapshot: Any) -> tuple[int, int, int]:
    """Return a monotonic BP-stage key so an old full snapshot cannot rewind a room."""
    if not isinstance(snapshot, dict):
        return (-1, -1, -1)
    state = snapshot.get("currentState") if isinstance(snapshot.get("currentState"), dict) else {}
    maps = state.get("maps") if isinstance(state.get("maps"), list) else []
    completed_count = 0
    for item in maps:
        if isinstance(item, dict) and item.get("status") == "completed":
            completed_count += 1
        else:
            break

    stages: list[tuple[str, int]] = [
        ("mapSelectorState", 1),
        ("sideSelectorState", 2),
        ("lineupSelectorState", 3),
        ("banSelectorState", 4),
        ("scoreSelectorState", 7),
        ("restState", 8),
    ]
    for field, rank in stages:
        value = snapshot.get(field)
        if not isinstance(value, dict) or not value.get("open"):
            continue
        map_index = value.get("targetMapIndex") if field == "mapSelectorState" else value.get("mapIndex")
        if not isinstance(map_index, int):
            map_index = completed_count
        if field == "banSelectorState":
            rank += {"order-choice": 0, "first-ban": 1, "second-ban": 2}.get(value.get("step"), 0)
        if field == "restState" and 0 <= map_index < len(maps):
            item = maps[map_index]
            if isinstance(item, dict) and item.get("status") != "completed":
                rank = 0
        return (completed_count, map_index, rank)

    return (completed_count, completed_count, 9 if completed_count else 0)


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


def unlimited_create_hash() -> str:
    return os.environ.get("OW_UNLIMITED_CREATE_HASH") or DEFAULT_UNLIMITED_CREATE_HASH


def is_unlimited_create_hash(value: str) -> bool:
    return secrets.compare_digest(value, unlimited_create_hash())


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


def format_room_token_payload(
    room: dict[str, Any], portal_code: str, notification_duration_seconds: Any = None
) -> dict[str, Any]:
    config_state = ensure_room_config_unlocked(room)
    return {
        "room": {
            "id": room.get("id"),
            "createdAt": room.get("createdAt"),
            "lastActiveAt": room.get("lastActiveAt"),
            "closedAt": None,
            "settings": room.get("settings"),
            "config": config_state,
            "presence": format_room_presence(room),
        },
        "portal": {"code": portal_code, **ROOM_ROLES[portal_code]},
        "notificationDurationSeconds": clamp_int(
            notification_duration_seconds,
            1,
            300,
            DEFAULT_GLOBAL_SETTINGS["notificationDurationSeconds"],
        ),
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
    return catalog_data.build_catalog_response(
        ASSETS_DATA_PATH,
        BUNDLED_TRANSLATION_PATH,
        RUNTIME_CATALOG_DIR,
    )


def is_global_admin_hash_valid(admin_hash: str) -> bool:
    with room_store_lock:
        store = load_room_store_unlocked()
        return is_admin_hash_valid_unlocked(store, admin_hash)


def current_catalog_refresh_job_unlocked() -> dict[str, Any] | None:
    if active_catalog_refresh_job_id is None:
        return None
    job = catalog_refresh_jobs.get(active_catalog_refresh_job_id)
    return deepcopy(job) if job else None


def start_catalog_refresh_job() -> tuple[dict[str, Any], bool]:
    global active_catalog_refresh_job_id

    with catalog_refresh_lock:
        current = current_catalog_refresh_job_unlocked()
        if current and current.get("status") in {"queued", "running"}:
            return current, False

        job_id = secrets.token_hex(12)
        job = {
            "id": job_id,
            "status": "queued",
            "stage": "queued",
            "progress": 0,
            "message": "任务已进入队列",
            "createdAt": current_timestamp(),
            "startedAt": None,
            "finishedAt": None,
            "error": None,
            "result": None,
        }
        catalog_refresh_jobs[job_id] = job
        active_catalog_refresh_job_id = job_id

    thread = threading.Thread(
        target=run_catalog_refresh_job,
        args=(job_id,),
        name=f"catalog-refresh-{job_id[:8]}",
        daemon=True,
    )
    thread.start()
    return deepcopy(job), True


def run_catalog_refresh_job(job_id: str) -> None:
    global active_catalog_refresh_job_id

    def report(stage: str, percent: int, message: str) -> None:
        with catalog_refresh_lock:
            job = catalog_refresh_jobs[job_id]
            job.update({"status": "running", "stage": stage, "progress": percent, "message": message})

    with catalog_refresh_lock:
        catalog_refresh_jobs[job_id].update(
            {"status": "running", "startedAt": current_timestamp(), "message": "正在连接 Fandom"}
        )

    try:
        assets = catalog_data.refresh_runtime_catalog(RUNTIME_CATALOG_DIR, report)
        result = {
            "counts": {
                "modes": len(assets.get("modes", [])),
                "maps": sum(len(items) for items in assets.get("maps", {}).values()),
                "heroes": len(assets.get("heroes", [])),
            },
            "catalogHash": catalog_data.compute_catalog_hash(assets),
            "translationTemplate": catalog_data.build_translation_template(assets),
        }
        with catalog_refresh_lock:
            catalog_refresh_jobs[job_id].update(
                {
                    "status": "completed",
                    "stage": "completed",
                    "progress": 100,
                    "message": "英文目录更新完成",
                    "finishedAt": current_timestamp(),
                    "result": result,
                }
            )
    except Exception as exc:
        with catalog_refresh_lock:
            catalog_refresh_jobs[job_id].update(
                {
                    "status": "failed",
                    "stage": "failed",
                    "message": "更新失败，已保留上一版目录",
                    "finishedAt": current_timestamp(),
                    "error": str(exc),
                }
            )
    finally:
        with catalog_refresh_lock:
            if active_catalog_refresh_job_id == job_id:
                active_catalog_refresh_job_id = job_id


def load_settings_preset() -> dict[str, Any]:
    if SETTINGS_PRESETS_PATH.exists():
        with SETTINGS_PRESETS_PATH.open(encoding="utf-8") as file:
            return json.load(file)

    if SETTINGS_PRESET_PATH.exists():
        with SETTINGS_PRESET_PATH.open(encoding="utf-8") as file:
            return {"presets": {"默认预设": json.load(file)}, "last": "默认预设"}
    return {"presets": {}, "last": None}

def load_assets() -> dict[str, Any]:
    assets, _source = catalog_data.load_catalog_assets(ASSETS_DATA_PATH, RUNTIME_CATALOG_DIR)
    if assets:
        return assets

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


initialize_room_store()
app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5174, debug=True, use_reloader=False)
