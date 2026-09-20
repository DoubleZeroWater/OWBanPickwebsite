from __future__ import annotations

from flask.typing import ResponseReturnValue

from flask import Flask, jsonify, request

from backend.application import runtime as rt


def register(app: Flask) -> None:
    @app.get("/api/settings/preset")
    def get_settings_preset() -> ResponseReturnValue:
        presets = rt.load_all_config_presets()
        return jsonify({
            "presets": {preset["name"]: preset["config"] for preset in presets},
            "last": presets[0]["name"] if presets else None,
        })

    @app.post("/api/settings/preset")
    def save_settings_preset() -> ResponseReturnValue:
        return jsonify({"error": "global_admin_required"}), 403

    @app.get("/api/admin/<admin_hash>/config-presets")
    def admin_list_config_presets(admin_hash: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            return jsonify({"items": rt.load_all_config_presets()})

    @app.post("/api/admin/<admin_hash>/config-presets")
    def admin_create_config_preset(admin_hash: str) -> ResponseReturnValue:
        payload = request.get_json(silent=True) or {}
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            try:
                preset = rt.save_config_preset(payload, replace=False)
            except rt.StateValidationError as exc:
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            except FileExistsError:
                return jsonify({"error": "already_exists"}), 409
            except ValueError as exc:
                return jsonify({"error": "invalid_preset", "message": str(exc)}), 400
        return jsonify(preset), 201

    @app.put("/api/admin/<admin_hash>/config-presets/<preset_id>")
    def admin_update_config_preset(admin_hash: str, preset_id: str) -> ResponseReturnValue:
        payload = request.get_json(silent=True) or {}
        payload = {**payload, "id": preset_id}
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            try:
                preset = rt.save_config_preset(payload, replace=True)
            except rt.StateValidationError as exc:
                return jsonify({"error": "invalid_config", "details": exc.errors}), 400
            except FileNotFoundError:
                return jsonify({"error": "not_found"}), 404
            except ValueError as exc:
                return jsonify({"error": "invalid_preset", "message": str(exc)}), 400
        return jsonify(preset)

    @app.delete("/api/admin/<admin_hash>/config-presets/<preset_id>")
    def admin_delete_config_preset(admin_hash: str, preset_id: str) -> ResponseReturnValue:
        with rt.room_store_lock:
            store = rt.load_room_store_unlocked()
            if not rt.is_admin_hash_valid_unlocked(store, admin_hash):
                return jsonify({"error": "not_found"}), 404
            if store.get("globalSettings", {}).get("defaultPresetId") == preset_id:
                return jsonify({
                    "error": "active_default_preset",
                    "message": "当前默认模板不能删除，请先切换新房间默认模板",
                }), 409
            path = rt.get_config_preset_path(preset_id)
            if path is None or not path.exists():
                return jsonify({"error": "not_found"}), 404
            path.unlink()
        return jsonify({"ok": True})
