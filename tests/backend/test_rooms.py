from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import time
import tracemalloc
import unittest
from copy import deepcopy
from pathlib import Path


TEST_RUNTIME = tempfile.TemporaryDirectory(prefix="owbanpick-authoritative-tests-")
os.environ["OW_RUNTIME_DIR"] = TEST_RUNTIME.name

from backend import app as room_app  # noqa: E402
from backend.room_engine import LINEUP_SLOTS, RoomSession, RoomStateRegistry, StateActionError  # noqa: E402
from backend.state_models import (  # noqa: E402
    StateValidationError,
    bundled_map_capabilities,
    canonical_json,
    default_config,
    normalize_config,
    status_hash,
)


def fast_config(*, lineup: str = "skip", ban: bool = False) -> dict:
    config = default_config()
    config["matchFormat"] = "ft2"
    config["timing"]["preMatchRestSeconds"] = 0
    config["timing"]["interMapRestSeconds"] = 0
    config["map"]["selectionPolicy"] = "unique_map"
    config["map"]["initialPriorityPolicy"] = "left"
    config["sideChoice"]["firstMapSideChoiceEnabled"] = False
    config["lineup"]["mode"] = lineup
    config["ban"]["enabled"] = ban
    return config


def act(session: RoomSession, portal: str, kind: str, payload: dict | None = None, command_id: str | None = None) -> dict:
    return session.apply_action(
        portal,
        kind,
        payload or {},
        session.status_ref(),
        command_id or f"{kind}-{session.status.revision}-{portal}",
    )


def start_session(config: dict | None = None, *, now_ms=None) -> RoomSession:
    session = RoomSession.create("room", config or fast_config(), now_ms=now_ms)
    act(session, "C", "config_confirm")
    act(session, "C", "match_start", {"force": True})
    return session


