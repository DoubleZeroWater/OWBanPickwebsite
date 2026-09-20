from __future__ import annotations

import json
import os
import time
from copy import deepcopy
from pathlib import Path

from backend.domain.contracts import (
    HistoryActor,
    HistoryDocument,
    HistoryIndex,
    HistorySummary,
    JsonObject,
    Operation,
    RoomRecord,
    RoomStore,
    RoomTokens,
)
from backend.config import (
    ARCHIVE_KEY_PATTERN,
    ROOM_HISTORY_DIR,
    ROOM_HISTORY_INDEX_PATH,
    ROOM_HISTORY_INDEX_SCHEMA_VERSION,
    ROOM_HISTORY_SCHEMA_VERSION,
    ROOM_ROLES,
    SHORT_CODE_PATTERN,
)
from backend.infrastructure.json_store import save_json_atomic


def build_archive_key(tokens: RoomTokens) -> str:
    return "-".join(str(tokens.get(portal_code) or "") for portal_code in ROOM_ROLES)


def build_initial_history_document(room: RoomRecord) -> HistoryDocument:
    created_at = int(room.get("createdAt") or time.time())
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
        "history": [{
            "sequence": 0,
            "timestamp": created_at,
            "version": int(room.get("version") or 0),
            "actor": {"type": "system", "portalCode": None, "role": "system"},
            "operation": {"category": "lifecycle", "action": "created", "details": {}},
            "snapshot": room.get("snapshot"),
            "config": deepcopy(room.get("config")),
        }],
    }


def create_history_document_unlocked(document: HistoryDocument) -> None:
    history_path = get_history_path(str(document.get("archiveKey") or ""))
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
    room: RoomRecord,
    timestamp: int,
    version: int,
    snapshot: JsonObject | None,
    actor: HistoryActor,
    operation: Operation,
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
    history.append({
        "sequence": last_sequence + 1,
        "timestamp": timestamp,
        "version": version,
        "actor": actor,
        "operation": operation,
        "snapshot": snapshot,
        "config": deepcopy(room.get("config")),
    })
    document.update({
        "history": history,
        "updatedAt": timestamp,
        "lastActiveAt": int(last_active_at if last_active_at is not None else timestamp),
        "currentVersion": version,
        "currentSnapshot": snapshot,
        "currentConfig": deepcopy(room.get("config")),
    })
    if status is not None:
        document.update(status=status, closedAt=closed_at, closeReason=close_reason)

    save_json_atomic(get_history_path_or_raise(archive_key), document)
    update_history_index_unlocked(document)


def get_history_path(archive_key: str) -> Path | None:
    return ROOM_HISTORY_DIR / f"{archive_key}.json" if ARCHIVE_KEY_PATTERN.fullmatch(archive_key) else None


def get_history_path_or_raise(archive_key: str) -> Path:
    history_path = get_history_path(archive_key)
    if history_path is None:
        raise ValueError("Invalid archive key")
    return history_path


def load_history_document_by_key_unlocked(archive_key: str) -> HistoryDocument | None:
    history_path = get_history_path(archive_key)
    if history_path is None or not history_path.is_file():
        return None
    with history_path.open(encoding="utf-8") as file:
        document = json.load(file)
    return document if isinstance(document, dict) else None


def history_summary_from_document(document: HistoryDocument) -> HistorySummary:
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


def empty_history_index() -> HistoryIndex:
    return {"schemaVersion": ROOM_HISTORY_INDEX_SCHEMA_VERSION, "items": {}}


def load_history_index_unlocked() -> HistoryIndex:
    if not ROOM_HISTORY_INDEX_PATH.is_file():
        return rebuild_history_index_unlocked()
    try:
        with ROOM_HISTORY_INDEX_PATH.open(encoding="utf-8") as file:
            index = json.load(file)
    except (OSError, json.JSONDecodeError):
        return rebuild_history_index_unlocked()
    return index if isinstance(index, dict) and isinstance(index.get("items"), dict) else rebuild_history_index_unlocked()


def rebuild_history_index_unlocked() -> HistoryIndex:
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
        if isinstance(document, dict):
            archive_key = str(document.get("archiveKey") or "")
            if ARCHIVE_KEY_PATTERN.fullmatch(archive_key):
                index["items"][archive_key] = history_summary_from_document(document)
    save_json_atomic(ROOM_HISTORY_INDEX_PATH, index)
    return index


def update_history_index_unlocked(document: HistoryDocument) -> None:
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


def reconcile_active_rooms_unlocked(store: RoomStore) -> None:
    active_rooms: list[RoomRecord] = []
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
        if int(document.get("currentVersion") or 0) > int(room.get("version") or 0):
            room["version"] = int(document.get("currentVersion") or 0)
            room["snapshot"] = document.get("currentSnapshot")
        active_rooms.append(room)
    store["rooms"] = active_rooms


def reconcile_active_store_from_history_index_unlocked(store: RoomStore) -> None:
    summaries = load_history_index_unlocked().get("items", {})
    active_rooms: list[RoomRecord] = []
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
