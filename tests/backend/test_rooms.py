from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


TEST_RUNTIME = tempfile.TemporaryDirectory(prefix="owbanpick-tests-")
os.environ["OW_RUNTIME_DIR"] = TEST_RUNTIME.name

from backend import app as room_app  # noqa: E402


class RoomPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        runtime_dir = Path(TEST_RUNTIME.name)
        runtime_dir.mkdir(parents=True, exist_ok=True)

        for child in runtime_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()

        room_app.initialize_room_store()
        room_app.app.config.update(TESTING=True)
        self.client = room_app.app.test_client()

    def create_room(self) -> dict:
        response = self.client.post("/api/rooms")
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        return response.get_json()

    def read_store(self) -> dict:
        return json.loads(room_app.ROOM_STORE_PATH.read_text(encoding="utf-8"))

    def history_path(self, created_room: dict) -> Path:
        archive_key = "-".join(created_room["links"][code]["hash"] for code in room_app.ROOM_ROLES)
        return room_app.ROOM_HISTORY_DIR / f"{archive_key}.json"

    def read_history(self, created_room: dict) -> dict:
        return json.loads(self.history_path(created_room).read_text(encoding="utf-8"))

    def admin_hash(self) -> str:
        return str(self.read_store()["adminHash"])

    def close_room(self, created_room: dict):
        return self.client.post(
            f"/api/admin/{self.admin_hash()}/rooms/{created_room['roomId']}/close"
        )

    def test_new_room_uses_five_unique_short_codes_and_creates_history(self) -> None:
        room = self.create_room()
        codes = [room["roomId"], *(room["links"][code]["hash"] for code in room_app.ROOM_ROLES)]

        self.assertEqual(len(set(codes)), 5)
        self.assertTrue(all(re.fullmatch(r"[0-9a-z]{4}", code) for code in codes))
        self.assertGreater(len(self.admin_hash()), 4)
        self.assertEqual(self.read_store()["schemaVersion"], room_app.ROOM_STORE_SCHEMA_VERSION)

        history = self.read_history(room)
        self.assertEqual(history["archiveKey"], self.history_path(room).stem)
        self.assertEqual(history["roomId"], room["roomId"])
        self.assertEqual(history["status"], "active")
        self.assertEqual(history["history"][0]["operation"]["action"], "created")

    def test_generator_retries_collisions_and_never_reuses_archive_tuple(self) -> None:
        first_values = ["aaaa", "aaaa", "bbbb", "cccc", "dddd", "eeee"]

        with patch.object(room_app, "generate_short_code", side_effect=first_values):
            first_room = self.create_room()

        self.assertEqual(first_room["roomId"], "aaaa")
        self.assertEqual(
            [first_room["links"][code]["hash"] for code in room_app.ROOM_ROLES],
            ["bbbb", "cccc", "dddd", "eeee"],
        )
        self.assertEqual(self.close_room(first_room).status_code, 200)

        second_values = [
            "ffff", "bbbb", "cccc", "dddd", "eeee",
            "gggg", "bbbb", "hhhh", "iiii", "jjjj",
        ]

        with patch.object(room_app, "generate_short_code", side_effect=second_values):
            second_room = self.create_room()

        self.assertEqual(second_room["links"]["A"]["hash"], "bbbb")
        self.assertNotEqual(self.history_path(first_room).stem, self.history_path(second_room).stem)
        self.assertTrue(self.history_path(first_room).is_file())
        self.assertTrue(self.history_path(second_room).is_file())

    def test_code_space_exhaustion_returns_503_without_partial_room(self) -> None:
        with (
            patch.object(room_app, "MAX_SHORT_CODE_ATTEMPTS", 3),
            patch.object(room_app, "generate_short_code", return_value="aaaa"),
        ):
            response = self.client.post("/api/rooms")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.get_json()["error"], "code_space_exhausted")
        self.assertEqual(self.read_store()["rooms"], [])
        self.assertEqual(list(room_app.ROOM_HISTORY_DIR.glob("*.json")), [])

    def test_successful_snapshot_is_audited_and_conflict_is_not(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/config/confirm").status_code,
            200,
        )
        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/start").status_code,
            200,
        )
        snapshot = {"roomStarted": True, "marker": "accepted"}
        accepted = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": 0,
                "snapshot": snapshot,
                "operation": {"category": "room", "action": "started", "details": {}},
            },
        )
        conflicted = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": 0,
                "snapshot": {"marker": "rejected"},
                "operation": {"category": "room", "action": "reset", "details": {}},
            },
        )

        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(conflicted.status_code, 409)
        history = self.read_history(room)
        self.assertEqual(len(history["history"]), 4)
        event = history["history"][-1]
        self.assertEqual(event["snapshot"]["marker"], "accepted")
        self.assertEqual(event["snapshot"]["settingsState"], history["currentConfig"]["value"])
        self.assertEqual(event["actor"], {"type": "portal", "portalCode": "C", "role": "admin"})
        self.assertEqual(event["operation"]["action"], "started")

        self.client.get(f"/api/rooms/token/{admin_token}/snapshot")
        self.assertEqual(len(self.read_history(room)["history"]), 4)

    def test_global_presets_are_validated_persisted_and_copied_into_rooms(self) -> None:
        room = self.create_room()
        admin_hash = self.admin_hash()
        admin_token = room["links"]["C"]["hash"]
        team_token = room["links"]["A"]["hash"]
        config = room_app.default_match_config()
        config["matchName"] = "杯赛 A 决赛"
        config["stageLimits"]["mapSelectSeconds"] = 75
        create = self.client.post(
            f"/api/admin/{admin_hash}/config-presets",
            json={
                "schemaVersion": 1,
                "id": "cup-a",
                "name": "杯赛 A",
                "description": "主赛事规则",
                "config": config,
            },
        )
        self.assertEqual(create.status_code, 201, create.get_data(as_text=True))
        self.assertTrue((room_app.CONFIG_PRESETS_DIR / "cup-a.json").is_file())
        self.assertEqual(self.client.get("/api/admin/bad/config-presets").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/rooms/token/{team_token}/config-presets").status_code,
            403,
        )

        applied = self.client.post(
            f"/api/rooms/token/{admin_token}/config/apply-preset",
            json={"presetId": "cup-a"},
        )
        self.assertEqual(applied.status_code, 200, applied.get_data(as_text=True))
        room_config = applied.get_json()
        self.assertEqual(room_config["source"]["presetId"], "cup-a")
        self.assertEqual(room_config["value"]["matchName"], "杯赛 A 决赛")
        self.assertEqual(room_config["value"]["stageLimits"]["mapSelectSeconds"], 75)

        changed_template = json.loads(json.dumps(config, ensure_ascii=False))
        changed_template["stageLimits"]["mapSelectSeconds"] = 90
        update = self.client.put(
            f"/api/admin/{admin_hash}/config-presets/cup-a",
            json={"id": "cup-a", "name": "杯赛 A", "description": "更新版", "config": changed_template},
        )
        self.assertEqual(update.status_code, 200)
        unchanged_room = self.client.get(f"/api/rooms/token/{admin_token}/config").get_json()
        self.assertEqual(unchanged_room["value"]["stageLimits"]["mapSelectSeconds"], 75)

    def test_room_config_requires_admin_and_locks_until_destructive_rollback(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        team_token = room["links"]["A"]["hash"]
        current = self.client.get(f"/api/rooms/token/{admin_token}/config").get_json()
        edited = json.loads(json.dumps(current["value"], ensure_ascii=False))
        edited["matchName"] = "独立房间配置"

        forbidden = self.client.put(
            f"/api/rooms/token/{team_token}/config",
            json={"revision": current["revision"], "config": edited},
        )
        self.assertEqual(forbidden.status_code, 403)
        saved = self.client.put(
            f"/api/rooms/token/{admin_token}/config",
            json={"revision": current["revision"], "config": edited, "source": {"type": "json"}},
        )
        self.assertEqual(saved.status_code, 200, saved.get_data(as_text=True))
        self.assertEqual(saved.get_json()["source"]["type"], "json")
        self.assertEqual(self.client.post(f"/api/rooms/token/{admin_token}/config/confirm").status_code, 200)
        self.assertEqual(self.client.post(f"/api/rooms/token/{admin_token}/start").status_code, 200)

        locked_edit = self.client.put(
            f"/api/rooms/token/{admin_token}/config",
            json={"config": room_app.default_match_config()},
        )
        self.assertEqual(locked_edit.status_code, 409)
        malicious_snapshot = {
            "roomStarted": True,
            "settingsState": {"matchName": "被篡改"},
            "marker": "server-owned-config",
        }
        pushed = self.client.put(
            f"/api/rooms/token/{team_token}/snapshot",
            json={
                "version": 0,
                "snapshot": malicious_snapshot,
                "operation": {"category": "lineup", "action": "ready", "details": {}},
            },
        )
        self.assertEqual(pushed.status_code, 200, pushed.get_data(as_text=True))
        stored_snapshot = self.client.get(f"/api/rooms/token/{admin_token}/snapshot").get_json()["snapshot"]
        self.assertEqual(stored_snapshot["settingsState"]["matchName"], "独立房间配置")

        rolled_back = self.client.post(f"/api/rooms/token/{admin_token}/rollback-to-config")
        self.assertEqual(rolled_back.status_code, 200)
        self.assertEqual(rolled_back.get_json()["config"]["status"], "draft")
        self.assertIsNone(self.client.get(f"/api/rooms/token/{admin_token}/snapshot").get_json()["snapshot"])

    def test_config_documentation_and_validation_errors_are_exposed(self) -> None:
        example_response = self.client.get("/docs/config/match-config.example.json")
        schema_response = self.client.get("/docs/config/match-config.schema.json")
        self.assertEqual(example_response.status_code, 200)
        self.assertEqual(schema_response.status_code, 200)
        example_response.close()
        schema_response.close()
        invalid = room_app.default_match_config()
        invalid["stageLimits"]["mapSelectSeconds"] = 0
        response = self.client.post(
            f"/api/admin/{self.admin_hash()}/config-presets",
            json={"id": "invalid", "name": "无效", "config": invalid},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["details"][0]["path"], "stageLimits.mapSelectSeconds")

    def test_history_failure_does_not_commit_snapshot_or_release_room(self) -> None:
        room = self.create_room()
        token = room["links"]["C"]["hash"]

        with patch.object(room_app, "append_room_history_unlocked", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.client.put(
                    f"/api/rooms/token/{token}/snapshot",
                    json={
                        "version": 0,
                        "snapshot": {"marker": "must-not-commit"},
                        "operation": {"category": "room", "action": "started", "details": {}},
                    },
                )

            with self.assertRaises(OSError):
                self.close_room(room)

        stored_room = self.read_store()["rooms"][0]
        self.assertEqual(stored_room["version"], 0)
        self.assertIsNone(stored_room["snapshot"])
        self.assertEqual(self.read_history(room)["status"], "active")

    def test_close_archives_removes_active_room_and_exposes_protected_download(self) -> None:
        room = self.create_room()
        token = room["links"]["A"]["hash"]
        archive_key = self.history_path(room).stem
        admin_hash = self.admin_hash()

        self.assertEqual(self.close_room(room).status_code, 200)
        self.assertEqual(self.read_store()["rooms"], [])
        self.assertEqual(self.client.get(f"/api/rooms/token/{token}").status_code, 410)

        history = self.read_history(room)
        self.assertEqual(history["status"], "closed")
        self.assertEqual(history["closeReason"], "manual")
        self.assertEqual(history["history"][-1]["actor"]["type"], "global_admin")

        listing = self.client.get(f"/api/admin/{admin_hash}/room-history?page=1&pageSize=1")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.get_json()["items"][0]["status"], "closed")
        self.assertEqual(self.client.get("/api/admin/bad/room-history").status_code, 404)
        self.assertEqual(
            self.client.get(f"/api/admin/{admin_hash}/room-history/not-a-key").status_code,
            404,
        )

        download = self.client.get(
            f"/api/admin/{admin_hash}/room-history/{archive_key}/download"
        )
        self.assertEqual(download.status_code, 200)
        self.assertIn(f'filename={archive_key}.json', download.headers["Content-Disposition"])
        download.close()

    def test_inactive_room_is_archived_as_expired(self) -> None:
        room = self.create_room()
        token = room["links"]["B"]["hash"]
        store = self.read_store()
        store["globalSettings"]["inactiveTimeoutMinutes"] = 1
        store["rooms"][0]["lastActiveAt"] = room_app.current_timestamp() - 120
        room_app.save_json_atomic(room_app.ROOM_STORE_PATH, store)

        response = self.client.get(f"/api/rooms/token/{token}")

        self.assertEqual(response.status_code, 410)
        self.assertEqual(self.read_store()["rooms"], [])
        history = self.read_history(room)
        self.assertEqual(history["status"], "expired")
        self.assertEqual(history["closeReason"], "inactive_timeout")
        self.assertEqual(history["history"][-1]["operation"]["action"], "expired")

    def test_legacy_store_is_cleared_without_creating_history(self) -> None:
        legacy_admin_hash = "legacy-admin-hash-that-stays-long"
        legacy_store = {
            "adminHash": legacy_admin_hash,
            "globalSettings": {"roomsPerHour": 12, "inactiveTimeoutMinutes": 45},
            "createLog": {"127.0.0.1": [1, 2]},
            "rooms": [
                {
                    "id": "legacy-room-id",
                    "tokens": {code: f"legacy-token-{code}" for code in room_app.ROOM_ROLES},
                }
            ],
        }
        room_app.save_json_atomic(room_app.ROOM_STORE_PATH, legacy_store)

        room_app.initialize_room_store()

        migrated = self.read_store()
        self.assertEqual(migrated["schemaVersion"], room_app.ROOM_STORE_SCHEMA_VERSION)
        self.assertEqual(migrated["adminHash"], legacy_admin_hash)
        self.assertEqual(migrated["globalSettings"]["roomsPerHour"], 12)
        self.assertEqual(migrated["rooms"], [])
        self.assertEqual(list(room_app.ROOM_HISTORY_DIR.glob("*.json")), [])


if __name__ == "__main__":
    unittest.main()