class AuthoritativeRoomApiTests(unittest.TestCase):
    def setUp(self) -> None:
        runtime = Path(TEST_RUNTIME.name)
        runtime.mkdir(parents=True, exist_ok=True)
        for child in runtime.iterdir():
            shutil.rmtree(child) if child.is_dir() else child.unlink()
        room_app.initialize_room_store()
        room_app.app.config.update(TESTING=True)
        self.client = room_app.app.test_client()
        self.command_seq = 0

    def create_room(self) -> dict:
        response = self.client.post("/api/rooms")
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        return response.get_json()

    @staticmethod
    def token(room: dict, code: str) -> str:
        return str(room["links"][code]["hash"])

    def sync(self, token: str, check: dict | None = None, cursor: int | None = None):
        body: dict = {"check": check}
        if cursor is not None:
            body["notificationCursor"] = cursor
        return self.client.post(f"/api/rooms/token/{token}/sync", json=body)

    def state(self, token: str) -> dict:
        response = self.sync(token)
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        payload = response.get_json()
        self.assertEqual(payload["kind"], "changed")
        self.assertNotIn("status", payload)
        for segment in ("board", "facts", "phase", "runtime", "presence", "privateContext", "check"):
            self.assertIn(segment, payload)
        return payload

    def action(
        self,
        token: str,
        action_type: str,
        payload: dict | None = None,
        *,
        check: dict | None = None,
        command_id: str | None = None,
        cursor: int | None = None,
    ):
        current = check or self.state(token)["check"]
        self.command_seq += 1
        body = {
            "commandId": command_id or f"command-{self.command_seq}-{action_type}",
            "check": current,
            "type": action_type,
            "payload": payload or {},
        }
        if cursor is not None:
            body["notificationCursor"] = cursor
        return self.client.post(f"/api/rooms/token/{token}/actions", json=body)

    def configure(self, room: dict, config: dict) -> None:
        admin = self.token(room, "C")
        updated = self.client.put(f"/api/rooms/token/{admin}/config", json={"config": config})
        self.assertEqual(updated.status_code, 200, updated.get_data(as_text=True))
        self.assertEqual(self.action(admin, "config_confirm").status_code, 200)

    def test_new_room_bootstrap_is_segmented_and_tokens_are_unique(self) -> None:
        room = self.create_room()
        codes = [room["roomId"], *(self.token(room, code) for code in room_app.ROOM_ROLES)]
        self.assertEqual(len(set(codes)), 5)
        self.assertTrue(all(re.fullmatch(r"[0-9a-z]{4}", code) for code in codes))
        boot = self.client.get(f"/api/rooms/token/{self.token(room, 'A')}").get_json()
        initial = boot["authoritativeState"]
        self.assertEqual(initial["phase"]["type"], "configuring")
        self.assertNotIn("status", initial)
        self.assertNotIn("_heroPool", initial["board"]["config"])
        self.assertNotIn("_mapCapabilities", initial["board"]["config"])
        self.assertNotIn("snapshot", boot)

    def test_sync_uses_check_and_only_returns_changed_segments(self) -> None:
        room = self.create_room()
        token = self.token(room, "A")
        first = self.state(token)
        same = self.sync(token, first["check"]).get_json()
        self.assertNotIn("board", same)
        self.assertNotIn("facts", same)
        self.assertNotIn("phase", same)
        self.assertIn(same["kind"], {"ok", "changed"})

        stale = dict(first["check"])
        stale["epoch"] = 0
        rebased = self.sync(token, stale).get_json()
        self.assertEqual(rebased["kind"], "rebase")
        self.assertIn("facts", rebased)
        self.assertIn("phase", rebased)
        self.assertIn("runtime", rebased)
        self.assertNotIn("status", rebased)

    def test_stale_command_returns_segmented_latest_state(self) -> None:
        room = self.create_room()
        admin = self.token(room, "C")
        stale = self.state(admin)["check"]
        stale["runtimeId"] = "runtime:stale"
        response = self.action(admin, "config_confirm", check=stale)
        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertEqual(payload["error"], "stale_runtime")
        self.assertIn("check", payload)
        self.assertIn("board", payload)
        self.assertNotIn("status", payload)

    def test_command_id_is_idempotent(self) -> None:
        room = self.create_room()
        admin = self.token(room, "C")
        check = self.state(admin)["check"]
        first = self.action(admin, "config_confirm", check=check, command_id="same-command")
        second = self.action(admin, "config_confirm", check=check, command_id="same-command")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.get_json(), second.get_json())

    def test_lineup_privacy_and_public_notification_after_both_submit(self) -> None:
        room = self.create_room()
        config = fast_config(lineup="free_input")
        self.configure(room, config)
        admin, left, right = (self.token(room, code) for code in ("C", "A", "B"))
        self.assertEqual(self.action(admin, "match_start", {"force": True}).status_code, 200)
        self.assertEqual(self.action(left, "map_select", {"mapId": "ilios"}).status_code, 200)

        left_lineup = {slot["id"]: f"left-{slot['id']}" for slot in LINEUP_SLOTS}
        right_lineup = {slot["id"]: f"right-{slot['id']}" for slot in LINEUP_SLOTS}
        one = self.action(left, "lineup_submit", {"lineup": left_lineup}, cursor=0).get_json()
        self.assertEqual(one["privateContext"]["lineupSubmissions"]["left"], left_lineup)
        self.assertIsNone(one["privateContext"]["lineupSubmissions"]["right"])
        self.assertEqual(one["runtime"]["lineupSubmitted"], {"left": True, "right": False})
        self.assertFalse(any(event["eventType"] == "LINEUPS_SUBMITTED" for event in one["notificationStream"]["events"]))

        right_view = self.state(right)
        admin_view = self.state(admin)
        self.assertIsNone(right_view["privateContext"]["lineupSubmissions"]["left"])
        self.assertIsNone(admin_view["privateContext"]["lineupSubmissions"]["left"])

        both = self.action(right, "lineup_submit", {"lineup": right_lineup}, cursor=0).get_json()
        lineup_events = [event for event in both["notificationStream"]["events"] if event["eventType"] == "LINEUPS_SUBMITTED"]
        self.assertEqual(len(lineup_events), 1)
        self.assertNotIn("lineup", lineup_events[0]["payload"])
        public = self.state(admin)
        self.assertEqual(public["facts"]["match"]["maps"][0]["lineups"]["left"], left_lineup)

    def test_broadcast_is_read_only_and_errors_do_not_enter_public_stream(self) -> None:
        room = self.create_room()
        broadcast, team, admin = (self.token(room, code) for code in ("D", "A", "C"))
        cursor = self.state(admin)["notificationStream"]["cursor"]
        self.assertEqual(self.action(broadcast, "portal_ready_set").status_code, 403)
        self.assertEqual(self.action(team, "config_confirm").status_code, 403)
        stream = self.sync(admin, cursor=cursor).get_json()["notificationStream"]
        self.assertEqual(stream["events"], [])

    def test_removed_legacy_mutation_routes(self) -> None:
        room = self.create_room()
        token = self.token(room, "C")
        for method, suffix in (
            (self.client.get, "snapshot"), (self.client.put, "snapshot"),
            (self.client.post, "presence"), (self.client.post, "start"),
            (self.client.post, "config/confirm"), (self.client.post, "rollback-to-config"),
        ):
            self.assertEqual(method(f"/api/rooms/token/{token}/{suffix}").status_code, 404)

    def test_server_restart_closes_active_room_but_retains_archive(self) -> None:
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

    def test_default_preset_cannot_be_deleted_until_default_changes(self) -> None:
        store = json.loads(room_app.ROOM_STORE_PATH.read_text(encoding="utf-8"))
        admin_hash = store["adminHash"]
        created = self.client.post(
            f"/api/admin/{admin_hash}/config-presets",
            json={"id": "active-default", "name": "Active Default", "config": default_config()},
        )
        self.assertEqual(created.status_code, 201, created.get_data(as_text=True))
        self.assertEqual(
            self.client.put(f"/api/admin/{admin_hash}/settings", json={"defaultPresetId": "active-default"}).status_code,
            200,
        )
        blocked = self.client.delete(f"/api/admin/{admin_hash}/config-presets/active-default")
        self.assertEqual(blocked.status_code, 409)
        self.client.put(f"/api/admin/{admin_hash}/settings", json={"defaultPresetId": None})
        self.assertEqual(self.client.delete(f"/api/admin/{admin_hash}/config-presets/active-default").status_code, 200)


