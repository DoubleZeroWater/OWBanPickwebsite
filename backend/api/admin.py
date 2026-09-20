from __future__ import annotations

from flask.typing import ResponseReturnValue

from flask import Flask, jsonify, request, send_file

from backend.application import runtime as rt


def register(app: Flask) -> None:
    @app.get("/api/admin/<admin_hash>/rooms")
    def admin_rooms(admin_hash: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            now = rt.current_timestamp()
            rt.cleanup_inactive_rooms_unlocked(store, now)
            rt.save_room_store_unlocked(store)

        return jsonify({"rooms": [rt.format_admin_room(room) for room in store.get("rooms", [])]})

    @app.post("/api/admin/<admin_hash>/rooms/<room_id>/close")
    def admin_close_room(admin_hash: str, room_id: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            now = rt.current_timestamp()
            rt.cleanup_inactive_rooms_unlocked(store, now)
            room = next((entry for entry in store.get("rooms", []) if entry.get("id") == room_id), None)

            if not room:
                rt.save_room_store_unlocked(store)
                return jsonify({"error": "not_found"}), 404

            rt.close_room_unlocked(room, now, "manual")
            store["rooms"] = [entry for entry in store.get("rooms", []) if entry is not room]
            rt.save_room_store_unlocked(store)

        return jsonify({"ok": True})

    @app.get("/api/admin/<admin_hash>/room-history")
    def admin_room_history(admin_hash: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            now = rt.current_timestamp()
            rt.cleanup_inactive_rooms_unlocked(store, now)
            rt.save_room_store_unlocked(store)
            index = rt.load_history_index_unlocked()
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
            page = rt.clamp_int(request.args.get("page"), 1, 1_000_000, 1)
            page_size = rt.clamp_int(request.args.get("pageSize"), 1, 100, 20)
            start = (page - 1) * page_size
            paged_items = items[start : start + page_size]

        return jsonify({"items": paged_items, "total": len(items), "page": page, "pageSize": page_size})

    @app.get("/api/admin/<admin_hash>/room-history/<archive_key>")
    def admin_room_history_detail(admin_hash: str, archive_key: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            document = rt.load_history_document_by_key_unlocked(archive_key)

            if document is None:
                return jsonify({"error": "not_found"}), 404

        return jsonify(document)

    @app.get("/api/admin/<admin_hash>/room-history/<archive_key>/download")
    def admin_room_history_download(admin_hash: str, archive_key: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            history_path = rt.get_history_path(archive_key)

            if history_path is None or not history_path.is_file():
                return jsonify({"error": "not_found"}), 404

        return send_file(history_path, as_attachment=True, download_name=history_path.name, mimetype="application/json")

    @app.get("/api/admin/<admin_hash>/settings")
    def get_admin_settings(admin_hash: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

        return jsonify(store.get("globalSettings", rt.DEFAULT_GLOBAL_SETTINGS))

    @app.put("/api/admin/<admin_hash>/settings")
    def update_admin_settings(admin_hash: str) -> ResponseReturnValue:
        payload = request.get_json(silent=True) or {}

        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()

            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404

            settings = store.setdefault("globalSettings", dict(rt.DEFAULT_GLOBAL_SETTINGS))
            settings["roomsPerHour"] = rt.clamp_int(payload.get("roomsPerHour"), 1, 500, settings.get("roomsPerHour", 5))
            settings["inactiveTimeoutMinutes"] = rt.clamp_int(
                payload.get("inactiveTimeoutMinutes"),
                1,
                60 * 24 * 30,
                settings.get("inactiveTimeoutMinutes", 30),
            )
            settings["notificationDurationSeconds"] = rt.clamp_int(
                payload.get("notificationDurationSeconds"),
                1,
                300,
                settings.get(
                    "notificationDurationSeconds",
                    rt.DEFAULT_GLOBAL_SETTINGS["notificationDurationSeconds"],
                ),
            )

            if "defaultSettings" in payload:
                settings["defaultSettings"] = payload.get("defaultSettings")

            if "defaultPresetId" in payload:
                default_preset_id = payload.get("defaultPresetId")
                if default_preset_id is not None and rt.load_config_preset(str(default_preset_id)) is None:
                    return jsonify({"error": "preset_not_found"}), 400
                settings["defaultPresetId"] = default_preset_id

            rt.save_room_store_unlocked(store)

        return jsonify(settings)
