from __future__ import annotations

from flask.typing import ResponseReturnValue

from flask import Flask, jsonify, redirect, request, send_from_directory

from backend import catalog as catalog_data
from backend.application import runtime as rt


def register(app: Flask) -> None:
    @app.get("/")
    def index() -> ResponseReturnValue:
        return frontend_page()

    @app.get("/r/<room_token>")
    def room_page(room_token: str) -> ResponseReturnValue:
        return frontend_page()

    @app.get("/admin/<admin_hash>")
    def admin_page(admin_hash: str) -> ResponseReturnValue:
        return frontend_page()

    @app.get("/debug")
    def debug_page() -> ResponseReturnValue:
        return frontend_page()

    @app.get("/<portal_code>")
    def match_portal_page(portal_code: str) -> ResponseReturnValue:
        if portal_code.upper() not in {"A", "B", "C", "D"}:
            return redirect("/")

        return frontend_page()

    def frontend_page() -> ResponseReturnValue:
        if not (rt.DIST_DIR / "index.html").exists():
            return (
                "Frontend assets are missing. Run `npm install` and `npm run build` "
                "before opening this site.",
                503,
            )
        return send_from_directory(rt.DIST_DIR, "index.html")

    @app.get("/assets/<path:filename>")
    def frontend_assets(filename: str) -> ResponseReturnValue:
        return send_from_directory(rt.DIST_DIR / "assets", filename)

    @app.get("/api/matches/<room_code>/state")
    def match_state(room_code: str) -> ResponseReturnValue:
        return jsonify(rt.build_match_state(room_code))

    @app.get("/api/maps/catalog")
    def maps_catalog() -> ResponseReturnValue:
        response = jsonify(rt.build_maps_catalog())
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/runtime-assets/<path:filename>")
    def runtime_catalog_asset(filename: str) -> ResponseReturnValue:
        assets, source = catalog_data.load_catalog_assets(rt.ASSETS_DATA_PATH, rt.RUNTIME_CATALOG_DIR)
        normalized = filename.replace("\\", "/").strip("/")
        if source != "runtime" or normalized not in catalog_data.allowed_runtime_asset_paths(assets):
            return jsonify({"error": "not_found"}), 404
        return send_from_directory(rt.RUNTIME_CATALOG_DIR / "current", normalized)

    @app.get("/api/admin/<admin_hash>/catalog-maintenance")
    def admin_catalog_maintenance(admin_hash: str) -> ResponseReturnValue:
        if not rt.is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        payload = catalog_data.build_maintenance_status(
            rt.ASSETS_DATA_PATH,
            rt.BUNDLED_TRANSLATION_PATH,
            rt.RUNTIME_CATALOG_DIR,
        )
        with rt.catalog_refresh_lock:
            payload["job"] = rt.current_catalog_refresh_job_unlocked()
        return jsonify(payload)

    @app.post("/api/admin/<admin_hash>/catalog-refresh")
    def admin_catalog_refresh(admin_hash: str) -> ResponseReturnValue:
        if not rt.is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        job, started = rt.start_catalog_refresh_job()
        return jsonify(job), 202 if started else 409

    @app.get("/api/admin/<admin_hash>/catalog-refresh/<job_id>")
    def admin_catalog_refresh_status(admin_hash: str, job_id: str) -> ResponseReturnValue:
        if not rt.is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        with rt.catalog_refresh_lock:
            job = rt.catalog_refresh_jobs.get(job_id)
            if job is None:
                return jsonify({"error": "not_found"}), 404
            return jsonify(rt.deepcopy(job))

    @app.put("/api/admin/<admin_hash>/catalog-translation")
    def admin_catalog_translation(admin_hash: str) -> ResponseReturnValue:
        if not rt.is_global_admin_hash_valid(admin_hash):
            return jsonify({"error": "not_found"}), 404
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "invalid_json_object"}), 400
        assets, _source = catalog_data.load_catalog_assets(rt.ASSETS_DATA_PATH, rt.RUNTIME_CATALOG_DIR)
        diagnostics = catalog_data.validate_translation(assets, payload)
        catalog_data.save_json_atomic(rt.RUNTIME_CATALOG_DIR / "translation.json", payload)
        return jsonify({"ok": True, "active": diagnostics["valid"], "diagnostics": diagnostics})

    @app.get("/docs/config/<path:filename>")
    def config_document(filename: str) -> ResponseReturnValue:
        if filename not in {"match-config.example.json", "match-config.schema.json", "match-config.md"}:
            return jsonify({"error": "not_found"}), 404
        return send_from_directory(rt.CONFIG_DOCS_DIR, filename)