class RoomEngineTests(unittest.TestCase):
    def test_hash_is_deterministic_and_excludes_hash_field(self) -> None:
        left = {"b": 2, "a": {"value": True}, "hash": "old"}
        right = {"hash": "new", "a": {"value": True}, "b": 2}
        self.assertEqual(canonical_json({"a": 1, "b": 2}), '{"a":1,"b":2}')
        self.assertEqual(status_hash(left), status_hash(right))

    def test_target_config_allows_short_repeated_fixed_order_but_rejects_unknown_maps(self) -> None:
        config = default_config()
        config["map"]["selectionPolicy"] = "fixed_map_order"
        config["map"]["fixedMapOrder"] = ["ilios", "ilios"]
        normalized = normalize_config(config)
        self.assertEqual(normalized["map"]["fixedMapOrder"], ["ilios", "ilios"])

        unknown = deepcopy(config)
        unknown["map"]["mapPool"]["control"].append("not_in_catalog")
        unknown["map"]["fixedMapOrder"] = ["not_in_catalog"]
        with self.assertRaises(StateValidationError):
            normalize_config(unknown)

        invalid_capability = deepcopy(config)
        capabilities = dict(invalid_capability["_mapCapabilities"])
        capabilities.pop("ilios")
        with self.assertRaises(StateValidationError):
            normalize_config(invalid_capability, map_capabilities=capabilities)

    def test_target_config_uses_accent_insensitive_map_ids(self) -> None:
        config = default_config()
        config["map"]["mapPool"]["hybrid"].append("paraiso")
        config["map"]["mapPool"]["push"].append("esperanca")

        normalized = normalize_config(config, map_capabilities=bundled_map_capabilities())

        self.assertIn("paraiso", normalized["map"]["mapPool"]["hybrid"])
        self.assertIn("esperanca", normalized["map"]["mapPool"]["push"])

    def test_catalog_capability_controls_side_choice(self) -> None:
        symmetric_off = fast_config()
        symmetric_off["sideChoice"]["firstMapSideChoiceEnabled"] = True
        control = start_session(symmetric_off)
        act(control, "A", "map_select", {"mapId": "ilios"})
        self.assertEqual(control.status.phase["type"], "score_entry")
        self.assertTrue(control.status.match["maps"][0]["sideChoice"]["automatic"])
        self.assertEqual(control.status.match["maps"][0]["sideChoice"]["kind"], "color")

        attack_defense = fast_config()
        attack_defense["sideChoice"]["firstMapSideChoiceEnabled"] = True
        session = start_session(attack_defense)
        act(session, "A", "map_select", {"mapId": "circuit_royal"})
        self.assertEqual(session.status.phase["type"], "side_pick")
        self.assertEqual(session.status.phase["data"]["choiceKind"], "attack_defense")

    def test_first_map_side_choice_disabled_assigns_team1_blue_defense(self) -> None:
        session = start_session(fast_config())
        act(session, "A", "map_select", {"mapId": "circuit_royal"})
        choice = session.status.match["maps"][0]["sideChoice"]
        self.assertEqual(choice["chooserSide"], "left")
        self.assertEqual(choice["selectedSide"], "left")
        self.assertTrue(choice["automatic"])

    def test_draw_reuses_initial_priority(self) -> None:
        session = start_session(fast_config())
        act(session, "A", "map_select", {"mapId": "ilios"})
        act(session, "C", "score_submit", {"score": {"left": 1, "right": 1}})
        self.assertEqual(session.status.phase["type"], "map_pick")
        self.assertEqual(session.status.phase["mapIndex"], 1)
        self.assertEqual(session.status.phase["actorSide"], "left")
        self.assertEqual(session.status.match["decisions"]["initialPrioritySide"], "left")

    def test_fixed_order_exhaustion_enters_public_admin_decision(self) -> None:
        config = fast_config()
        config["map"]["selectionPolicy"] = "fixed_map_order"
        config["map"]["fixedMapOrder"] = ["ilios"]
        session = start_session(config)
        self.assertEqual(session.status.phase["type"], "score_entry")
        act(session, "C", "score_submit", {"score": {"left": 1, "right": 1}})
        self.assertEqual(session.status.phase["type"], "admin_decision")
        self.assertEqual(session.status.phase["data"]["decisionKind"], "series_winner")
        self.assertTrue(any(event["eventType"] == "SELECTION_AWAITING_ADMIN" for event in session.notification_events))
        with self.assertRaises(StateActionError) as invalid_ruling:
            act(session, "C", "timeout_resolve", {"resolution": "forfeit", "loserSide": "left"})
        self.assertEqual(invalid_ruling.exception.code, "invalid_resolution")
        act(session, "C", "timeout_resolve", {"resolution": "series_winner", "winnerSide": "right"})
        self.assertEqual(session.status.lifecycle, "completed")
        self.assertEqual(session.status.match["winnerSide"], "right")
        audit = next(event for event in session.notification_events if event["eventType"] == "ADMIN_DECISION_RESOLVED")
        self.assertEqual(audit["payload"]["winnerSide"], "right")
        self.assertNotIn("reason", audit["payload"])

    def test_admin_decision_supports_map_side_lineup_and_ban_order_rulings(self) -> None:
        map_session = start_session(fast_config())
        map_session._enter_admin_decision("map_pick_timeout")
        awaiting_map = next(
            item for item in reversed(map_session.notification_events)
            if item["eventType"] == "SELECTION_AWAITING_ADMIN"
        )
        self.assertEqual(awaiting_map["payload"]["subject"], "队伍 1")
        self.assertEqual(awaiting_map["payload"]["selectionType"], "第1张地图的选图阶段")
        self.assertEqual(map_session._allowed_actions("A"), [])
        self.assertEqual(map_session._allowed_actions("C"), ["timeout_resolve"])
        with self.assertRaises(StateActionError) as team_blocked:
            act(map_session, "A", "map_select", {"mapId": "ilios"})
        self.assertEqual(team_blocked.exception.code, "action_not_allowed")
        self.assertEqual(team_blocked.exception.status_code, 422)
        act(map_session, "C", "timeout_resolve", {"resolution": "select_map", "mapId": "ilios"})
        self.assertEqual(map_session.status.phase["type"], "score_entry")
        resolved_map = next(
            item for item in reversed(map_session.notification_events)
            if item["eventType"] == "ADMIN_DECISION_RESOLVED"
        )
        self.assertEqual(resolved_map["payload"]["decisionType"], "第1张地图的选图阶段")
        self.assertNotIn("admin_decision", resolved_map["payload"]["decisionType"])

        side_config = fast_config()
        side_config["sideChoice"]["firstMapSideChoiceEnabled"] = True
        side_session = start_session(side_config)
        act(side_session, "A", "map_select", {"mapId": "circuit_royal"})
        side_session._enter_admin_decision("side_pick_timeout")
        act(side_session, "C", "timeout_resolve", {"resolution": "select_side", "selectedSide": "right"})
        self.assertEqual(side_session.status.match["maps"][0]["sideChoice"]["selectedSide"], "right")

        lineup_session = start_session(fast_config(lineup="free_input"))
        act(lineup_session, "A", "map_select", {"mapId": "ilios"})
        left_lineup = {slot["id"]: f"left-{slot['id']}" for slot in LINEUP_SLOTS}
        right_lineup = {slot["id"]: f"right-{slot['id']}" for slot in LINEUP_SLOTS}
        act(lineup_session, "A", "lineup_submit", {"lineup": left_lineup})
        lineup_session._enter_admin_decision("lineup_pick_timeout")
        lineup_awaiting = next(
            item for item in reversed(lineup_session.notification_events)
            if item["eventType"] == "SELECTION_AWAITING_ADMIN"
        )
        self.assertEqual(lineup_awaiting["payload"]["subject"], "队伍 2")
        admin_view = lineup_session.response(force_full=True, portal_code="C")
        self.assertEqual(admin_view["runtime"]["lineupSubmitted"], {"left": True, "right": False})
        self.assertIsNone(admin_view["privateContext"]["lineupSubmissions"]["left"])
        act(lineup_session, "C", "timeout_resolve", {
            "resolution": "submit_lineup", "side": "right", "lineup": right_lineup,
        })
        self.assertEqual(lineup_session.status.phase["type"], "score_entry")
        self.assertEqual(lineup_session.status.match["maps"][0]["lineups"]["left"], left_lineup)

        ban_session = start_session(fast_config(ban=True))
        act(ban_session, "A", "map_select", {"mapId": "ilios"})
        self.assertEqual(ban_session.status.phase["type"], "ban_order")
        ban_session._enter_admin_decision("ban_order_timeout")
        act(ban_session, "C", "timeout_resolve", {"resolution": "select_ban_order", "choice": "second"})
        self.assertEqual(ban_session.status.phase["type"], "ban_first")
        self.assertEqual(ban_session.status.match["maps"][0]["bans"]["firstBanSide"], "right")

    def test_interactive_random_admin_decision_can_fill_only_missing_values(self) -> None:
        config = fast_config()
        config["map"]["initialPriorityPolicy"] = "interactive_random"
        config["map"]["interactiveRandomMissingInputPolicy"] = "admin_decision"
        session = start_session(config)
        act(session, "A", "interactive_random_submit", {"value": 1})

        session._handle_timeout()

        self.assertEqual(session.status.phase["type"], "admin_decision")
        admin_view = session.response(force_full=True, portal_code="C")
        self.assertEqual(admin_view["runtime"]["interactiveRandomSubmitted"], {"left": True, "right": False})
        self.assertEqual(admin_view["privateContext"]["interactiveRandom"], {"left": None, "right": None})
        act(session, "C", "timeout_resolve", {
            "resolution": "submit_interactive_random",
            "values": {"right": 0},
        })
        self.assertEqual(session.status.phase["type"], "interactive_random")
        self.assertEqual(session.runtime.interactiveRandomResult, {"left": 1, "right": 0, "resultSide": "right"})

    def test_admin_extension_uses_configured_delay_and_preserves_submissions(self) -> None:
        config = fast_config(lineup="free_input")
        config["timing"]["timeoutExtensionSeconds"] = 5
        session = start_session(config)
        act(session, "A", "map_select", {"mapId": "ilios"})
        left_lineup = {slot["id"]: f"left-{slot['id']}" for slot in LINEUP_SLOTS}
        act(session, "A", "lineup_submit", {"lineup": left_lineup})
        session._enter_admin_decision("lineup_pick_timeout")
        old_runtime_id = session.runtime.runtimeId

        act(session, "C", "timeout_resolve", {"resolution": "extend_30"})

        self.assertEqual(session.status.phase["type"], "lineup_pick")
        self.assertNotEqual(session.runtime.runtimeId, old_runtime_id)
        self.assertEqual(session.runtime.totalTimeMs, 5_000)
        self.assertEqual(session.runtime.remainingTimeMs, 5_000)
        self.assertEqual(session.runtime.lineupSubmissions["left"], left_lineup)

    def test_interactive_random_is_private_until_both_submit(self) -> None:
        config = fast_config()
        config["map"]["initialPriorityPolicy"] = "interactive_random"
        session = start_session(config)
        act(session, "A", "interactive_random_submit", {"value": 0})
        left = session.response(force_full=True, portal_code="A")
        right = session.response(force_full=True, portal_code="B")
        self.assertEqual(left["privateContext"]["interactiveRandom"], {"left": 0, "right": None})
        self.assertEqual(right["privateContext"]["interactiveRandom"], {"left": None, "right": None})
        act(session, "B", "interactive_random_submit", {"value": 1})
        resolved = session.response(force_full=True, portal_code="D")
        self.assertEqual(resolved["privateContext"]["interactiveRandom"], {"left": 0, "right": 1})

    def test_score_proposal_confirmation_and_rejection(self) -> None:
        session = start_session(fast_config())
        act(session, "A", "map_select", {"mapId": "ilios"})
        act(session, "A", "score_submit", {"score": {"left": 2, "right": 1}})
        self.assertEqual(session.status.phase["type"], "score_confirmation")
        self.assertEqual(session.status.phase["actorSide"], "right")
        act(session, "B", "score_reject")
        self.assertEqual(session.status.phase["type"], "admin_decision")
        self.assertEqual(session.status.phase["data"]["proposal"]["score"], {"left": 2, "right": 1})
        act(session, "C", "timeout_resolve", {"resolution": "approve_score"})
        self.assertEqual(session.status.match["maps"][0]["score"], {"left": 2, "right": 1})

    def test_forfeit_uses_ff_result_without_fake_score(self) -> None:
        session = start_session(fast_config())
        act(session, "A", "map_select", {"mapId": "ilios"})
        act(session, "C", "map_forfeit", {"loserSide": "right"})
        result = session.status.match["maps"][0]
        self.assertEqual(result["resultType"], "forfeit")
        self.assertIsNone(result["score"])
        self.assertEqual(result["winnerSide"], "left")

    def test_rollback_only_accepts_checkpoint_and_rotates_epoch_phase_runtime(self) -> None:
        session = start_session(fast_config())
        act(session, "A", "map_select", {"mapId": "ilios"})
        score_checkpoint = next(item for item in session.history_summary() if item["phase"]["type"] == "score_entry")
        old_epoch = session.status.epoch
        old_phase = session.status.phase["phaseId"]
        old_runtime = session.runtime.runtimeId
        act(session, "C", "score_submit", {"score": {"left": 1, "right": 0}})
        restored = session.rollback(score_checkpoint["revision"])
        self.assertEqual(session.status.epoch, old_epoch + 1)
        self.assertNotEqual(session.status.phase["phaseId"], old_phase)
        self.assertNotEqual(session.runtime.runtimeId, old_runtime)
        self.assertEqual(session.status.match["maps"][0]["status"], "selected")
        self.assertIsNone(session.status.match["maps"][0]["score"])
        self.assertEqual(restored["phase"]["type"], "score_entry")
        rollback_event = next(event for event in session.notification_events if event["eventType"] == "STAGE_RESTORED")
        self.assertEqual(rollback_event["actor"]["portalCode"], "C")
        self.assertEqual(rollback_event["payload"]["targetCheckpoint"]["revision"], score_checkpoint["revision"])
        self.assertIsInstance(rollback_event["occurredAt"], int)
        self.assertNotIn("reason", rollback_event["payload"])
        with self.assertRaises(StateActionError) as invalid:
            session.rollback(1)
        self.assertEqual(invalid.exception.code, "checkpoint_not_found")

    def test_rollback_deletes_descendant_checkpoints_and_rejects_old_branch(self) -> None:
        session = start_session(fast_config())
        act(session, "A", "map_select", {"mapId": "ilios"})
        score_checkpoint = next(item for item in session.history_summary() if item["phase"]["type"] == "score_entry")
        act(session, "C", "score_submit", {"score": {"left": 1, "right": 0}})
        descendant = max((
            item for item in session.history_summary()
            if item["phase"]["mapIndex"] == 1 and item["phase"]["type"] == "map_pick"
        ), key=lambda item: item["revision"])

        session.rollback(score_checkpoint["revision"])

        revisions = {item["revision"] for item in session.history_summary()}
        self.assertNotIn(descendant["revision"], revisions)
        with self.assertRaises(StateActionError) as stale:
            session.rollback(descendant["revision"])
        self.assertEqual(stale.exception.code, "checkpoint_not_found")

    def test_completed_series_disallows_rollback_by_default(self) -> None:
        session = start_session(fast_config())
        for index, map_id in enumerate(("ilios", "dorado")):
            if index:
                actor = session.status.phase["actorSide"]
                act(session, "A" if actor == "left" else "B", "map_select", {"mapId": map_id})
                if session.status.phase["type"] == "side_pick":
                    portal = "A" if session.status.phase["actorSide"] == "left" else "B"
                    act(session, portal, "side_select", {"selectedSide": session.status.phase["actorSide"]})
            else:
                act(session, "A", "map_select", {"mapId": map_id})
            act(session, "C", "score_submit", {"score": {"left": 1, "right": 0}})
        self.assertEqual(session.status.lifecycle, "completed")
        self.assertEqual(session.response(force_full=True, portal_code="C")["allowedActions"], [])
        checkpoint = next(item for item in session.history_summary() if item["phase"]["type"] == "score_entry")
        with self.assertRaises(StateActionError) as blocked:
            session.rollback(checkpoint["revision"])
        self.assertEqual(blocked.exception.code, "rollback_after_completion_disabled")

    def test_pause_freezes_authoritative_deadline(self) -> None:
        clock = [1_000_000]
        config = fast_config()
        config["timing"]["preMatchRestSeconds"] = 10
        session = start_session(config, now_ms=lambda: clock[0])
        clock[0] += 3_000
        self.assertEqual(session.response(force_full=True)["runtime"]["remainingTimeMs"], 7_000)
        act(session, "C", "global_pause_set", {"active": True})
        clock[0] += 20_000
        self.assertEqual(session.response(force_full=True)["runtime"]["remainingTimeMs"], 7_000)
        act(session, "C", "global_pause_set", {"active": False})

    def test_team_pause_limits_auto_end_and_rejected_start_does_not_mutate_state(self) -> None:
        clock = [1_000_000]
        config = fast_config()
        config["pause"].update({
            "teamPauseMaxCountPerMap": 2,
            "teamPauseMaxSingleSeconds": 2,
            "teamPauseMaxTotalSeconds": 5,
        })
        session = start_session(config, now_ms=lambda: clock[0])
        act(session, "A", "map_select", {"mapId": "ilios"})

        act(session, "A", "score_pause_set", {"active": True}, command_id="pause-start-1")
        clock[0] += 2_500
        runtime = session.response(force_full=True, portal_code="A")["runtime"]
        self.assertFalse(runtime["pause"]["scoreTeams"]["left"]["active"])
        self.assertEqual(runtime["pause"]["scoreTeams"]["left"]["phaseTotalMs"], 2_000)
        self.assertEqual(session.notification_events[-1]["eventType"], "TEAM_PAUSE_AUTO_ENDED")

        act(session, "A", "score_pause_set", {"active": True}, command_id="pause-start-2")
        clock[0] += 2_500
        runtime = session.response(force_full=True, portal_code="A")["runtime"]
        self.assertFalse(runtime["pause"]["scoreTeams"]["left"]["active"])
        self.assertEqual(runtime["pause"]["scoreTeams"]["left"]["phaseTotalMs"], 4_000)

        with self.assertRaises(StateActionError) as blocked:
            act(session, "A", "score_pause_set", {"active": True}, command_id="pause-start-3")
        self.assertEqual(blocked.exception.code, "pause_limit_reached")
        self.assertFalse(session.runtime.pause["scoreTeams"]["left"]["active"])
        self.assertEqual(session.runtime.pause["scoreTeams"]["left"]["count"], 2)

    def test_retry_timeout_rotates_runtime_without_rotating_phase(self) -> None:
        config = fast_config()
        config["timing"]["timeoutExtensionSeconds"] = 30
        session = start_session(config)
        old_phase_id = session.status.phase["phaseId"]
        old_runtime_id = session.runtime.runtimeId
        session._timeout_policy("retry_after_delay", session.status.phase["type"])
        self.assertEqual(session.status.phase["phaseId"], old_phase_id)
        self.assertNotEqual(session.runtime.runtimeId, old_runtime_id)
        self.assertEqual(session.runtime.remainingTimeMs, 30_000)
        self.assertFalse(session.runtime.timedOut)

    def test_lineup_timeout_with_both_sides_missing_always_enters_admin_decision(self) -> None:
        for policy in ("retry_after_delay", "forfeit_map", "admin_decision"):
            config = fast_config(lineup="free_input")
            config["lineup"]["timeoutPolicy"] = policy
            session = start_session(config)
            act(session, "A", "map_select", {"mapId": "ilios"})
            self.assertEqual(session.status.phase["type"], "lineup_pick")

            session._handle_timeout()

            self.assertEqual(session.status.phase["type"], "admin_decision")
            self.assertEqual(session.status.phase["data"]["decisionKind"], "lineup_pick_timeout")
            self.assertTrue(any(
                event["eventType"] == "SELECTION_AWAITING_ADMIN"
                and event["payload"]["subject"] == "双方队伍"
                for event in session.notification_events
            ))

    def test_lineup_retry_preserves_submitted_side_and_names_only_missing_side(self) -> None:
        config = fast_config(lineup="free_input")
        config["lineup"]["timeoutPolicy"] = "retry_after_delay"
        session = start_session(config)
        act(session, "A", "map_select", {"mapId": "ilios"})
        left_lineup = {slot["id"]: f"left-{slot['id']}" for slot in LINEUP_SLOTS}
        act(session, "A", "lineup_submit", {"lineup": left_lineup})
        old_runtime_id = session.runtime.runtimeId

        session._handle_timeout()

        self.assertEqual(session.status.phase["type"], "lineup_pick")
        self.assertNotEqual(session.runtime.runtimeId, old_runtime_id)
        self.assertEqual(session.runtime.lineupSubmissions["left"], left_lineup)
        self.assertIsNone(session.runtime.lineupSubmissions["right"])
        self.assertEqual(session.response(force_full=True, portal_code="A")["runtime"]["lineupSubmitted"], {
            "left": True,
            "right": False,
        })
        timeout_event = session.notification_events[-1]
        self.assertEqual(timeout_event["eventType"], "SELECTION_TIMEOUT_EXTENDED")
        self.assertEqual(timeout_event["payload"]["subject"], "队伍 2")

    def test_side_notifications_use_business_labels_and_admin_actor(self) -> None:
        config = fast_config()
        config["sideChoice"]["firstMapSideChoiceEnabled"] = True
        session = start_session(config)
        act(session, "A", "map_select", {"mapId": "circuit_royal"})
        act(session, "C", "side_select", {"selectedSide": "left"})
        event = next(item for item in session.notification_events if item["eventType"] == "SIDE_CONFIRMED_BY_ADMIN")
        self.assertEqual(event["payload"]["choice"], "先防守方")
        self.assertEqual(event["payload"]["choiceKind"], "攻防")

        color_config = fast_config()
        color_config["sideChoice"]["firstMapSideChoiceEnabled"] = True
        color_config["sideChoice"]["symmetricSideChoiceEnabled"] = True
        color = start_session(color_config)
        act(color, "A", "map_select", {"mapId": "ilios"})
        act(color, "A", "side_select", {"selectedSide": "left"})
        color_event = next(item for item in color.notification_events if item["eventType"] == "SIDE_CONFIRMED")
        self.assertEqual(color_event["payload"]["choice"], "蓝色方")

    def test_multiword_hero_id_is_accepted_for_ban(self) -> None:
        session = start_session(fast_config(ban=True))
        act(session, "A", "map_select", {"mapId": "ilios"})
        self.assertEqual(session.status.phase["type"], "ban_order")
        chooser = session.status.phase["actorSide"]
        chooser_portal = "A" if chooser == "left" else "B"
        act(session, chooser_portal, "ban_order_select", {"choice": "first"})
        first_side = session.status.phase["actorSide"]
        first_portal = "A" if first_side == "left" else "B"
        act(session, first_portal, "hero_ban_select", {"heroId": "jetpack_cat"})
        current = session.status.match["maps"][0]
        self.assertEqual(current["bans"][f"{first_side}HeroId"], "jetpackcat")

    def test_all_automatic_timeout_choices_publish_concrete_notifications(self) -> None:
        interactive_config = fast_config()
        interactive_config["map"]["initialPriorityPolicy"] = "interactive_random"
        interactive = start_session(interactive_config)
        act(interactive, "A", "interactive_random_submit", {"value": 1})
        interactive._handle_timeout()
        random_event = next(item for item in reversed(interactive.notification_events) if item["eventType"] == "INTERACTIVE_RANDOM_RESULT")
        self.assertIn("队伍 2未提交随机值", random_event["payload"]["timeoutSummary"])
        self.assertIn("系统按0处理", random_event["payload"]["timeoutSummary"])

        map_session = start_session(fast_config())
        map_session._timeout_policy("random_legal_map", "map_pick")
        self.assertEqual(map_session.notification_events[-1]["eventType"], "MAP_TIMEOUT_RANDOM")

        for policy, event_type, policy_label in (
            ("random_legal_choice", "SIDE_TIMEOUT_RANDOM", None),
            ("chooser_blue_defense", "SIDE_TIMEOUT_DEFAULT", "选择蓝色/防守方"),
            ("chooser_red_attack", "SIDE_TIMEOUT_DEFAULT", "选择红色/进攻方"),
        ):
            side_config = fast_config()
            side_config["sideChoice"]["firstMapSideChoiceEnabled"] = True
            side_session = start_session(side_config)
            act(side_session, "A", "map_select", {"mapId": "circuit_royal"})
            side_session._timeout_policy(policy, "side_pick")
            timeout_event = side_session.notification_events[-1]
            self.assertEqual(timeout_event["eventType"], event_type)
            self.assertTrue(timeout_event["payload"]["choice"])
            if policy_label:
                self.assertEqual(timeout_event["payload"]["policyLabel"], policy_label)

        for policy, policy_label in (
            ("random_legal_order", "随机合法顺序"),
            ("advantage_first", "自动先手"),
            ("advantage_second", "自动后手"),
        ):
            ban_order = start_session(fast_config(ban=True))
            act(ban_order, "A", "map_select", {"mapId": "ilios"})
            ban_order._timeout_policy(policy, "ban_order")
            timeout_event = ban_order.notification_events[-1]
            self.assertEqual(timeout_event["eventType"], "BAN_ORDER_TIMEOUT_AUTOMATIC")
            self.assertEqual(timeout_event["payload"]["policyLabel"], policy_label)
            self.assertIn(timeout_event["payload"]["firstOrSecond"], {"先手禁用", "后手禁用"})

        hero_ban = start_session(fast_config(ban=True))
        act(hero_ban, "A", "map_select", {"mapId": "ilios"})
        chooser = hero_ban.status.phase["actorSide"]
        act(hero_ban, "A" if chooser == "left" else "B", "ban_order_select", {"choice": "first"})
        hero_ban._timeout_policy("random_legal_hero", "ban_first")
        self.assertEqual(hero_ban.notification_events[-1]["eventType"], "HERO_BAN_TIMEOUT_RANDOM")

        score = start_session(fast_config())
        act(score, "A", "map_select", {"mapId": "ilios"})
        act(score, "A", "score_submit", {"score": {"left": 3, "right": 2}})
        score._handle_timeout()
        score_event = next(item for item in score.notification_events if item["eventType"] == "SCORE_CONFIRMATION_TIMEOUT_AUTO")
        self.assertEqual(score_event["payload"]["teamName"], "队伍 2")
        self.assertEqual((score_event["payload"]["leftScore"], score_event["payload"]["rightScore"]), (3, 2))

    def test_twenty_rooms_eighty_segment_checks_fit_worker_budget(self) -> None:
        tracemalloc.start()
        baseline, _ = tracemalloc.get_traced_memory()
        registry = RoomStateRegistry()
        sessions: list[RoomSession] = []
        for room_index in range(20):
            tokens = {code: f"token-{room_index:02d}-{code}" for code in room_app.ROOM_ROLES}
            sessions.append(registry.create(f"load-{room_index:02d}", tokens, default_config()))

        durations: list[float] = []
        for session in sessions:
            initial = session.response(force_full=True, portal_code="A")
            for code in room_app.ROOM_ROLES:
                started = time.perf_counter()
                response = session.response(initial["check"], portal_code=code)
                durations.append(time.perf_counter() - started)
                self.assertNotIn("status", response)

        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        p95 = sorted(durations)[int(len(durations) * 0.95) - 1]
        self.assertLess(p95, 0.2)
        self.assertLess(peak - baseline, 512 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()
