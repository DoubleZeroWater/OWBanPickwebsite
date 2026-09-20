from __future__ import annotations

import json
import os
import secrets
import threading
import time
from copy import deepcopy

from flask import request

from backend.domain.contracts import (
    ConfigSource,
    JsonObject,
    PortalCode,
    PresenceMap,
    RoomConfigState,
    RoomRecord,
    RoomStore,
)
from backend.application.catalog_service import (
    build_maps_catalog,
    catalog_refresh_jobs,
    catalog_refresh_lock,
    compute_catalog_hash,
    current_catalog_refresh_job_unlocked,
    hero_ban,
    load_assets,
    map_image,
    mode_icon,
    start_catalog_refresh_job,
)
from backend.application.room_history import (
    append_room_history_unlocked,
    build_archive_key,
    build_initial_history_document,
    create_history_document_unlocked,
    get_history_path,
    load_history_document_by_key_unlocked,
    load_history_index_unlocked,
    rebuild_history_index_unlocked,
    reconcile_active_rooms_unlocked,
    reconcile_active_store_from_history_index_unlocked,
    remove_history_index_entry_unlocked,
)
from backend.application.preset_service import (
    build_room_config,
    ensure_room_config_unlocked,
    get_config_preset_path,
    load_all_config_presets,
    load_config_preset,
    migrate_authoritative_config_presets_unlocked,
    migrate_legacy_config_presets_unlocked,
    save_config_preset,
)
from backend.config import (
    ASSETS_DATA_PATH, BUNDLED_TRANSLATION_PATH, CONFIG_DOCS_DIR,
    CONFIG_PRESETS_DIR, DEFAULT_GLOBAL_SETTINGS,
    DEFAULT_UNLIMITED_CREATE_HASH, DIST_DIR, MAP_PLACEHOLDER,
    MAX_SHORT_CODE_ATTEMPTS, PORTAL_PRESENCE_TTL_SECONDS, ROOM_HISTORY_DIR,
    ROOM_ROLES, ROOM_STORE_PATH, ROOM_STORE_SCHEMA_VERSION,
    RUNTIME_CATALOG_DIR, SHORT_CODE_ALPHABET, SHORT_CODE_LENGTH,
    SHORT_CODE_PATTERN, STATIC_DIR,
)
from backend.domain.room_engine import RoomSession, RoomStateRegistry, StateActionError
from backend.domain.state_models import (
    StateValidationError,
    default_config,
    hero_pool_from_catalog,
    map_capabilities_from_catalog,
)
from backend.infrastructure.json_store import save_json_atomic


room_store_lock = threading.Lock()
authoritative_rooms = RoomStateRegistry()

class CodeSpaceExhausted(RuntimeError):
    pass


def current_timestamp() -> int:
    return int(time.time())


