from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import time
import tracemalloc
import unittest
from pathlib import Path


TEST_RUNTIME = tempfile.TemporaryDirectory(prefix="owbanpick-authoritative-tests-")
os.environ["OW_RUNTIME_DIR"] = TEST_RUNTIME.name

from backend import app as room_app  # noqa: E402
from backend.room_engine import RoomSession, RoomStateRegistry, StateActionError  # noqa: E402
from backend.state_models import canonical_json, default_config, status_hash  # noqa: E402


class AuthoritativeRoomApiTests(unittest.TestCase):
    def setUp(self) -> None:
        runtime = Path(TEST_RUNTIME.name)
        runtime.mkdir(parents=True, exist_ok=True)
        for child in runtime.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()
        room_app.initialize_room_store()
        room_app.app.config.update(TESTING=True)
        self.client = room_app.app.test_client()

    def create_room(self) -> dict:
        response = self.client.post("/api/rooms")
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        return response.get_json()

    @staticmethod
    def token(room: dict, code: str) -> str:
        return str(room["links"][code]["hash"])

    def sync(self, token: str, client_status: dict | None = None):
        return self.client.post(f"/api/rooms/token/{token}/sync", json={"status": client_status})

    def full(self, token: str) -> dict:
        response = self.sync(token)
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        payload = response.get_json()
        self.assertEqual(payload["kind"], "full")
        return payload

    def action(self, token: str, action_type: str, payload: dict | None = None, request_id: str | None = None):
        current = self.full(token)["status"]
        expected = {
            "epoch": current["epoch"], "revision": current["revision"],
            "hash": current["hash"], "phaseId": current["phase"]["phaseId"],
        }
        return self.client.post(
            f"/api/rooms/token/{token}/actions",
            json={
                "requestId": request_id or f"req-{action_type}-{current['revision']}",
                "expected": expected,
                "type": action_type,
                "payload": payload or {},
            },
        )

    def configure_fast_room(self, room: dict, *, roster_mode: str = "skip", ban_enabled: bool = False) -> None:
        config = default_config()
        config["stageLimits"]["preStartRestSeconds"] = 0
        config["stageLimits"]["postMatchRestSeconds"] = 0
        config["firstMapPickerPolicy"] = "left"
        config["firstSideChoicePolicy"] = "none"
        config["openingSidePolicy"] = "left"
        config["rosterMode"] = roster_mode
        config["banEnabled"] = ban_enabled
        admin = self.token(room, "C")
        updated = self.client.put(f"/api/rooms/token/{admin}/config", json={"config": config})
        self.assertEqual(updated.status_code, 200, updated.get_data(as_text=True))
        self.assertEqual(self.action(admin, "config_confirm").status_code, 200)
        self.assertEqual(self.action(admin, "match_start", {"force": True}).status_code, 200)

    def test_new_room_has_unique_tokens_and_initial_authoritative_state(self) -> None:
        room = self.create_room()
        codes = [room["roomId"], *(self.token(room, code) for code in room_app.ROOM_ROLES)]
        self.assertEqual(len(set(codes)), 5)
        self.assertTrue(all(re.fullmatch(r"[0-9a-z]{4}", code) for code in codes))
        boot = self.client.get(f"/api/rooms/token/{self.token(room, 'A')}").get_json()
        self.assertEqual(boot["authoritativeState"]["status"]["phase"]["type"], "configuring")
        self.assertNotIn("snapshot", boot)

    def test_snapshot_and_legacy_mutation_routes_are_removed(self) -> None:
        room = self.create_room()
        token = self.token(room, "C")
        for method, suffix in (
            (self.client.get, "snapshot"), (self.client.put, "snapshot"),
            (self.client.post, "presence"), (self.client.post, "start"),
            (self.client.post, "config/confirm"), (self.client.post, "rollback-to-config"),
        ):
            self.assertEqual(method(f"/api/rooms/token/{token}/{suffix}").status_code, 404)

    def test_sync_returns_runtime_when_hash_matches_and_full_when_it_does_not(self) -> None:
        room = self.create_room()
        token = self.token(room, "A")
        status = self.full(token)["status"]
        same = self.sync(token, {key: status[key] for key in ("epoch", "revision", "hash")}).get_json()
        self.assertEqual(same["kind"], "runtime")
        self.assertNotIn("status", same)
        wrong = self.sync(token, {"epoch": 1, "revision": 999, "hash": "sha256:bad"}).get_json()
        self.assertEqual(wrong["kind"], "full")

    def test_ready_and_single_side_lineup_are_runtime_only(self) -> None:
        room = self.create_room()
        admin, left = self.token(room, "C"), self.token(room, "A")
        config = default_config()
        config["firstMapPickerPolicy"] = "left"
        config["firstSideChoicePolicy"] = "none"
        config["openingSidePolicy"] = "left"
        config["stageLimits"]["preStartRestSeconds"] = 0
        self.client.put(f"/api/rooms/token/{admin}/config", json={"config": config})
        confirmed = self.action(admin, "config_confirm").get_json()
        revision = confirmed["status"]["revision"]
        ready = self.action(left, "portal_ready_set").get_json()
        self.assertEqual(ready["status"]["revision"], revision)
        self.assertTrue(ready["runtime"]["presence"]["A"]["ready"])
        self.action(admin, "match_start", {"force": True})
        self.action(left, "map_select", {"mapId": "lijiang_tower"})
        lineup = {slot["id"]: f"left-{slot['id']}" for slot in config["lineupSlots"]}
        before = self.full(left)["status"]["revision"]
        submitted = self.action(left, "lineup_submit", {"lineup": lineup}).get_json()
        self.assertEqual(submitted["status"]["revision"], before)
        self.assertEqual(submitted["runtime"]["lineupSubmissions"]["left"], lineup)

    def test_stale_action_gets_409_with_latest_full_state(self) -> None:
        room = self.create_room()
        admin = self.token(room, "C")
        current = self.full(admin)["status"]
        stale = {"epoch": 1, "revision": 0, "hash": "sha256:old", "phaseId": "old"}
        response = self.client.post(
            f"/api/rooms/token/{admin}/actions",
            json={"requestId": "stale-1", "expected": stale, "type": "config_confirm", "payload": {}},
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.get_json()["kind"], "full")
        self.assertEqual(response.get_json()["status"]["revision"], current["revision"])

    def test_broadcast_is_read_only_and_team_cannot_confirm_config(self) -> None:
        room = self.create_room()
        broadcast, team = self.token(room, "D"), self.token(room, "A")
        self.assertEqual(self.action(broadcast, "portal_ready_set").status_code, 403)
        self.assertEqual(self.action(team, "config_confirm").status_code, 403)

    def test_request_id_is_idempotent(self) -> None:
        room = self.create_room()
        admin = self.token(room, "C")
        current = self.full(admin)["status"]
        body = {
            "requestId": "same-request",
            "expected": {"epoch": current["epoch"], "revision": current["revision"], "hash": current["hash"], "phaseId": current["phase"]["phaseId"]},
            "type": "config_confirm", "payload": {},
        }
        first = self.client.post(f"/api/rooms/token/{admin}/actions", json=body)
        second = self.client.post(f"/api/rooms/token/{admin}/actions", json=body)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.get_json(), second.get_json())

    def test_complete_ft2_flow_and_status_history_rollback(self) -> None:
        room = self.create_room()
        self.configure_fast_room(room)
        admin, left, right = (self.token(room, code) for code in ("C", "A", "B"))

        self.assertEqual(self.action(left, "map_select", {"mapId": "lijiang_tower"}).get_json()["status"]["phase"]["type"], "score_entry")
        self.action(admin, "score_submit", {"score": {"left": 2, "right": 0}})
        # Zero rest is advanced by the next sync.
        self.full(left)
        self.action(right, "map_select", {"mapId": "dorado"})
        self.action(right, "side_select", {"selectedSide": "right"})
        completed = self.action(admin, "score_submit", {"score": {"left": 1, "right": 0}}).get_json()
        self.assertEqual(completed["status"]["lifecycle"], "completed")
        self.assertEqual(completed["status"]["match"]["winnerSide"], "left")

        history = self.client.get(f"/api/rooms/token/{admin}/status-history").get_json()["items"]
        target = next(item for item in history if item["phase"]["type"] == "score_entry")
        old_revision = completed["status"]["revision"]
        rolled = self.client.post(f"/api/rooms/token/{admin}/rollback", json={"revision": target["revision"]}).get_json()
        self.assertGreater(rolled["status"]["revision"], old_revision)
        self.assertEqual(rolled["status"]["epoch"], 2)
        self.assertNotEqual(rolled["status"]["phase"]["phaseId"], target["phase"]["phaseId"])
        self.assertIsNone(rolled["runtime"]["scoreProposal"])

    def test_score_rejection_keeps_proposal_for_admin_decision(self) -> None:
        room = self.create_room()
        self.configure_fast_room(room)
        admin, left, right = (self.token(room, code) for code in ("C", "A", "B"))

        self.assertEqual(self.action(left, "map_select", {"mapId": "lijiang_tower"}).get_json()["status"]["phase"]["type"], "score_entry")
        self.action(left, "score_submit", {"score": {"left": 2, "right": 1}})
        rejected = self.action(right, "score_reject").get_json()

        proposal = rejected["runtime"]["scoreProposal"]
        self.assertEqual(proposal["submittedBy"], "left")
        self.assertEqual(proposal["score"], {"left": 2, "right": 1})
        self.assertEqual(proposal["rejectedBy"], "right")

        completed = self.action(
            admin,
            "score_submit",
            {"score": {"left": 2, "right": 1}},
            request_id="admin-score-submit-after-appeal",
        ).get_json()
        self.assertEqual(completed["status"]["match"]["maps"][0]["status"], "completed")
        self.assertIsNone(completed["runtime"]["scoreProposal"])

    def test_server_restart_closes_active_rooms_without_deleting_archive(self) -> None:
        room = self.create_room()
        token = self.token(room, "A")
        archive = "-".join(self.token(room, code) for code in room_app.ROOM_ROLES)
        history_path = room_app.ROOM_HISTORY_DIR / f"{archive}.json"
        self.assertTrue(history_path.exists())
        room_app.initialize_room_store()
        self.assertEqual(self.sync(token).status_code, 410)
        document = json.loads(history_path.read_text(encoding="utf-8"))
        self.assertEqual(document["status"], "closed")
        self.assertEqual(document["closeReason"], "server_restart")
        self.assertEqual(json.loads(room_app.ROOM_STORE_PATH.read_text(encoding="utf-8"))["rooms"], [])

    def test_legacy_preset_is_backed_up_and_migrated(self) -> None:
        room_app.CONFIG_PRESETS_DIR.mkdir(parents=True, exist_ok=True)
        legacy = room_app.default_match_config()
        path = room_app.CONFIG_PRESETS_DIR / "legacy.json"
        path.write_text(json.dumps({
            "schemaVersion": 1, "id": "legacy", "name": "Legacy", "description": "",
            "revision": 1, "createdAt": 1, "updatedAt": 1, "config": legacy,
        }), encoding="utf-8")
        room_app.migrate_authoritative_config_presets_unlocked()
        migrated = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(migrated["schemaVersion"], 2)
        self.assertEqual(migrated["config"]["schemaVersion"], 1)
        self.assertIn("drawMapReserve", migrated["config"])
        self.assertTrue((room_app.CONFIG_PRESETS_DIR / "legacy.legacy-v0.json").exists())

    def test_default_preset_cannot_be_deleted_until_default_changes(self) -> None:
        store = json.loads(room_app.ROOM_STORE_PATH.read_text(encoding="utf-8"))
        admin_hash = store["adminHash"]
        created = self.client.post(
            f"/api/admin/{admin_hash}/config-presets",
            json={"id": "active-default", "name": "Active Default", "config": default_config()},
        )
        self.assertEqual(created.status_code, 201, created.get_data(as_text=True))
        settings = self.client.put(
            f"/api/admin/{admin_hash}/settings",
            json={"defaultPresetId": "active-default"},
        )
        self.assertEqual(settings.status_code, 200, settings.get_data(as_text=True))

        blocked = self.client.delete(f"/api/admin/{admin_hash}/config-presets/active-default")
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.get_json()["error"], "active_default_preset")
        self.assertIsNotNone(room_app.load_config_preset("active-default"))

        self.client.put(f"/api/admin/{admin_hash}/settings", json={"defaultPresetId": None})
        self.assertEqual(
            self.client.delete(f"/api/admin/{admin_hash}/config-presets/active-default").status_code,
            200,
        )


