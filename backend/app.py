from __future__ import annotations

import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flask import Flask

from backend.api import admin, pages, presets, rooms
from backend.application import runtime as rt


def create_app() -> Flask:
    app = Flask(__name__, static_folder=str(rt.STATIC_DIR), static_url_path="/static")
    pages.register(app)
    presets.register(app)
    rooms.register(app)
    admin.register(app)
    return app


# Compatibility exports retained for existing integrations and tests.
initialize_room_store = rt.initialize_room_store
ROOM_ROLES = rt.ROOM_ROLES
ROOM_HISTORY_DIR = rt.ROOM_HISTORY_DIR
ROOM_STORE_PATH = rt.ROOM_STORE_PATH


def __getattr__(name: str):
    return getattr(rt, name)


rt.initialize_room_store()
app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5174, debug=True, use_reloader=False)