def load_room_store_unlocked() -> RoomStore:
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
    store: RoomStore = {
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


def save_room_store_unlocked(store: RoomStore) -> None:
    save_json_atomic(ROOM_STORE_PATH, store)



def ensure_room_presence_unlocked(room: RoomRecord) -> PresenceMap:
    raw_presence = room.get("presence") if isinstance(room.get("presence"), dict) else {}
    presence: PresenceMap = {}
    for portal_code in ROOM_ROLES:
        raw_entry = raw_presence.get(portal_code) if isinstance(raw_presence.get(portal_code), dict) else {}
        presence[portal_code] = {
            "lastSeenAt": int(raw_entry.get("lastSeenAt") or 0),
            "ready": bool(raw_entry.get("ready")) if portal_code in {"A", "B"} else False,
            "nameConfirmed": bool(raw_entry.get("nameConfirmed")) if portal_code in {"A", "B"} else False,
        }
    room["presence"] = presence
    return presence


def format_room_presence(room: RoomRecord, now: int | None = None) -> PresenceMap:
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



def initialize_room_store() -> None:
    with room_store_lock:
        authoritative_rooms.clear()
        ROOM_HISTORY_DIR.mkdir(parents=True, exist_ok=True)
        CONFIG_PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        rebuild_history_index_unlocked()
        store = load_room_store_unlocked()
        migrate_legacy_config_presets_unlocked(store)
        migrate_authoritative_config_presets_unlocked()
        for room in store.get("rooms", []):
            ensure_room_config_unlocked(room)
        reconcile_active_rooms_unlocked(store)
        now = current_timestamp()
        for room in list(store.get("rooms", [])):
            close_room_unlocked(room, now, "server_restart")
        store["rooms"] = []
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


def collect_active_codes(store: RoomStore) -> set[str]:
    codes: set[str] = set()

    for room in store.get("rooms", []):
        room_id = room.get("id")

        if isinstance(room_id, str):
            codes.add(room_id)

        tokens = room.get("tokens") if isinstance(room.get("tokens"), dict) else {}
        codes.update(str(token) for token in tokens.values())

    return codes


def create_room_record_unlocked(store: RoomStore, now: int) -> RoomRecord:
    active_codes = collect_active_codes(store)

    for _ in range(MAX_SHORT_CODE_ATTEMPTS):
        candidate_codes = set(active_codes)
        room_id = allocate_short_code(candidate_codes)
        tokens = {portal_code: allocate_short_code(candidate_codes) for portal_code in ROOM_ROLES}
        archive_key = build_archive_key(tokens)
        history_path = get_history_path(archive_key)

        if history_path is None or history_path.exists():
            continue

        room: RoomRecord = {
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


def rollback_created_room_unlocked(store: RoomStore, room: RoomRecord) -> None:
    store["rooms"] = [entry for entry in store.get("rooms", []) if entry is not room]
    authoritative_rooms.remove(str(room.get("id") or ""))
    archive_key = str(room.get("archiveKey") or "")
    history_path = get_history_path(archive_key)

    if history_path and history_path.exists():
        history_path.unlink()

    try:
        remove_history_index_entry_unlocked(archive_key)
    except Exception:
        pass


def close_room_unlocked(room: RoomRecord, now: int, reason: str) -> None:
    archive_key = str(room.get("archiveKey") or "")
    document = load_history_document_by_key_unlocked(archive_key)

    if document is None:
        raise FileNotFoundError(f"Missing history document for room {room.get('id')}")

    if document.get("status") != "active":
        return

    is_manual = reason == "manual"
    is_closed = reason in {"manual", "server_restart"}
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
            "action": "closed" if is_closed else "expired",
            "details": {"reason": reason},
        },
        status="closed" if is_closed else "expired",
        closed_at=now,
        close_reason=reason,
        last_active_at=int(room.get("lastActiveAt") or room.get("createdAt") or now),
    )
    authoritative_rooms.remove(str(room.get("id") or ""))


def get_client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")

    if forwarded:
        return forwarded.split(",", 1)[0].strip()

    return request.remote_addr or "unknown"


def unlimited_create_hash() -> str:
    return os.environ.get("OW_UNLIMITED_CREATE_HASH") or DEFAULT_UNLIMITED_CREATE_HASH


def is_unlimited_create_hash(value: str) -> bool:
    return secrets.compare_digest(value, unlimited_create_hash())


def prune_creation_window_unlocked(store: RoomStore, client_ip: str, now: int) -> list[int]:
    create_log = store.setdefault("createLog", {})
    window_start = now - 3600
    timestamps = [int(value) for value in create_log.get(client_ip, []) if int(value) >= window_start]
    create_log[client_ip] = timestamps
    return timestamps


def cleanup_inactive_rooms_unlocked(store: RoomStore, now: int) -> bool:
    timeout_minutes = int(store.get("globalSettings", {}).get("inactiveTimeoutMinutes") or 30)
    timeout_seconds = timeout_minutes * 60
    active_rooms: list[RoomRecord] = []
    changed = False

    for room in store.get("rooms", []):
        if room.get("closedAt"):
            close_room_unlocked(room, int(room.get("closedAt") or now), "manual")
            changed = True
            continue

        last_active = int(room.get("lastActiveAt") or room.get("createdAt") or now)

        session = authoritative_rooms.get(str(room.get("id") or ""))
        has_live_portal = bool(
            session
            and session.has_live_presence()
        )
        if now - last_active > timeout_seconds and not has_live_portal:
            close_room_unlocked(room, now, "inactive_timeout")
            changed = True
            continue

        active_rooms.append(room)

    if changed:
        store["rooms"] = active_rooms

    return changed


def touch_room_unlocked(room: RoomRecord, now: int) -> None:
    room["lastActiveAt"] = now


