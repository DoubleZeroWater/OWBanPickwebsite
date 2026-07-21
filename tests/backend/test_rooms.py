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
        with room_app.catalog_refresh_lock:
            room_app.catalog_refresh_jobs.clear()
            room_app.active_catalog_refresh_job_id = None
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

    def test_team_readiness_tracks_presence_and_auto_starts_enabled_room(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        team_1_token = room["links"]["B"]["hash"]
        team_2_token = room["links"]["A"]["hash"]
        config = room_app.default_match_config()
        config["startWithDefaultConfig"] = True

        updated = self.client.put(
            f"/api/rooms/token/{admin_token}/config",
            json={"revision": 1, "config": config},
        )
        self.assertEqual(updated.status_code, 200, updated.get_data(as_text=True))

        admin_presence = self.client.post(f"/api/rooms/token/{admin_token}/presence", json={})
        self.assertTrue(admin_presence.get_json()["presence"]["C"]["connected"])

        team_1_ready = self.client.post(
            f"/api/rooms/token/{team_1_token}/presence", json={"ready": True}
        )
        self.assertFalse(team_1_ready.get_json()["autoStarted"])
        self.assertTrue(team_1_ready.get_json()["presence"]["B"]["ready"])

        team_2_ready = self.client.post(
            f"/api/rooms/token/{team_2_token}/presence", json={"ready": True}
        )
        payload = team_2_ready.get_json()
        self.assertTrue(payload["autoStarted"])
        self.assertEqual(payload["config"]["status"], "locked")
        self.assertTrue(payload["presence"]["A"]["connected"])
        self.assertTrue(payload["presence"]["B"]["connected"])
        self.assertTrue(payload["presence"]["C"]["connected"])

        history = self.read_history(room)
        self.assertEqual(history["history"][-1]["operation"]["action"], "auto_started_after_team_ready")

    def test_manual_start_requires_both_teams_ready_but_admin_can_force_start(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        team_a_token = room["links"]["A"]["hash"]
        team_b_token = room["links"]["B"]["hash"]

        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/config/confirm").status_code,
            200,
        )
        not_ready = self.client.post(f"/api/rooms/token/{admin_token}/start", json={})
        self.assertEqual(not_ready.status_code, 409)
        self.assertEqual(not_ready.get_json()["error"], "teams_not_ready")

        self.client.post(f"/api/rooms/token/{team_a_token}/presence", json={"ready": True})
        still_not_ready = self.client.post(f"/api/rooms/token/{admin_token}/start", json={})
        self.assertEqual(still_not_ready.status_code, 409)

        self.client.post(f"/api/rooms/token/{team_b_token}/presence", json={"ready": True})
        started = self.client.post(f"/api/rooms/token/{admin_token}/start", json={})
        self.assertEqual(started.status_code, 200)

        forced_room = self.create_room()
        forced_admin = forced_room["links"]["C"]["hash"]
        self.client.post(f"/api/rooms/token/{forced_admin}/config/confirm")
        forced = self.client.post(
            f"/api/rooms/token/{forced_admin}/start", json={"force": True}
        )
        self.assertEqual(forced.status_code, 200)
        self.assertEqual(self.read_history(forced_room)["history"][-1]["operation"]["action"], "force_started")

    def test_team_name_confirmation_is_required_before_ready_when_enabled(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        team_1_token = room["links"]["A"]["hash"]
        config = room_app.default_match_config()
        config["teamsCanEditOwnName"] = True

        updated = self.client.put(
            f"/api/rooms/token/{admin_token}/config",
            json={"revision": 1, "config": config},
        )
        self.assertEqual(updated.status_code, 200, updated.get_data(as_text=True))

        blocked_before_confirmation = self.client.post(
            f"/api/rooms/token/{team_1_token}/presence", json={"ready": True}
        )
        self.assertEqual(blocked_before_confirmation.status_code, 409)
        self.assertEqual(blocked_before_confirmation.get_json()["error"], "config_not_ready")

        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/config/confirm").status_code,
            200,
        )
        blocked_before_name = self.client.post(
            f"/api/rooms/token/{team_1_token}/presence", json={"ready": True}
        )
        self.assertEqual(blocked_before_name.status_code, 409)
        self.assertEqual(blocked_before_name.get_json()["error"], "team_name_not_confirmed")

        atomically_named_and_ready = self.client.post(
            f"/api/rooms/token/{team_1_token}/presence",
            json={"ready": True, "name": "Atomic Team"},
        )
        self.assertEqual(
            atomically_named_and_ready.status_code,
            200,
            atomically_named_and_ready.get_data(as_text=True),
        )
        self.assertEqual(
            atomically_named_and_ready.get_json()["config"]["value"]["teams"]["left"],
            "Atomic Team",
        )
        self.assertTrue(atomically_named_and_ready.get_json()["presence"]["A"]["ready"])

        cannot_revoke = self.client.post(
            f"/api/rooms/token/{team_1_token}/presence", json={"ready": False}
        )
        self.assertEqual(cannot_revoke.status_code, 409)
        self.assertEqual(cannot_revoke.get_json()["error"], "ready_cannot_be_revoked")

        second_room = self.create_room()
        second_admin = second_room["links"]["C"]["hash"]
        second_team = second_room["links"]["A"]["hash"]
        updated = self.client.put(
            f"/api/rooms/token/{second_admin}/config",
            json={"revision": 1, "config": config},
        )
        self.assertEqual(updated.status_code, 200, updated.get_data(as_text=True))
        self.assertEqual(
            self.client.post(f"/api/rooms/token/{second_admin}/config/confirm").status_code,
            200,
        )

        renamed = self.client.put(
            f"/api/rooms/token/{second_team}/team-name", json={"name": "A队"}
        )
        self.assertEqual(renamed.status_code, 200, renamed.get_data(as_text=True))
        self.assertEqual(renamed.get_json()["config"]["value"]["teams"]["left"], "A队")
        self.assertTrue(renamed.get_json()["presence"]["A"]["nameConfirmed"])

        ready = self.client.post(
            f"/api/rooms/token/{second_team}/presence", json={"ready": True}
        )
        self.assertEqual(ready.status_code, 200, ready.get_data(as_text=True))
        self.assertTrue(ready.get_json()["presence"]["A"]["ready"])

        cannot_revoke = self.client.post(
            f"/api/rooms/token/{second_team}/presence", json={"ready": False}
        )
        self.assertEqual(cannot_revoke.status_code, 409)
        self.assertEqual(cannot_revoke.get_json()["error"], "ready_cannot_be_revoked")

    def test_team_lineup_updates_preserve_the_opponent_confirmed_lineup(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        left_token = room["links"]["A"]["hash"]
        right_token = room["links"]["B"]["hash"]
        self.client.post(f"/api/rooms/token/{admin_token}/config/confirm")
        self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True})

        base_snapshot = {
            "roomStarted": True,
            "lineupSelectorState": {
                "open": True,
                "mapIndex": 0,
                "values": {"left": {"damage-1": "L1"}, "right": {"damage-1": ""}},
                "ready": {"left": True, "right": False},
                "timedOut": False,
            },
        }
        first = self.client.put(
            f"/api/rooms/token/{left_token}/snapshot",
            json={
                "version": 0,
                "snapshot": base_snapshot,
                "operation": {"category": "lineup", "action": "ready", "details": {}},
            },
        )
        self.assertEqual(first.status_code, 200, first.get_data(as_text=True))

        stale_opponent_snapshot = json.loads(json.dumps(base_snapshot))
        stale_opponent_snapshot["lineupSelectorState"]["values"]["left"] = {"damage-1": ""}
        stale_opponent_snapshot["lineupSelectorState"]["values"]["right"] = {"damage-1": "R1"}
        stale_opponent_snapshot["lineupSelectorState"]["ready"] = {"left": False, "right": True}
        second = self.client.put(
            f"/api/rooms/token/{right_token}/snapshot",
            json={
                "version": 0,
                "snapshot": stale_opponent_snapshot,
                "operation": {"category": "lineup", "action": "ready", "details": {}},
            },
        )
        self.assertEqual(second.status_code, 200, second.get_data(as_text=True))
        stored = self.client.get(f"/api/rooms/token/{admin_token}/snapshot").get_json()["snapshot"]
        self.assertEqual(stored["lineupSelectorState"]["values"]["left"]["damage-1"], "L1")
        self.assertTrue(stored["lineupSelectorState"]["ready"]["left"])
        self.assertEqual(stored["lineupSelectorState"]["values"]["right"]["damage-1"], "R1")
        self.assertTrue(stored["lineupSelectorState"]["ready"]["right"])

    def test_score_pause_uses_server_clock_and_preserves_count(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        left_token = room["links"]["A"]["hash"]
        self.client.post(f"/api/rooms/token/{admin_token}/config/confirm")
        self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True})

        score_snapshot = {
            "roomStarted": True,
            "currentState": {"maps": [{"status": "selected"}]},
            "scoreSelectorState": {
                "open": True,
                "mapIndex": 0,
                "teamPauses": {
                    "left": {"active": False, "startedAt": None, "totalMs": 0, "count": 0},
                    "right": {"active": False, "startedAt": None, "totalMs": 0, "count": 0},
                },
                "countdownPauseStartedAt": None,
            },
        }
        opened = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": 0,
                "snapshot": score_snapshot,
                "operation": {"category": "score", "action": "opened", "details": {}},
            },
        )
        self.assertEqual(opened.status_code, 200, opened.get_data(as_text=True))

        client_start = json.loads(json.dumps(score_snapshot))
        client_start["scoreSelectorState"]["teamPauses"]["left"].update(
            {"active": True, "startedAt": 1, "totalMs": 999_999, "count": 99}
        )
        with patch.object(room_app.time, "time", return_value=100.0):
            started = self.client.put(
                f"/api/rooms/token/{left_token}/snapshot",
                json={
                    "version": opened.get_json()["version"],
                    "snapshot": client_start,
                    "operation": {
                        "category": "pause",
                        "action": "score_team_started",
                        "details": {"side": "left"},
                    },
                },
            )
        self.assertEqual(started.status_code, 200, started.get_data(as_text=True))
        stored_start = started.get_json()["snapshot"]["scoreSelectorState"]["teamPauses"]["left"]
        self.assertEqual(stored_start["startedAt"], 100_000)
        self.assertEqual(stored_start["totalMs"], 0)
        self.assertEqual(stored_start["count"], 1)

        client_resume = started.get_json()["snapshot"]
        client_resume["scoreSelectorState"]["teamPauses"]["left"].update(
            {"active": False, "startedAt": None, "totalMs": 1, "count": 500}
        )
        with patch.object(room_app.time, "time", return_value=101.25):
            resumed = self.client.put(
                f"/api/rooms/token/{left_token}/snapshot",
                json={
                    "version": started.get_json()["version"],
                    "snapshot": client_resume,
                    "operation": {
                        "category": "pause",
                        "action": "score_team_resumed",
                        "details": {"side": "left"},
                    },
                },
            )
        self.assertEqual(resumed.status_code, 200, resumed.get_data(as_text=True))
        stored_resume = resumed.get_json()["snapshot"]["scoreSelectorState"]["teamPauses"]["left"]
        self.assertFalse(stored_resume["active"])
        self.assertIsNone(stored_resume["startedAt"])
        self.assertEqual(stored_resume["totalMs"], 1_250)
        self.assertEqual(stored_resume["count"], 1)

    def test_score_submission_stops_and_locks_team_pauses(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        left_token = room["links"]["A"]["hash"]
        self.client.post(f"/api/rooms/token/{admin_token}/config/confirm")
        self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True})

        score_snapshot = {
            "roomStarted": True,
            "currentState": {"maps": [{"status": "selected"}]},
            "scoreSelectorState": {
                "open": True,
                "mapIndex": 0,
                "values": {"left": "1", "right": "0"},
                "submittedBy": None,
                "teamPauses": {
                    "left": {"active": False, "startedAt": None, "totalMs": 0, "count": 0},
                    "right": {"active": False, "startedAt": None, "totalMs": 0, "count": 0},
                },
                "countdownPauseStartedAt": None,
            },
        }
        opened = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": 0,
                "snapshot": score_snapshot,
                "operation": {"category": "score", "action": "opened", "details": {}},
            },
        )
        self.assertEqual(opened.status_code, 200, opened.get_data(as_text=True))

        start_snapshot = opened.get_json()["snapshot"]
        start_snapshot["scoreSelectorState"]["teamPauses"]["left"]["active"] = True
        with patch.object(room_app.time, "time", return_value=100.0):
            started = self.client.put(
                f"/api/rooms/token/{left_token}/snapshot",
                json={
                    "version": opened.get_json()["version"],
                    "snapshot": start_snapshot,
                    "operation": {
                        "category": "pause",
                        "action": "score_team_started",
                        "details": {"side": "left"},
                    },
                },
            )
        self.assertEqual(started.status_code, 200, started.get_data(as_text=True))

        submit_snapshot = started.get_json()["snapshot"]
        submit_snapshot["scoreSelectorState"]["submittedBy"] = "left"
        with patch.object(room_app.time, "time", return_value=101.25):
            submitted = self.client.put(
                f"/api/rooms/token/{left_token}/snapshot",
                json={
                    "version": started.get_json()["version"],
                    "snapshot": submit_snapshot,
                    "operation": {
                        "category": "score",
                        "action": "submitted",
                        "details": {"side": "left"},
                    },
                },
            )
        self.assertEqual(submitted.status_code, 200, submitted.get_data(as_text=True))
        stopped_pause = submitted.get_json()["snapshot"]["scoreSelectorState"]["teamPauses"]["left"]
        self.assertFalse(stopped_pause["active"])
        self.assertIsNone(stopped_pause["startedAt"])
        self.assertEqual(stopped_pause["totalMs"], 1_250)
        self.assertEqual(stopped_pause["count"], 1)

        blocked_snapshot = submitted.get_json()["snapshot"]
        blocked_snapshot["scoreSelectorState"]["teamPauses"]["left"].update(
            {"active": True, "startedAt": 1, "count": 99}
        )
        with patch.object(room_app.time, "time", return_value=102.0):
            blocked = self.client.put(
                f"/api/rooms/token/{left_token}/snapshot",
                json={
                    "version": submitted.get_json()["version"],
                    "snapshot": blocked_snapshot,
                    "operation": {
                        "category": "pause",
                        "action": "score_team_started",
                        "details": {"side": "left"},
                    },
                },
            )
        self.assertEqual(blocked.status_code, 200, blocked.get_data(as_text=True))
        locked_pause = blocked.get_json()["snapshot"]["scoreSelectorState"]["teamPauses"]["left"]
        self.assertFalse(locked_pause["active"])
        self.assertEqual(locked_pause["totalMs"], 1_250)
        self.assertEqual(locked_pause["count"], 1)

    def test_snapshot_from_an_older_stage_cannot_rewind_the_room(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        self.client.post(f"/api/rooms/token/{admin_token}/config/confirm")
        self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True})

        lineup_snapshot = {
            "roomStarted": True,
            "currentState": {"maps": [{"status": "selected"}]},
            "lineupSelectorState": {"open": True, "mapIndex": 0},
            "banSelectorState": None,
        }
        lineup = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": 0,
                "snapshot": lineup_snapshot,
                "operation": {"category": "lineup", "action": "opened", "details": {}},
            },
        )
        self.assertEqual(lineup.status_code, 200, lineup.get_data(as_text=True))

        ban_snapshot = json.loads(json.dumps(lineup_snapshot))
        ban_snapshot["lineupSelectorState"] = None
        ban_snapshot["banSelectorState"] = {
            "open": True,
            "mapIndex": 0,
            "step": "first-ban",
        }
        ban = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": lineup.get_json()["version"],
                "snapshot": ban_snapshot,
                "operation": {"category": "ban", "action": "opened", "details": {}},
            },
        )
        self.assertEqual(ban.status_code, 200, ban.get_data(as_text=True))

        stale = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": ban.get_json()["version"],
                "snapshot": lineup_snapshot,
                "operation": {"category": "lineup", "action": "edited", "details": {}},
            },
        )
        self.assertEqual(stale.status_code, 409, stale.get_data(as_text=True))
        self.assertEqual(stale.get_json()["error"], "stage_regression")
        self.assertEqual(stale.get_json()["snapshot"]["banSelectorState"]["step"], "first-ban")

    def test_admin_can_restore_a_completed_checkpoint_stage(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        self.client.post(f"/api/rooms/token/{admin_token}/config/confirm")
        self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True})

        lineup_snapshot = {
            "roomStarted": True,
            "currentState": {"maps": [{"status": "selected"}]},
            "lineupSelectorState": {"open": True, "mapIndex": 0},
            "banSelectorState": None,
        }
        lineup = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": 0,
                "snapshot": lineup_snapshot,
                "operation": {"category": "lineup", "action": "opened", "details": {}},
            },
        )
        self.assertEqual(lineup.status_code, 200, lineup.get_data(as_text=True))

        ban_snapshot = json.loads(json.dumps(lineup_snapshot))
        ban_snapshot["lineupSelectorState"] = None
        ban_snapshot["banSelectorState"] = {"open": True, "mapIndex": 0, "step": "first-ban"}
        ban = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": lineup.get_json()["version"],
                "snapshot": ban_snapshot,
                "operation": {"category": "ban", "action": "opened", "details": {}},
            },
        )
        self.assertEqual(ban.status_code, 200, ban.get_data(as_text=True))

        restored = self.client.put(
            f"/api/rooms/token/{admin_token}/snapshot",
            json={
                "version": ban.get_json()["version"],
                "snapshot": lineup_snapshot,
                "operation": {
                    "category": "room",
                    "action": "stage_restored",
                    "details": {"mapIndex": 0, "checkpoint": "lineupPick"},
                },
            },
        )
        self.assertEqual(restored.status_code, 200, restored.get_data(as_text=True))
        self.assertTrue(restored.get_json()["snapshot"]["lineupSelectorState"]["open"])
        self.assertIsNone(restored.get_json()["snapshot"]["banSelectorState"])

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

    def test_unlimited_create_link_bypasses_per_ip_limit(self) -> None:
        store = self.read_store()
        store["globalSettings"]["roomsPerHour"] = 1
        room_app.save_json_atomic(room_app.ROOM_STORE_PATH, store)

        first = self.client.post("/api/rooms", environ_overrides={"REMOTE_ADDR": "198.51.100.10"})
        limited = self.client.post("/api/rooms", environ_overrides={"REMOTE_ADDR": "198.51.100.10"})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(limited.status_code, 429)

        special_path = f"/r/{room_app.DEFAULT_UNLIMITED_CREATE_HASH}"
        special_page = self.client.get(special_path)
        self.assertEqual(special_page.status_code, 200)
        special_page.close()
        self.assertEqual(len(self.read_store()["rooms"]), 1)

        special_first = self.client.post(f"/api/rooms/unlimited/{room_app.DEFAULT_UNLIMITED_CREATE_HASH}")
        special_second = self.client.post(f"/api/rooms/unlimited/{room_app.DEFAULT_UNLIMITED_CREATE_HASH}")

        self.assertEqual(special_first.status_code, 200)
        self.assertEqual(special_second.status_code, 200)
        first_room_token = special_first.get_json()["links"]["A"]["hash"]
        self.assertEqual(
            self.client.get(f"/api/rooms/token/{first_room_token}").get_json()["portal"]["code"],
            "A",
        )
        self.assertEqual(len(self.read_store()["rooms"]), 3)

    def test_successful_snapshot_is_audited_and_conflict_is_not(self) -> None:
        room = self.create_room()
        admin_token = room["links"]["C"]["hash"]
        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/config/confirm").status_code,
            200,
        )
        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True}).status_code,
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

    def test_extended_config_supports_ties_zero_rest_and_internal_preset_ids(self) -> None:
        config = room_app.default_match_config()
        self.assertEqual(config["stageCount"], 7)
        config["stageLimits"]["preStartRestSeconds"] = 0
        config["stageLimits"]["postMatchRestSeconds"] = 0
        normalized = room_app.normalize_match_config(config, room_app.load_assets().get("maps", {}))
        self.assertEqual(normalized["stageLimits"]["preStartRestSeconds"], 0)
        self.assertEqual(normalized["stageLimits"]["postMatchRestSeconds"], 0)
        self.assertEqual(normalized["mapTimeoutPolicy"], "warn_extend_30")
        self.assertEqual(normalized["lineupTimeoutPolicy"], "warn_extend_30")
        self.assertEqual(normalized["banTimeoutPolicy"], "warn_extend_30")

        configured_timeouts = json.loads(json.dumps(config, ensure_ascii=False))
        configured_timeouts["mapTimeoutPolicy"] = "random_legal_map"
        configured_timeouts["lineupTimeoutPolicy"] = "forfeit_map"
        configured_timeouts["banTimeoutPolicy"] = "random_legal_ban"
        normalized_timeouts = room_app.normalize_match_config(
            configured_timeouts, room_app.load_assets().get("maps", {})
        )
        self.assertEqual(normalized_timeouts["mapTimeoutPolicy"], "random_legal_map")
        self.assertEqual(normalized_timeouts["lineupTimeoutPolicy"], "forfeit_map")
        self.assertEqual(normalized_timeouts["banTimeoutPolicy"], "random_legal_ban")

        auto_preset = self.client.post(
            f"/api/admin/{self.admin_hash()}/config-presets",
            json={"schemaVersion": 1, "name": "自动标识模板", "config": config},
        )
        self.assertEqual(auto_preset.status_code, 201, auto_preset.get_data(as_text=True))
        preset_id = auto_preset.get_json()["id"]
        self.assertRegex(preset_id, r"^[0-9a-f]{24}$")
        self.assertTrue((room_app.CONFIG_PRESETS_DIR / f"{preset_id}.json").is_file())

        invalid_order = json.loads(json.dumps(config, ensure_ascii=False))
        invalid_order["mapSelectionMode"] = "strict_mode_order"
        invalid_order["modeOrder"] = ["Control"]
        with self.assertRaises(room_app.MatchConfigValidationError):
            room_app.normalize_match_config(invalid_order, room_app.load_assets().get("maps", {}))

    def test_side_choice_settings_split_first_and_subsequent_maps(self) -> None:
        config = room_app.default_match_config()
        config["firstSideChoicePolicy"] = "left_attack"
        config["subsequentSideChoicePolicy"] = "previous_winner"
        config["openingSidePolicy"] = "follow_map_picker"
        normalized = room_app.normalize_match_config(config, room_app.load_assets().get("maps", {}))
        self.assertEqual(normalized["firstSideChoicePolicy"], "left_attack")
        self.assertEqual(normalized["subsequentSideChoicePolicy"], "previous_winner")
        self.assertEqual(normalized["openingSidePolicy"], "follow_map_picker")

        no_first_side_choice = room_app.default_match_config()
        no_first_side_choice["firstSideChoicePolicy"] = "none"
        normalized_none = room_app.normalize_match_config(
            no_first_side_choice,
            room_app.load_assets().get("maps", {}),
        )
        self.assertEqual(normalized_none["firstSideChoicePolicy"], "none")

        legacy = room_app.default_match_config()
        legacy.pop("firstSideChoicePolicy")
        legacy.pop("subsequentSideChoicePolicy")
        legacy["sideChoicePickerPolicy"] = "previous_winner"
        migrated = room_app.normalize_match_config(legacy, room_app.load_assets().get("maps", {}))
        self.assertEqual(migrated["firstSideChoicePolicy"], "map_picker")
        self.assertEqual(migrated["subsequentSideChoicePolicy"], "previous_winner")

        invalid_fixed = room_app.default_match_config()
        invalid_fixed["fixedFirstMapEnabled"] = True
        invalid_fixed["firstSideChoicePolicy"] = "map_picker"
        with self.assertRaises(room_app.MatchConfigValidationError):
            room_app.normalize_match_config(invalid_fixed, room_app.load_assets().get("maps", {}))

        invalid_fixed_opening_ban = room_app.default_match_config()
        invalid_fixed_opening_ban["fixedFirstMapEnabled"] = True
        invalid_fixed_opening_ban["firstSideChoicePolicy"] = "left"
        invalid_fixed_opening_ban["openingSidePolicy"] = "follow_map_picker"
        with self.assertRaises(room_app.MatchConfigValidationError):
            room_app.normalize_match_config(
                invalid_fixed_opening_ban,
                room_app.load_assets().get("maps", {}),
            )

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
        self.assertEqual(
            self.client.post(f"/api/rooms/token/{admin_token}/start", json={"force": True}).status_code,
            200,
        )

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

    def test_notification_duration_is_configurable_and_exposed_to_rooms(self) -> None:
        admin_hash = self.admin_hash()
        initial = self.client.get(f"/api/admin/{admin_hash}/settings")
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.get_json()["notificationDurationSeconds"], 20)

        updated = self.client.put(
            f"/api/admin/{admin_hash}/settings",
            json={"notificationDurationSeconds": 37},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.get_json()["notificationDurationSeconds"], 37)

        room = self.create_room()
        token = room["links"]["A"]["hash"]
        room_payload = self.client.get(f"/api/rooms/token/{token}")
        snapshot_payload = self.client.get(f"/api/rooms/token/{token}/snapshot")
        self.assertEqual(room_payload.get_json()["notificationDurationSeconds"], 37)
        self.assertEqual(snapshot_payload.get_json()["notificationDurationSeconds"], 37)

    def test_catalog_admin_endpoints_require_global_admin_hash(self) -> None:
        self.assertEqual(self.client.get("/api/admin/not-valid/catalog-maintenance").status_code, 404)
        self.assertEqual(self.client.post("/api/admin/not-valid/catalog-refresh").status_code, 404)
        self.assertEqual(
            self.client.put("/api/admin/not-valid/catalog-translation", json={}).status_code,
            404,
        )

    def test_catalog_translation_is_saved_and_invalid_mapping_forces_english(self) -> None:
        admin_hash = self.admin_hash()
        initial = self.client.get("/api/maps/catalog")
        self.assertEqual(initial.status_code, 200)
        self.assertEqual(initial.headers.get("Cache-Control"), "no-store")
        self.assertEqual(initial.get_json()["locale"], "zh-CN")

        invalid = {"schemaVersion": 1, "catalogHash": "sha256:outdated", "modes": {}, "maps": {}, "heroes": {}}
        saved = self.client.put(f"/api/admin/{admin_hash}/catalog-translation", json=invalid)
        self.assertEqual(saved.status_code, 200)
        self.assertFalse(saved.get_json()["active"])
        self.assertTrue((room_app.RUNTIME_CATALOG_DIR / "translation.json").is_file())

        catalog_response = self.client.get("/api/maps/catalog").get_json()
        self.assertEqual(catalog_response["locale"], "en")
        self.assertFalse(catalog_response["translation"]["active"])
        self.assertEqual(catalog_response["translation"]["maps"], {})

    def test_catalog_translation_rejects_invalid_json_without_overwrite(self) -> None:
        admin_hash = self.admin_hash()
        translation_path = room_app.RUNTIME_CATALOG_DIR / "translation.json"
        translation_path.parent.mkdir(parents=True, exist_ok=True)
        translation_path.write_text('{"kept": true}', encoding="utf-8")

        response = self.client.put(
            f"/api/admin/{admin_hash}/catalog-translation",
            data="{not-json",
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(translation_path.read_text(encoding="utf-8"), '{"kept": true}')

    def test_catalog_refresh_is_mutually_exclusive(self) -> None:
        admin_hash = self.admin_hash()
        running_job = {
            "id": "existing-job",
            "status": "running",
            "stage": "download",
            "progress": 50,
            "message": "working",
        }
        with room_app.catalog_refresh_lock:
            room_app.catalog_refresh_jobs.clear()
            room_app.catalog_refresh_jobs["existing-job"] = running_job
            room_app.active_catalog_refresh_job_id = "existing-job"

        response = self.client.post(f"/api/admin/{admin_hash}/catalog-refresh")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["id"], "existing-job")

    def test_notification_event_merge_preserves_order_and_deduplicates(self) -> None:
        current = {
            "notificationEvents": [
                {"id": "older", "createdAt": 10, "segments": [{"text": "旧事件"}]},
            ]
        }
        incoming = {
            "notificationEvents": [
                {"id": "newer", "createdAt": 20, "segments": [{"text": "新事件"}]},
                {"id": "older", "createdAt": 10, "segments": [{"text": "重复事件"}]},
            ]
        }

        room_app.merge_notification_events_unlocked(current, incoming)

        self.assertEqual(
            [event["id"] for event in incoming["notificationEvents"]],
            ["older", "newer"],
        )

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
