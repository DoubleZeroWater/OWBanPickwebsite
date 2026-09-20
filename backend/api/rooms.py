from __future__ import annotations

from flask.typing import ResponseReturnValue

from flask import Flask, jsonify, request

from backend.application import runtime as rt
from backend.domain.contracts import JsonObject


def register(app: Flask) -> None:
    @app.post("/api/rooms")
    def create_room() -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            now = rt.current_timestamp()
            store_changed = rt.cleanup_inactive_rooms_unlocked(store, now)
            client_ip = rt.get_client_ip()
            creation_window = rt.prune_creation_window_unlocked(store, client_ip, now)
            limit = int(store["globalSettings"].get("roomsPerHour") or rt.DEFAULT_GLOBAL_SETTINGS["roomsPerHour"])

            if len(creation_window) >= limit:
                if store_changed:
                    rt.save_room_store_unlocked(store)
                return jsonify({"error": "rate_limited", "limit": limit}), 429

            try:
                room = rt.create_room_record_unlocked(store, now)
            except rt.CodeSpaceExhausted:
                if store_changed:
                    rt.save_room_store_unlocked(store)
                return jsonify({"error": "code_space_exhausted"}), 503

            creation_window.append(now)
            store.setdefault("createLog", {})[client_ip] = creation_window

            try:
                rt.save_room_store_unlocked(store)
            except Exception:
                rt.rollback_created_room_unlocked(store, room)
                raise
            rt.register_authoritative_room_unlocked(room)

        return jsonify(rt.format_created_room(room))

    @app.post("/api/rooms/unlimited/<create_hash>")
    def create_unlimited_room(create_hash: str) -> ResponseReturnValue:
        if not rt.is_unlimited_create_hash(create_hash):
            return jsonify({"error": "not_found"}), 404

        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            now = rt.current_timestamp()
            store_changed = rt.cleanup_inactive_rooms_unlocked(store, now)
            try:
                room = rt.create_room_record_unlocked(store, now)
            except rt.CodeSpaceExhausted:
                if store_changed:
                    rt.save_room_store_unlocked(store)
                return jsonify({"error": "code_space_exhausted"}), 503

            try:
                rt.save_room_store_unlocked(store)
            except Exception:
                rt.rollback_created_room_unlocked(store, room)
                raise
            rt.register_authoritative_room_unlocked(room)

        return jsonify(rt.format_created_room(room))

    @app.get("/api/rooms/token/<room_token>")
    def get_room_token(room_token: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            now = rt.current_timestamp()
            store_changed = rt.cleanup_inactive_rooms_unlocked(store, now)
            lookup = rt.find_room_by_token_unlocked(store, room_token)

            if not lookup:
                if store_changed:
                    rt.save_room_store_unlocked(store)
                if rt.is_archived_token_unlocked(room_token):
                    return jsonify({"error": "closed"}), 410
                return jsonify({"error": "not_found"}), 404

            room, portal_code = lookup
            rt.touch_room_unlocked(room, now)
            rt.save_room_store_unlocked(store)

        return jsonify(rt.format_room_token_payload(
            room,
            portal_code,
            store.get("globalSettings", {}).get("notificationDurationSeconds"),
        ))

    @app.post("/api/rooms/token/<room_token>/sync")
    def sync_authoritative_room(room_token: str) -> ResponseReturnValue:
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            with rt.room_store_lock:
                if rt.is_archived_token_unlocked(room_token):
                    return jsonify({"error": "closed"}), 410
            return jsonify({"error": "not_found"}), 404
        session, portal_code = resolved
        payload = request.get_json(silent=True) or {}
        client = payload.get("check") if isinstance(payload.get("check"), dict) else None
        notification_cursor = payload.get("notificationCursor")
        if isinstance(notification_cursor, bool) or not isinstance(notification_cursor, int):
            notification_cursor = None
        return jsonify(session.heartbeat(portal_code, client, notification_cursor))

    @app.post("/api/rooms/token/<room_token>/actions")
    def apply_authoritative_action(room_token: str) -> ResponseReturnValue:
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            return jsonify({"error": "not_found"}), 404
        session, portal_code = resolved
        payload = request.get_json(silent=True) or {}
        action_type = payload.get("type")
        details = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
        supplied_check = payload.get("check") if isinstance(payload.get("check"), dict) else {}
        expected = {
            "epoch": payload.get("epoch", supplied_check.get("epoch")),
            "phaseId": payload.get("phaseId", supplied_check.get("phaseId")),
            "runtimeId": payload.get("runtimeId", supplied_check.get("runtimeId")),
        }
        request_id = payload.get("commandId")
        notification_cursor = payload.get("notificationCursor")
        if isinstance(notification_cursor, bool) or not isinstance(notification_cursor, int):
            notification_cursor = None
        if not isinstance(action_type, str) or not isinstance(request_id, str):
            return jsonify({"error": "invalid_action"}), 400
        try:
            result = session.apply_action(
                portal_code,
                action_type,
                details,
                expected,
                request_id,
                notification_cursor,
            )
        except rt.StateActionError as exc:
            body: JsonObject = {"error": exc.code, "message": exc.message}
            if exc.code in {"missing_command_context", "stale_epoch", "stale_phase", "stale_runtime"}:
                body.update(session.response(
                    notification_cursor=notification_cursor,
                    force_full=True,
                    portal_code=portal_code,
                ))
            return jsonify(body), exc.status_code
        rt.touch_authoritative_room(room_token)
        return jsonify(result)

    @app.get("/api/rooms/token/<room_token>/status-history")
    def get_authoritative_history(room_token: str) -> ResponseReturnValue:
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            return jsonify({"error": "not_found"}), 404
        session, portal_code = resolved
        if portal_code != "C":
            return jsonify({"error": "forbidden"}), 403
        return jsonify({"items": session.history_summary()})

    @app.post("/api/rooms/token/<room_token>/rollback")
    def rollback_authoritative_status(room_token: str) -> ResponseReturnValue:
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            return jsonify({"error": "not_found"}), 404
        session, portal_code = resolved
        if portal_code != "C":
            return jsonify({"error": "forbidden"}), 403
        payload = request.get_json(silent=True) or {}
        revision = payload.get("revision")
        notification_cursor = payload.get("notificationCursor")
        if isinstance(notification_cursor, bool) or not isinstance(notification_cursor, int):
            notification_cursor = None
        if isinstance(revision, bool) or not isinstance(revision, int):
            return jsonify({"error": "invalid_revision"}), 400
        try:
            result = session.rollback(revision, notification_cursor)
        except rt.StateActionError as exc:
            return jsonify({"error": exc.code, "message": exc.message}), exc.status_code
        rt.touch_authoritative_room(room_token)
        return jsonify(result)

    @app.get("/api/rooms/token/<room_token>/config-presets")
    def get_room_config_presets(room_token: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            lookup = rt.find_room_by_token_unlocked(store, room_token)
            if not lookup:
                return jsonify({"error": "not_found"}), 404
            _room, portal_code = lookup
            if portal_code != "C":
                return jsonify({"error": "forbidden"}), 403
            return jsonify({"items": rt.load_all_config_presets()})

    @app.get("/api/rooms/token/<room_token>/config")
    def get_room_config(room_token: str) -> ResponseReturnValue:
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            return jsonify({"error": "not_found"}), 404
        session, _portal_code = resolved
        return jsonify(rt.format_authoritative_config(session))

    @app.put("/api/rooms/token/<room_token>/config")
    def update_room_config(room_token: str) -> ResponseReturnValue:
        payload = request.get_json(silent=True) or {}
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            return jsonify({"error": "not_found"}), 404
        session, portal_code = resolved
        if portal_code != "C":
            return jsonify({"error": "forbidden"}), 403
        try:
            session.update_config(payload.get("config", payload))
        except rt.StateValidationError as exc:
            return jsonify({"error": "invalid_config", "details": exc.errors}), 400
        except rt.StateActionError as exc:
            return jsonify({"error": exc.code, "message": exc.message}), exc.status_code
        rt.touch_authoritative_room(room_token)
        return jsonify(rt.format_authoritative_config(session))

    @app.post("/api/rooms/token/<room_token>/config/apply-preset")
    def apply_room_config_preset(room_token: str) -> ResponseReturnValue:
        payload = request.get_json(silent=True) or {}
        preset_id = str(payload.get("presetId") or "")
        resolved = rt.resolve_authoritative_session(room_token)
        if resolved is None:
            return jsonify({"error": "not_found"}), 404
        session, portal_code = resolved
        if portal_code != "C":
            return jsonify({"error": "forbidden"}), 403
        with rt.room_store_lock:
            preset = rt.load_config_preset(preset_id)
        if preset is None:
            return jsonify({"error": "not_found"}), 404
        try:
            session.update_config(preset["config"])
        except (rt.StateValidationError, rt.StateActionError) as exc:
            if isinstance(exc, rt.StateValidationError):
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            return jsonify({"error": exc.code, "message": exc.message}), exc.status_code
        rt.touch_authoritative_room(room_token)
        return jsonify(rt.format_authoritative_config(session, {
            "type": "preset",
            "presetId": preset["id"],
            "presetName": preset["name"],
            "presetRevision": preset["revision"],
        }))