class RoomEngineTests(unittest.TestCase):
    def test_hash_is_deterministic_and_excludes_hash_field(self) -> None:
        left = {"b": 2, "a": {"值": True}, "hash": "old"}
        right = {"hash": "new", "a": {"值": True}, "b": 2}
        self.assertEqual(canonical_json({"a": 1, "b": 2}), '{"a":1,"b":2}')
        self.assertEqual(status_hash(left), status_hash(right))

    def test_timeout_is_server_driven_and_pause_freezes_remaining_time(self) -> None:
        clock = [1_000_000]
        config = default_config()
        config["stageLimits"]["preStartRestSeconds"] = 10
        session = RoomSession.create("room", config, now_ms=lambda: clock[0])

        def action(kind: str, payload: dict | None = None) -> None:
            session.apply_action("C", kind, payload or {}, session.status_ref(), f"{kind}-{clock[0]}")

        action("config_confirm")
        action("match_start", {"force": True})
        clock[0] += 3_000
        remaining = session.response()["runtime"]["remainingTimeMs"]
        self.assertEqual(remaining, 7_000)
        action("global_pause_set", {"active": True})
        clock[0] += 20_000
        self.assertEqual(session.response()["runtime"]["remainingTimeMs"], 7_000)
        action("global_pause_set", {"active": False})
        clock[0] += 7_001
        self.assertNotEqual(session.response()["status"]["phase"]["type"], "pre_start_rest")

    def test_illegal_actor_and_illegal_map_are_rejected(self) -> None:
        config = default_config()
        config["stageLimits"]["preStartRestSeconds"] = 0
        config["firstMapPickerPolicy"] = "left"
        session = RoomSession.create("room", config)
        session.apply_action("C", "config_confirm", {}, session.status_ref(), "confirm")
        session.apply_action("C", "match_start", {"force": True}, session.status_ref(), "start")
        with self.assertRaises(StateActionError) as actor:
            session.apply_action("B", "map_select", {"mapId": "lijiang_tower"}, session.status_ref(), "wrong-side")
        self.assertEqual(actor.exception.code, "forbidden")
        with self.assertRaises(StateActionError) as illegal:
            session.apply_action("A", "map_select", {"mapId": "not_in_pool"}, session.status_ref(), "bad-map")
        self.assertEqual(illegal.exception.code, "illegal_map")

    def test_notification_cursor_first_entry_does_not_replay_and_events_are_idempotent(self) -> None:
        session = RoomSession.create("room", default_config())
        session.apply_action("C", "config_confirm", {}, session.status_ref(), "confirm", 0)
        response = session.apply_action(
            "C",
            "match_start",
            {"force": True},
            session.status_ref(),
            "start",
            0,
        )
        self.assertTrue(response["notificationStream"]["events"])
        cursor = response["notificationStream"]["cursor"]
        first_entry = session.response(notification_cursor=None)
        self.assertEqual(first_entry["notificationStream"], {"cursor": cursor, "events": []})

        replay = session.response(notification_cursor=0)["notificationStream"]["events"]
        self.assertEqual(len({event["eventId"] for event in replay}), len(replay))
        self.assertEqual(session.response(notification_cursor=cursor)["notificationStream"]["events"], [])

        duplicate = session.apply_action(
            "C",
            "match_start",
            {"force": True},
            response["status"] and {
                "epoch": response["status"]["epoch"],
                "revision": response["status"]["revision"],
                "hash": response["status"]["hash"],
                "phaseId": response["status"]["phase"]["phaseId"],
            },
            "start",
            0,
        )
        self.assertEqual(duplicate["notificationStream"]["cursor"], cursor)
        self.assertEqual(len(session.notification_events), len(replay))

    def test_global_pause_rejects_writes_and_freezes_nested_team_pause(self) -> None:
        clock = [2_000_000]
        config = default_config()
        config["stageLimits"]["preStartRestSeconds"] = 0
        config["firstMapPickerPolicy"] = "left"
        config["firstSideChoicePolicy"] = "none"
        config["openingSidePolicy"] = "left"
        config["rosterMode"] = "skip"
        config["banEnabled"] = False
        session = RoomSession.create("room", config, now_ms=lambda: clock[0])

        def action(portal: str, kind: str, payload: dict | None = None) -> dict:
            return session.apply_action(
                portal,
                kind,
                payload or {},
                session.status_ref(),
                f"{kind}-{clock[0]}-{portal}",
            )

        action("C", "config_confirm")
        action("C", "match_start", {"force": True})
        action("A", "map_select", {"mapId": "lijiang_tower"})
        self.assertEqual(session.status.phase["type"], "score_entry")
        action("A", "score_pause_set", {"active": True})
        clock[0] += 1_000
        action("C", "global_pause_set", {"active": True})
        frozen = session.runtime.pause["scoreTeams"]["left"]["matchTotalMs"]
        self.assertEqual(frozen, 1_000)
        clock[0] += 10_000
        session.response()
        self.assertTrue(session.runtime.pause["scoreTeams"]["left"]["active"])
        self.assertEqual(session.runtime.pause["scoreTeams"]["left"]["matchTotalMs"], frozen)
        with self.assertRaises(StateActionError) as paused:
            action("A", "score_pause_set", {"active": False})
        self.assertEqual(paused.exception.code, "global_paused")

        action("C", "global_pause_set", {"active": False})
        clock[0] += 2_000
        action("A", "score_pause_set", {"active": False})
        self.assertEqual(session.runtime.pause["scoreTeams"]["left"]["matchTotalMs"], 3_000)

    def test_interactive_random_result_advances_on_first_heartbeat_after_deadline(self) -> None:
        clock = [3_000_000]
        config = default_config()
        config["stageLimits"]["preStartRestSeconds"] = 0
        config["firstMapPickerPolicy"] = "interactive_random"
        session = RoomSession.create("room", config, now_ms=lambda: clock[0])
        session.apply_action("C", "config_confirm", {}, session.status_ref(), "confirm")
        session.apply_action("C", "match_start", {"force": True}, session.status_ref(), "start")
        self.assertEqual(session.status.phase["type"], "interactive_random")
        session.apply_action("A", "interactive_random_submit", {"value": 0}, session.status_ref(), "left")
        session.apply_action("B", "interactive_random_submit", {"value": 1}, session.status_ref(), "right")
        self.assertIsNotNone(session.runtime.interactiveRandomResult)
        clock[0] += 5_001
        response = session.heartbeat("A", None, 0)
        self.assertEqual(response["status"]["phase"]["type"], "map_pick")

    def test_removed_match_actions_are_rejected(self) -> None:
        session = RoomSession.create("room", default_config())
        for action_type in ("match_cancel", "interactive_random_continue"):
            with self.assertRaises(StateActionError) as rejected:
                session.apply_action("C", action_type, {}, session.status_ref(), action_type)
            self.assertEqual(rejected.exception.code, "invalid_action")

    def test_twenty_rooms_eighty_clients_sync_within_single_worker_budget(self) -> None:
        tracemalloc.start()
        baseline, _ = tracemalloc.get_traced_memory()
        registry = RoomStateRegistry()
        sessions: list[tuple[RoomSession, dict[str, str]]] = []
        for room_index in range(20):
            tokens = {code: f"token-{room_index:02d}-{code}" for code in room_app.ROOM_ROLES}
            session = registry.create(f"load-{room_index:02d}", tokens, default_config())
            sessions.append((session, tokens))

        durations: list[float] = []
        for session, _ in sessions:
            for code in room_app.ROOM_ROLES:
                started = time.perf_counter()
                response = session.heartbeat(code, {
                    "epoch": session.status.epoch,
                    "revision": session.status.revision,
                    "hash": session.status.hash,
                })
                durations.append(time.perf_counter() - started)
                self.assertEqual(response["kind"], "runtime")

        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        p95 = sorted(durations)[int(len(durations) * 0.95) - 1]
        self.assertLess(p95, 0.2)
        self.assertLess(peak - baseline, 512 * 1024 * 1024)
        self.assertTrue(all(registry.get(f"load-{room_index:02d}") is not None for room_index in range(20)))


if __name__ == "__main__":
    unittest.main()