def find_room_by_token_unlocked(store: RoomStore, token: str) -> tuple[RoomRecord, PortalCode] | None:
    if not SHORT_CODE_PATTERN.fullmatch(token):
        return None

    for room in store.get("rooms", []):
        tokens = room.get("tokens") if isinstance(room.get("tokens"), dict) else {}

        for portal_code, room_token in tokens.items():
            if secrets.compare_digest(str(room_token), token):
                return room, portal_code

    return None


def register_authoritative_room_unlocked(room: RoomRecord) -> RoomSession:
    room_id = str(room.get("id") or "")
    existing = authoritative_rooms.get(room_id)
    if existing is not None:
        return existing
    config_state = ensure_room_config_unlocked(room)
    assets = load_assets()
    catalog_hash = compute_catalog_hash(assets)
    return authoritative_rooms.create(
        room_id,
        {str(code): str(token) for code, token in (room.get("tokens") or {}).items()},
        config_state.get("value") if isinstance(config_state.get("value"), dict) else default_config(),
        catalog_hash,
        hero_pool_from_catalog(assets.get("heroes", [])),
        map_capabilities_from_catalog(assets),
    )


def resolve_authoritative_session(token: str) -> tuple[RoomSession, PortalCode] | None:
    if not SHORT_CODE_PATTERN.fullmatch(token):
        return None
    return authoritative_rooms.resolve(token)


def touch_authoritative_room(token: str) -> None:
    with room_store_lock:
        store = load_room_store_unlocked()
        lookup = find_room_by_token_unlocked(store, token)
        if lookup is None:
            return
        room, _portal = lookup
        touch_room_unlocked(room, current_timestamp())
        save_room_store_unlocked(store)


def is_archived_token_unlocked(token: str) -> bool:
    if not SHORT_CODE_PATTERN.fullmatch(token):
        return False

    index = load_history_index_unlocked()

    for summary in index.get("items", {}).values():
        tokens = summary.get("tokens") if isinstance(summary.get("tokens"), dict) else {}

        if any(secrets.compare_digest(str(value), token) for value in tokens.values()):
            return True

    return False


def is_admin_hash_valid_unlocked(store: RoomStore, admin_hash: str) -> bool:
    return secrets.compare_digest(str(store.get("adminHash") or ""), admin_hash)


def format_created_room(room: RoomRecord) -> JsonObject:
    return {
        "roomId": room["id"],
        "createdAt": room["createdAt"],
        "lastActiveAt": room["lastActiveAt"],
        "links": format_room_links(room),
    }


def format_room_links(room: RoomRecord) -> JsonObject:
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
    room: RoomRecord, portal_code: PortalCode, notification_duration_seconds: object = None
) -> JsonObject:
    config_state = ensure_room_config_unlocked(room)
    session = register_authoritative_room_unlocked(room)
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
        "authoritativeState": session.response(force_full=True, portal_code=portal_code),
    }


def format_authoritative_config(session: RoomSession, source: ConfigSource | None = None) -> RoomConfigState:
    phase = session.status.phase["type"]
    return {
        "status": "draft" if phase == "configuring" else "ready" if phase == "waiting_ready" else "locked",
        "revision": session.status.revision,
        "source": source or {"type": "manual"},
        "value": deepcopy(session.status.config),
        "confirmedAt": None,
        "lockedAt": None,
    }


def format_admin_room(room: RoomRecord) -> JsonObject:
    return {
        "id": room.get("id"),
        "createdAt": room.get("createdAt"),
        "lastActiveAt": room.get("lastActiveAt"),
        "closedAt": None,
        "version": room.get("version", 0),
        "configStatus": ensure_room_config_unlocked(room).get("status"),
        "links": format_room_links(room),
    }


def clamp_int(value: object, minimum: int, maximum: int, fallback: object) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = int(fallback)

    return max(minimum, min(maximum, number))


def _pending_map(index: int) -> JsonObject:
    return {
        "id": f"tbd-{index}", "mode": None, "modeIconUrl": None,
        "nameZh": None, "nameEn": None, "status": "tbd",
        "imageUrl": MAP_PLACEHOLDER,
        "score": {"left": None, "right": None},
        "bans": {"left": None, "right": None}, "firstBanSide": None,
    }


def build_match_state(room_code: str) -> JsonObject:
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
            *(_pending_map(index) for index in range(3, 6)),
        ],
    }


def is_global_admin_hash_valid(admin_hash: str) -> bool:
    with room_store_lock:
        store = load_room_store_unlocked()
        return is_admin_hash_valid_unlocked(store, admin_hash)
