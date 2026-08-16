from __future__ import annotations

import secrets
import threading
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Callable

try:
    from backend.state_models import (
        MATCH_WINS,
        PORTAL_ROLES,
        PORTAL_SIDES,
        SIDES,
        RoomRuntime,
        RoomStatus,
        StateValidationError,
        catalog_hero_id,
        empty_map,
        normalize_config,
        other_side,
        stable_id,
        status_hash,
    )
except ModuleNotFoundError:
    from state_models import (  # type: ignore[no-redef]
        MATCH_WINS,
        PORTAL_ROLES,
        PORTAL_SIDES,
        SIDES,
        RoomRuntime,
        RoomStatus,
        StateValidationError,
        catalog_hero_id,
        empty_map,
        normalize_config,
        other_side,
        stable_id,
        status_hash,
    )


class StateActionError(ValueError):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


PHASE_LIMITS = {
    "pre_start_rest": "preMatchRestSeconds",
    "interactive_random": "interactiveRandomSeconds",
    "map_pick": "mapPickSeconds",
    "side_pick": "sidePickSeconds",
    "lineup_pick": "lineupSubmitSeconds",
    "ban_order": "banOrderSeconds",
    "ban_first": "firstBanSeconds",
    "ban_second": "secondBanSeconds",
    "score_confirmation": "scoreConfirmationSeconds",
    "post_map_rest": "interMapRestSeconds",
}
INTERACTIVE_RANDOM_RESULT_SECONDS = 5
LINEUP_SLOTS = (
    {"id": "damage_1", "role": "damage", "label": "输出 1"},
    {"id": "damage_2", "role": "damage", "label": "输出 2"},
    {"id": "tank", "role": "tank", "label": "重装"},
    {"id": "support_1", "role": "support", "label": "支援 1"},
    {"id": "support_2", "role": "support", "label": "支援 2"},
)


@dataclass
class RoomSession:
    room_id: str
    status: RoomStatus
    runtime: RoomRuntime
    status_history: list[dict[str, Any]] = field(default_factory=list)
    processed_requests: dict[str, dict[str, Any]] = field(default_factory=dict)
    notification_events: list[dict[str, Any]] = field(default_factory=list)
    notification_sequence: int = 0
    lock: threading.RLock = field(default_factory=threading.RLock)
    now_ms: Callable[[], int] = field(default=lambda: int(time.time() * 1000), repr=False)
    _deadline_ms: int | None = None
    _global_pause_started_ms: int | None = None
    _score_pause_started_ms: int | None = None
    _score_team_pause_started: dict[str, int | None] = field(default_factory=lambda: {"left": None, "right": None})
    _score_team_pause_current_ms: dict[str, int] = field(default_factory=lambda: {"left": 0, "right": 0})
    _runtime_fingerprint: str = ""
    _admin_decision_private: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        room_id: str,
        config: dict[str, Any] | None = None,
        catalog_hash: str = "",
        hero_pool: dict[str, list[str]] | None = None,
        map_capabilities: dict[str, str] | None = None,
        now_ms: Callable[[], int] | None = None,
    ) -> "RoomSession":
        normalized = normalize_config(
            config or {},
            accept_legacy=True,
            hero_pool=hero_pool,
            map_capabilities=map_capabilities,
        )
        status = RoomStatus.initial(room_id, normalized, catalog_hash)
        runtime = RoomRuntime(status.revision, status.hash, status.phase["phaseId"])
        session = cls(room_id, status, runtime, now_ms=now_ms or (lambda: int(time.time() * 1000)))
        session.status_history.append(status.to_dict())
        session._reset_runtime_for_phase()
        if normalized["startPolicy"] == "auto_when_both_ready":
            session._publish("waiting_ready", None, None, {})
        return session

    def response(
        self,
        client: dict[str, Any] | None = None,
        notification_cursor: int | None = None,
        *,
        force_full: bool = False,
        portal_code: str | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            self._settle_timeouts()
            self._refresh_runtime()
            self._bump_runtime_seq_if_changed()
            notification_stream = self._notification_stream(notification_cursor)
            board = self._board_segment()
            facts = self._facts_segment()
            phase = deepcopy(self.status.phase)
            runtime, private_context = self._runtime_segments_for_portal(portal_code)
            presence = deepcopy(self.runtime.presence)
            check = {
                "epoch": self.status.epoch,
                "boardHash": board["boardHash"],
                "factsRevision": facts["revision"],
                "factsHash": facts["factsHash"],
                "phaseId": phase["phaseId"],
                "runtimeId": runtime["runtimeId"],
                "runtimeSeq": runtime["runtimeSeq"],
                "presenceHash": status_hash({"presence": presence}),
                "privateHash": status_hash({"privateContext": private_context}),
            }
            supplied = client if isinstance(client, dict) else {}
            rebase = bool(supplied) and supplied.get("epoch") != self.status.epoch
            result: dict[str, Any] = {
                "kind": "rebase" if rebase else "changed",
                "check": check,
                "notificationStream": notification_stream,
            }
            if force_full or supplied.get("boardHash") != check["boardHash"]:
                result["board"] = board
            if force_full or rebase or supplied.get("factsHash") != check["factsHash"]:
                result["facts"] = facts
            if force_full or rebase or supplied.get("phaseId") != check["phaseId"]:
                result["phase"] = phase
            if (
                force_full
                or rebase
                or supplied.get("runtimeId") != check["runtimeId"]
                or supplied.get("runtimeSeq") != check["runtimeSeq"]
            ):
                result["runtime"] = runtime
            if force_full or supplied.get("presenceHash") != check["presenceHash"]:
                result["presence"] = presence
            if force_full or supplied.get("privateHash") != check["privateHash"]:
                result["privateContext"] = private_context
            result["allowedActions"] = self._allowed_actions(portal_code)
            if len(result) == 4 and result["kind"] == "changed":
                result["kind"] = "ok"
            return result

    def _bump_runtime_seq_if_changed(self) -> None:
        raw = self.runtime.to_dict()
        raw.pop("runtimeSeq", None)
        fingerprint = status_hash(raw)
        if self._runtime_fingerprint and fingerprint != self._runtime_fingerprint:
            self.runtime.runtimeSeq += 1
        self._runtime_fingerprint = fingerprint

    def _board_segment(self) -> dict[str, Any]:
        config_hash = status_hash({"config": self.status.config})
        public_config = {key: deepcopy(value) for key, value in self.status.config.items() if not key.startswith("_")}
        board = {
            "schemaVersion": 1,
            "roomId": self.status.roomId,
            "catalogHash": self.status.catalogHash,
            "configVersion": int(self.status.config.get("schemaVersion", 1)),
            "configHash": config_hash,
            "config": public_config,
        }
        board["boardHash"] = status_hash(board)
        return board

    def _facts_segment(self) -> dict[str, Any]:
        facts = {
            "epoch": self.status.epoch,
            "revision": self.status.revision,
            "lifecycle": self.status.lifecycle,
            "match": deepcopy(self.status.match),
        }
        facts["factsHash"] = status_hash(facts)
        return facts

    def _runtime_segments_for_portal(self, portal_code: str | None) -> tuple[dict[str, Any], dict[str, Any]]:
        full = self.runtime.to_dict()
        presence = full.pop("presence", {})
        del presence
        lineup = full.pop("lineupSubmissions", {"left": None, "right": None})
        decision_lineups = self._admin_decision_private.get("lineupSubmissions")
        submitted_source = decision_lineups if isinstance(decision_lineups, dict) else lineup
        decision_choices = self._admin_decision_private.get("interactiveRandom")
        choices = decision_choices if isinstance(decision_choices, dict) else full.get("interactiveRandom")
        own_side = PORTAL_SIDES.get(portal_code) if portal_code else None
        both_lineups = all(lineup.get(side) is not None for side in SIDES)
        private_context: dict[str, Any] = {
            "lineupSubmissions": {
                side: deepcopy(lineup.get(side))
                if both_lineups or side == own_side
                else None
                for side in SIDES
            },
        }
        full["lineupSubmitted"] = {side: submitted_source.get(side) is not None for side in SIDES}
        if isinstance(choices, dict):
            full["interactiveRandomSubmitted"] = {side: choices.get(side) in {0, 1} for side in SIDES}
            private_choices = {side: None for side in SIDES}
            if self.runtime.interactiveRandomResult is not None:
                private_choices = deepcopy(choices)
            elif own_side in SIDES:
                private_choices[own_side] = choices.get(own_side)
            private_context["interactiveRandom"] = private_choices
            full["interactiveRandom"] = {side: None for side in SIDES}
        return full, private_context

    def _allowed_actions(self, portal_code: str | None) -> list[str]:
        if portal_code == "D" or portal_code not in PORTAL_ROLES:
            return []
        if self.status.lifecycle == "completed":
            return []
        phase = self.status.phase["type"]
        if phase == "admin_decision":
            return ["timeout_resolve"] if portal_code == "C" else []
        actions = {
            "configuring": ["config_confirm", "team_name_set"],
            "waiting_ready": ["portal_ready_set", "match_start"],
            "pre_start_rest": ["rest_skip"],
            "interactive_random": ["interactive_random_submit"],
            "map_pick": ["map_select"],
            "side_pick": ["side_select"],
            "lineup_pick": ["lineup_submit"],
            "ban_order": ["ban_order_select"],
            "ban_first": ["hero_ban_select"],
            "ban_second": ["hero_ban_select"],
            "score_entry": ["score_submit", "score_confirm", "score_reject", "score_pause_set"],
            "post_map_rest": ["rest_skip"],
        }.get(phase, [])
        if portal_code == "C":
            actions = list(actions) + ["global_pause_set", "map_forfeit"]
        return sorted(set(actions))

    def _runtime_for_portal(self, portal_code: str | None) -> dict[str, Any]:
        runtime, private_context = self._runtime_segments_for_portal(portal_code)
        runtime["presence"] = deepcopy(self.runtime.presence)
        runtime["lineupSubmissions"] = private_context["lineupSubmissions"]
        if "interactiveRandom" in private_context:
            runtime["interactiveRandom"] = private_context["interactiveRandom"]
        return runtime

    def status_ref(self) -> dict[str, Any]:
        return {
            "epoch": self.status.epoch,
            "revision": self.status.revision,
            "hash": self.status.hash,
            "phaseId": self.status.phase["phaseId"],
            "runtimeId": self.runtime.runtimeId,
        }

    def heartbeat(
        self,
        portal_code: str,
        client: dict[str, Any] | None = None,
        notification_cursor: int | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            if portal_code not in PORTAL_ROLES:
                raise StateActionError("forbidden", "未知入口", 403)
            entry = self.runtime.presence.setdefault(portal_code, {"ready": False, "nameConfirmed": False})
            entry["lastSeenAt"] = self.now_ms()
            entry["connected"] = True
            return self.response(client, notification_cursor, portal_code=portal_code)

    def history_summary(self) -> list[dict[str, Any]]:
        with self.lock:
            return [
                {
                    "epoch": item["epoch"],
                    "revision": item["revision"],
                    "hash": item["hash"],
                    "lifecycle": item["lifecycle"],
                    "phase": deepcopy(item["phase"]),
                }
                for item in self.status_history
                if self._is_legal_checkpoint(item)
            ]

    def _is_legal_checkpoint(self, item: dict[str, Any]) -> bool:
        phase = item.get("phase") if isinstance(item.get("phase"), dict) else {}
        phase_to_checkpoint = {
            "pre_start_rest": "pre_countdown",
            "map_pick": "map_pick",
            "lineup_pick": "lineup",
            "ban_order": "ban_order",
            "ban_first": "first_ban",
            "ban_second": "second_ban",
            "score_entry": "score_entry",
        }
        checkpoint = phase_to_checkpoint.get(phase.get("type"))
        if checkpoint is None:
            return False
        rollback = self.status.config["rollback"]
        map_index = phase.get("mapIndex")
        overrides = rollback.get("mapOverrides", {})
        configured = overrides.get(str(map_index), rollback.get("defaultCheckpoints", []))
        return checkpoint in configured

    def _notification_stream(self, cursor: int | None) -> dict[str, Any]:
        if cursor is None:
            events: list[dict[str, Any]] = []
        else:
            safe_cursor = max(0, int(cursor))
            events = [
                deepcopy(event)
                for event in self.notification_events
                if int(event["sequence"]) > safe_cursor
            ]
        return {"cursor": self.notification_sequence, "events": events}

    def _append_notification(
        self,
        event_type: str,
        portal_code: str | None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self.notification_sequence += 1
        side = PORTAL_SIDES.get(portal_code) if portal_code else None
        actor = (
            {
                "kind": "portal",
                "portalCode": portal_code,
                "role": PORTAL_ROLES[portal_code],
                "side": side,
            }
            if portal_code in PORTAL_ROLES
            else {"kind": "system", "portalCode": None, "role": "system", "side": None}
        )
        self.notification_events.append({
            "eventId": uuid.uuid4().hex,
            "sequence": self.notification_sequence,
            "eventType": event_type,
            "actor": actor,
            "payload": deepcopy(payload or {}),
            "occurredAt": self.now_ms(),
            "statusVersion": self.status_ref(),
        })
        self.notification_events = self.notification_events[-100:]

    def _team_name(self, side: str | None) -> str:
        if side in SIDES:
            return str(self.status.match["teams"][side]["name"])
        return ""

    def _selection_subject(self, phase: dict[str, Any]) -> str:
        actor_side = phase.get("actorSide")
        if actor_side in SIDES:
            return self._team_name(actor_side)
        if phase.get("type") == "lineup_pick":
            missing_sides = [side for side in SIDES if self.runtime.lineupSubmissions.get(side) is None]
            if len(missing_sides) == 1:
                return self._team_name(missing_sides[0])
        if actor_side == "both":
            return "双方队伍"
        return "当前操作方"

    @staticmethod
    def _side_choice_label(kind: str | None, chooser: str, selected: str) -> str:
        chooser_selected = selected == chooser
        if kind == "attack_defense":
            return "先防守方" if chooser_selected else "先进攻方"
        return "蓝色方" if chooser_selected else "红色方"

    def _business_stage_label(self, phase: dict[str, Any]) -> str:
        map_index = phase.get("mapIndex")
        prefix = f"第{int(map_index) + 1}张地图的" if isinstance(map_index, int) else ""
        phase_type = phase.get("type")
        choice_kind = phase.get("data", {}).get("choiceKind") if isinstance(phase.get("data"), dict) else None
        labels = {
            "map_pick": "选图阶段",
            "side_pick": "攻防选择阶段" if choice_kind == "attack_defense" else "阵营选择阶段",
            "lineup_pick": "上场人员确认阶段",
            "ban_order": "英雄禁用顺序确认阶段",
            "ban_first": "先手英雄禁用阶段",
            "ban_second": "后手英雄禁用阶段",
            "score_entry": "比分录入阶段",
            "score_confirmation": "比分确认阶段",
            "interactive_random": "交互随机阶段",
            "configuring": "赛前配置",
        }
        return f"{prefix}{labels.get(str(phase_type), str(phase_type))}"

    def _record_map_result_notifications(self, before_status: dict[str, Any]) -> None:
        before_maps = before_status["match"]["maps"]
        for index, current in enumerate(self.status.match["maps"]):
            before = before_maps[index]
            if before.get("status") == current.get("status") or current.get("status") not in {"completed", "forfeited"}:
                continue
            winner = current.get("winnerSide")
            if winner in SIDES:
                self._append_notification(
                    "MAP_WON",
                    None,
                    {
                        "mapIndex": index,
                        "winnerSide": winner,
                        "winnerTeam": self._team_name(winner),
                    },
                )
        match_winner = self.status.match.get("winnerSide")
        if not before_status["match"].get("winnerSide") and match_winner in SIDES:
            self._append_notification(
                "MATCH_WON",
                None,
                {"winnerSide": match_winner, "winnerTeam": self._team_name(match_winner)},
            )

    def _record_action_notifications(
        self,
        portal_code: str,
        action_type: str,
        payload: dict[str, Any],
        before_status: dict[str, Any],
        before_runtime: dict[str, Any],
    ) -> None:
        before_phase = before_status["phase"]
        before_phase_type = before_phase["type"]
        before_map_index = before_phase.get("mapIndex")
        actor_side = PORTAL_SIDES.get(portal_code)
        if portal_code == "C":
            requested_side = payload.get("side")
            actor_side = requested_side if requested_side in SIDES else before_phase.get("actorSide")

        if action_type == "match_start" and before_phase_type == "waiting_ready":
            self._append_notification(
                "MATCH_STARTED_FORCE" if payload.get("force") is True else "MATCH_STARTED_MANUAL",
                portal_code,
            )
        elif (
            action_type == "portal_ready_set"
            and before_phase_type == "waiting_ready"
            and self.status.phase["type"] != "waiting_ready"
        ):
            self._append_notification("MATCH_STARTED_AUTO", None)
        elif action_type == "map_select" and isinstance(before_map_index, int):
            selected = self.status.match["maps"][before_map_index]
            event_type = "MAP_CONFIRMED_BY_ADMIN" if portal_code == "C" else "MAP_CONFIRMED"
            self._append_notification(event_type, portal_code, {
                "mapIndex": before_map_index,
                "mapId": selected.get("mapId"),
                "mapName": selected.get("mapId"),
                "teamName": self._team_name(actor_side),
                "side": actor_side,
            })
        elif action_type == "side_select":
            selected = payload.get("selectedSide")
            kind = before_phase.get("data", {}).get("choiceKind")
            choice_label = self._side_choice_label(kind, actor_side, selected)
            event_type = "SIDE_CONFIRMED_BY_ADMIN" if portal_code == "C" else "SIDE_CONFIRMED"
            self._append_notification(event_type, portal_code, {
                "mapIndex": before_map_index,
                "teamName": self._team_name(actor_side),
                "side": actor_side,
                "selectedSide": selected,
                "choiceKind": "攻防" if kind == "attack_defense" else "阵营",
                "choice": choice_label,
            })
        elif action_type == "lineup_submit" and before_phase_type == "lineup_pick" and self.status.phase["type"] != "lineup_pick":
            self._append_notification("LINEUPS_SUBMITTED", portal_code, {"mapIndex": before_map_index})
        elif action_type == "ban_order_select":
            choice = payload.get("choice")
            event_type = "BAN_ORDER_CONFIRMED_BY_ADMIN" if portal_code == "C" else "BAN_ORDER_CONFIRMED"
            self._append_notification(event_type, portal_code, {
                "mapIndex": before_map_index,
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "firstOrSecond": "先手禁用" if choice == "first" else "后手禁用",
            })
        elif action_type == "hero_ban_select":
            event_type = "HERO_BAN_CONFIRMED_BY_ADMIN" if portal_code == "C" else "HERO_BAN_CONFIRMED"
            self._append_notification(event_type, portal_code, {
                "mapIndex": before_map_index,
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "heroId": catalog_hero_id(payload.get("heroId")),
                "heroName": catalog_hero_id(payload.get("heroId")),
            })
        elif action_type == "global_pause_set":
            self._append_notification("GLOBAL_PAUSE_CHANGED", portal_code, {
                "active": payload.get("active") is True,
            })
        elif action_type == "score_pause_set" and actor_side in SIDES:
            self._append_notification("TEAM_PAUSE_CHANGED", portal_code, {
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "active": payload.get("active") is True,
            })
        elif action_type == "timeout_resolve" and before_runtime.get("awaitingAdminDecision"):
            resolution = payload.get("resolution")
            decision_data = before_phase.get("data", {}) if isinstance(before_phase.get("data"), dict) else {}
            source_phase = decision_data.get("sourcePhase") if isinstance(decision_data.get("sourcePhase"), dict) else before_phase
            summaries = {
                "retry": "重新开始选择",
                "extend": "延迟后重新选择",
                "extend_30": "延迟后重新选择",
                "forfeit": "本张地图判负",
                "approve_score": "批准原比分",
                "replace_score": "填写替代比分",
                "select_map": "管理员代选地图",
                "select_side": "管理员代选阵营",
                "select_ban_order": "管理员代选 Ban 顺序",
                "submit_lineup": "管理员代填阵容",
                "select_hero": "管理员代选英雄",
                "random_legal_hero": "随机合法英雄",
                "submit_interactive_random": "管理员补齐交互随机值",
                "series_winner": "管理员裁定系列赛胜方",
            }
            self._append_notification("ADMIN_DECISION_RESOLVED", portal_code, {
                "decisionType": self._business_stage_label(source_phase),
                "decisionKind": before_phase.get("data", {}).get("decisionKind"),
                "resolution": resolution,
                "decisionSummary": summaries.get(str(resolution), str(resolution)),
                "winnerSide": payload.get("winnerSide") if resolution == "series_winner" else None,
                "winnerTeam": self._team_name(payload.get("winnerSide")) if resolution == "series_winner" else None,
            })
            if resolution == "submit_lineup" and self.status.phase["type"] != "lineup_pick":
                self._append_notification("LINEUPS_SUBMITTED", portal_code, {"mapIndex": before_map_index})

        if action_type in {"score_submit", "score_confirm"}:
            self._record_map_result_notifications(before_status)

    def has_live_presence(self) -> bool:
        with self.lock:
            self._refresh_runtime()
            return any(bool(entry.get("connected")) for entry in self.runtime.presence.values())

    def update_config(self, value: Any) -> dict[str, Any]:
        with self.lock:
            if self.status.lifecycle != "preparing" or self.status.phase["type"] not in {"configuring", "waiting_ready"}:
                raise StateActionError("config_locked", "比赛开始后不能修改配置", 409)
            normalized = normalize_config(
                value,
                hero_pool=self.status.config.get("_heroPool"),
                map_capabilities=self.status.config.get("_mapCapabilities"),
            )
            self.status.config = normalized
            self.status.match["teams"]["left"]["name"] = normalized["teamNames"]["left"]
            self.status.match["teams"]["right"]["name"] = normalized["teamNames"]["right"]
            expected_count = {"ft2": 5, "ft3": 7, "ft4": 9}[normalized["matchFormat"]]
            current_maps = self.status.match["maps"]
            if len(current_maps) != expected_count:
                self.status.match["maps"] = [empty_map(index) for index in range(expected_count)]
            next_phase = "waiting_ready" if normalized["startPolicy"] == "auto_when_both_ready" else "configuring"
            self._publish(next_phase, None, None, {})
            return self.response(force_full=True)

    def apply_action(
        self,
        portal_code: str,
        action_type: str,
        payload: dict[str, Any],
        expected: dict[str, Any] | None,
        request_id: str,
        notification_cursor: int | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            if portal_code not in PORTAL_ROLES:
                raise StateActionError("forbidden", "未知入口", 403)
            if portal_code == "D":
                raise StateActionError("forbidden", "直播入口只读", 403)
            if self.status.phase["type"] == "admin_decision" and portal_code != "C":
                raise StateActionError("action_not_allowed", "管理员裁定期间只有管理员可以操作", 422)
            if self.status.phase["type"] == "admin_decision" and action_type != "timeout_resolve":
                raise StateActionError("action_not_allowed", "管理员裁定必须使用裁定命令", 422)
            if not request_id or len(request_id) > 128:
                raise StateActionError("invalid_request_id", "requestId 缺失或过长")
            if request_id in self.processed_requests:
                return deepcopy(self.processed_requests[request_id])
            self._settle_timeouts()
            self._validate_command_context(expected)
            if self.runtime.pause["global"]["active"] and not (
                action_type == "global_pause_set"
                and portal_code == "C"
                and payload.get("active") is False
            ):
                raise StateActionError("global_paused", "全局暂停期间只能恢复全局暂停", 409)

            handlers = {
                "config_confirm": self._action_config_confirm,
                "team_name_set": self._action_team_name_set,
                "portal_ready_set": self._action_ready,
                "match_start": self._action_start,
                "interactive_random_submit": self._action_interactive_random,
                "map_select": self._action_map_select,
                "side_select": self._action_side_select,
                "lineup_submit": self._action_lineup_submit,
                "ban_order_select": self._action_ban_order,
                "hero_ban_select": self._action_hero_ban,
                "score_submit": self._action_score_submit,
                "score_confirm": self._action_score_confirm,
                "score_reject": self._action_score_reject,
                "rest_skip": self._action_rest_skip,
                "global_pause_set": self._action_global_pause,
                "score_pause_set": self._action_score_pause,
                "timeout_resolve": self._action_timeout_resolve,
                "map_forfeit": self._action_map_forfeit,
            }
            handler = handlers.get(action_type)
            if handler is None:
                raise StateActionError("invalid_action", f"不支持动作 {action_type}")
            before_status = self.status.to_dict()
            before_runtime = self.runtime.to_dict()
            handler(portal_code, payload)
            self._record_action_notifications(
                portal_code,
                action_type,
                payload,
                before_status,
                before_runtime,
            )
            result = self.response(
                notification_cursor=notification_cursor,
                force_full=True,
                portal_code=portal_code,
            )
            self.processed_requests[request_id] = deepcopy(result)
            if len(self.processed_requests) > 2048:
                self.processed_requests.pop(next(iter(self.processed_requests)))
            return result

    def rollback(self, revision: int, notification_cursor: int | None = None) -> dict[str, Any]:
        with self.lock:
            rollback_config = self.status.config["rollback"]
            if not rollback_config["enabled"]:
                raise StateActionError("rollback_disabled", "当前配置不允许回退", 409)
            if self.status.lifecycle == "completed" and not rollback_config["allowAfterCompletion"]:
                raise StateActionError("rollback_after_completion_disabled", "系列赛结束后不允许回退", 409)
            if self.runtime.pause["global"]["active"]:
                raise StateActionError("global_paused", "必须先恢复全局暂停才能回退比赛", 409)
            target_index = next((
                index
                for index, item in enumerate(self.status_history)
                if item["revision"] == revision and self._is_legal_checkpoint(item)
            ), None)
            target = self.status_history[target_index] if target_index is not None else None
            if target is None:
                raise StateActionError("checkpoint_not_found", "找不到合法目标检查点", 404)
            old_revision = self.status.revision
            restored = deepcopy(target)
            restored["epoch"] = self.status.epoch + 1
            restored["revision"] = old_revision + 1
            restored["phase"]["phaseId"] = self._phase_id(
                restored["epoch"], restored["revision"], restored["phase"]["type"]
            )
            self.status = RoomStatus(**restored)
            self.status.seal()
            # A rollback creates a new branch. Descendants of the target are no
            # longer legal checkpoints and must never be restorable again.
            self.status_history = self.status_history[:target_index + 1]
            self.status_history.append(self.status.to_dict())
            self.processed_requests.clear()
            self.notification_events = [
                event for event in self.notification_events
                if int(event.get("statusVersion", {}).get("revision") or 0) <= revision
            ]
            self._reset_runtime_for_phase()
            self._append_notification(
                "STAGE_RESTORED",
                "C",
                {
                    "stageLabel": self._business_stage_label(self.status.phase),
                    "targetCheckpoint": {
                        "epoch": target["epoch"],
                        "revision": target["revision"],
                        "phaseId": target["phase"]["phaseId"],
                        "phaseType": target["phase"]["type"],
                        "mapIndex": target["phase"].get("mapIndex"),
                    },
                },
            )
            return self.response(notification_cursor=notification_cursor, force_full=True)

    def _validate_command_context(self, expected: dict[str, Any] | None) -> None:
        if not isinstance(expected, dict):
            raise StateActionError("missing_command_context", "命令缺少状态核对信息", 409)
        if expected.get("epoch") != self.status.epoch:
            raise StateActionError("stale_epoch", "命令属于旧比赛分支", 409)
        if expected.get("phaseId") != self.status.phase["phaseId"]:
            raise StateActionError("stale_phase", "命令属于旧业务阶段", 409)
        if expected.get("runtimeId") != self.runtime.runtimeId:
            raise StateActionError("stale_runtime", "命令属于旧计时运行实例", 409)

    def _is_admin(self, portal_code: str) -> bool:
        return portal_code == "C"

    def _side(self, portal_code: str, payload: dict[str, Any] | None = None) -> str | None:
        side = PORTAL_SIDES[portal_code]
        if side is None and portal_code == "C" and payload:
            requested = payload.get("side")
            if requested in SIDES:
                side = requested
        return side

    def _require_admin(self, portal_code: str) -> None:
        if not self._is_admin(portal_code):
            raise StateActionError("forbidden", "仅管理员可以执行此操作", 403)

    def _require_phase(self, *phases: str) -> None:
        if self.status.phase["type"] not in phases:
            raise StateActionError("invalid_phase", f"当前阶段不能执行此操作：{self.status.phase['type']}", 409)

    def _require_actor(self, portal_code: str, payload: dict[str, Any] | None = None) -> str:
        side = self._side(portal_code, payload)
        actor = self.status.phase["actorSide"]
        if self._is_admin(portal_code):
            if side not in SIDES and actor in SIDES:
                side = actor
            return side or "left"
        if side is None or actor not in {side, "both"}:
            raise StateActionError("forbidden", "当前入口没有本阶段操作权", 403)
        return side

    def _phase_id(self, epoch: int, revision: int, phase_type: str) -> str:
        return f"{epoch}:{revision}:{phase_type}:{uuid.uuid4().hex[:10]}"

    def _publish(self, phase_type: str, map_index: int | None, actor: str | None, data: dict[str, Any]) -> None:
        self.status.revision += 1
        self.status.phase = {
            "phaseId": self._phase_id(self.status.epoch, self.status.revision, phase_type),
            "type": phase_type,
            "mapIndex": map_index,
            "actorSide": actor,
            "data": deepcopy(data),
        }
        if phase_type == "completed":
            self.status.lifecycle = "completed"
        elif phase_type not in {"configuring", "waiting_ready"}:
            self.status.lifecycle = "running"
        self.status.seal()
        self.status_history.append(self.status.to_dict())
        self._reset_runtime_for_phase()

    def _enter_admin_decision(self, decision_kind: str, data: dict[str, Any] | None = None) -> None:
        source_phase = deepcopy(self.status.phase)
        selection_subject = self._selection_subject(source_phase)
        self._admin_decision_private = {}
        if source_phase.get("type") == "lineup_pick":
            self._admin_decision_private["lineupSubmissions"] = deepcopy(self.runtime.lineupSubmissions)
        if source_phase.get("type") == "interactive_random":
            self._admin_decision_private["interactiveRandom"] = deepcopy(self.runtime.interactiveRandom)
        payload = deepcopy(data or {})
        payload.update({"decisionKind": decision_kind, "sourcePhase": source_phase})
        self._publish("admin_decision", source_phase.get("mapIndex"), None, payload)
        self.runtime.timedOut = True
        self.runtime.awaitingAdminDecision = True
        self.runtime.totalTimeMs = 0
        self.runtime.remainingTimeMs = 0
        self._deadline_ms = None
        self._append_notification("SELECTION_AWAITING_ADMIN", None, {
            "subject": selection_subject,
            "selectionType": self._business_stage_label(source_phase),
            "decisionKind": decision_kind,
        })

    def _reset_runtime_for_phase(self) -> None:
        previous_presence = deepcopy(self.runtime.presence) if hasattr(self, "runtime") else {}
        match_totals = {side: 0 for side in SIDES}
        if hasattr(self, "runtime"):
            for side in SIDES:
                match_totals[side] = int(self.runtime.pause.get("scoreTeams", {}).get(side, {}).get("matchTotalMs", 0))
        self.runtime = RoomRuntime(
            self.status.revision,
            self.status.hash,
            self.status.phase["phaseId"],
            runtimeId=f"runtime:{self.status.epoch}:{uuid.uuid4().hex}",
            runtimeSeq=1,
        )
        self._runtime_fingerprint = ""
        self.runtime.presence = previous_presence
        for code in PORTAL_ROLES:
            self.runtime.presence.setdefault(code, {"connected": False, "ready": False, "nameConfirmed": False, "lastSeenAt": 0})
        for side in SIDES:
            self.runtime.pause["scoreTeams"][side]["matchTotalMs"] = match_totals[side]
        phase = self.status.phase["type"]
        seconds = int(self.status.config["timing"].get(PHASE_LIMITS.get(phase, ""), 0))
        self.runtime.totalTimeMs = max(0, seconds * 1000)
        self.runtime.remainingTimeMs = self.runtime.totalTimeMs
        self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs if phase in PHASE_LIMITS else None
        self._global_pause_started_ms = None
        self._score_pause_started_ms = None
        self._score_team_pause_started = {"left": None, "right": None}
        self._score_team_pause_current_ms = {"left": 0, "right": 0}
        if phase == "interactive_random":
            self.runtime.interactiveRandom = {"left": None, "right": None}

    def _refresh_runtime(self) -> None:
        now = self.now_ms()
        for entry in self.runtime.presence.values():
            last_seen = int(entry.get("lastSeenAt") or 0)
            entry["connected"] = bool(last_seen and now - last_seen <= 5000)
        self._settle_team_pause_limits(now)
        if self._deadline_ms is not None:
            if self.runtime.pause["global"]["active"] or self._score_pause_started_ms is not None:
                return
            self.runtime.remainingTimeMs = max(0, self._deadline_ms - now)

    def _settle_team_pause_limits(self, now: int) -> None:
        if self.runtime.pause["global"]["active"]:
            return
        pause_config = self.status.config["pause"]
        single_seconds = pause_config.get("teamPauseMaxSingleSeconds")
        total_seconds = pause_config.get("teamPauseMaxTotalSeconds")
        candidates: list[tuple[int, str]] = []
        for side in SIDES:
            state = self.runtime.pause["scoreTeams"][side]
            started = self._score_team_pause_started[side]
            if not state["active"] or started is None:
                continue
            boundaries: list[int] = []
            if single_seconds is not None:
                remaining_single = max(0, int(single_seconds) * 1000 - self._score_team_pause_current_ms[side])
                boundaries.append(started + remaining_single)
            if total_seconds is not None:
                remaining_total = max(0, int(total_seconds) * 1000 - int(state["phaseTotalMs"]))
                boundaries.append(started + remaining_total)
            if boundaries:
                end_at = min(boundaries)
                if now >= end_at:
                    candidates.append((end_at, side))
        # Finish simultaneous/overlapping pauses chronologically so the shared
        # countdown is extended by the exact union of paused time.
        for end_at, side in sorted(candidates):
            self._end_team_pause(side, end_at=end_at, automatic=True)

    def _settle_timeouts(self) -> None:
        for _ in range(8):
            self._refresh_runtime()
            if self._deadline_ms is None or self.runtime.remainingTimeMs > 0:
                return
            before = self.status.phase["phaseId"]
            self._handle_timeout()
            if self.status.phase["phaseId"] == before:
                return

    def _handle_timeout(self) -> None:
        phase = self.status.phase["type"]
        if phase == "pre_start_rest":
            self._begin_first_map()
        elif phase == "post_map_rest":
            self._begin_next_map(self.status.phase["mapIndex"] + 1)
        elif phase == "interactive_random":
            if self.runtime.interactiveRandomResult is not None:
                self._continue_interactive_random()
                return
            assert self.runtime.interactiveRandom is not None
            missing_policy = self.status.config["map"]["interactiveRandomMissingInputPolicy"]
            if missing_policy == "admin_decision":
                self._enter_admin_decision("interactive_random", {"returnPhase": deepcopy(self.status.phase)})
                return
            missing_sides = [side for side in SIDES if self.runtime.interactiveRandom[side] is None]
            for side in missing_sides:
                if self.runtime.interactiveRandom[side] is None:
                    self.runtime.interactiveRandom[side] = 0 if missing_policy == "use_zero" else secrets.randbelow(2)
            fallback_parts = [
                f"{self._team_name(side)}未提交随机值，系统{'按0处理' if missing_policy == 'use_zero' else f'随机补全为{self.runtime.interactiveRandom[side]}'}"
                for side in missing_sides
            ]
            self._resolve_interactive_random("；".join(fallback_parts))
        elif phase == "map_pick":
            self._timeout_policy(self.status.config["map"]["mapPickTimeoutPolicy"], phase)
        elif phase == "side_pick":
            self._timeout_policy(self.status.config["sideChoice"]["timeoutPolicy"], phase)
        elif phase == "lineup_pick":
            if all(self.runtime.lineupSubmissions.get(side) is None for side in SIDES):
                self._enter_admin_decision("lineup_pick_timeout")
                return
            self._timeout_policy(self.status.config["lineup"]["timeoutPolicy"], phase)
        elif phase == "ban_order":
            self._timeout_policy(self.status.config["ban"]["orderTimeoutPolicy"], phase)
        elif phase in {"ban_first", "ban_second"}:
            self._timeout_policy(self.status.config["ban"]["actionTimeoutPolicy"], phase)
        elif phase == "score_confirmation":
            if self.status.config["score"]["confirmationTimeoutPolicy"] == "auto_confirm":
                before_status = self.status.to_dict()
                proposal = deepcopy(self.runtime.scoreProposal)
                score = proposal["score"]
                confirming_side = self.status.phase.get("actorSide")
                self._append_notification("SCORE_CONFIRMATION_TIMEOUT_AUTO", None, {
                    "teamName": self._team_name(confirming_side),
                    "leftTeam": self._team_name("left"),
                    "rightTeam": self._team_name("right"),
                    "leftScore": score["left"],
                    "rightScore": score["right"],
                })
                self._commit_score(score)
                self._record_map_result_notifications(before_status)
            else:
                self._enter_admin_decision("score_confirmation_timeout", {
                    "proposal": deepcopy(self.runtime.scoreProposal),
                })

    def _timeout_policy(self, policy: str, phase: str) -> None:
        if policy == "retry_after_delay":
            # The original deadline expired, but a fresh selection window starts
            # immediately. Keep the warning in the notification stream instead of
            # leaving the live phase in a blocked timed-out state.
            self.runtime.timedOut = False
            seconds = int(self.status.config["timing"]["timeoutExtensionSeconds"])
            selection_subject = self._selection_subject(self.status.phase)
            saved_lineups = deepcopy(self.runtime.lineupSubmissions) if phase == "lineup_pick" else None
            self._reset_runtime_for_phase()
            if saved_lineups is not None:
                self.runtime.lineupSubmissions = saved_lineups
            self.runtime.totalTimeMs = seconds * 1000
            self.runtime.remainingTimeMs = self.runtime.totalTimeMs
            self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs
            self._append_notification("SELECTION_TIMEOUT_EXTENDED", None, {
                "subject": selection_subject,
                "selectionType": self._business_stage_label(self.status.phase),
                "seconds": seconds,
            })
            return
        if policy == "admin_decision":
            self._enter_admin_decision(f"{phase}_timeout")
            return
        actor = self.status.phase["actorSide"]
        loser = actor if actor in SIDES else None
        if phase == "map_pick" and policy == "random_legal_map":
            legal = self._legal_maps(self.status.phase["mapIndex"])
            if legal:
                selection = secrets.choice(legal)
                self._select_map(actor, selection)
                self._append_notification("MAP_TIMEOUT_RANDOM", None, {
                    "teamName": self._team_name(actor),
                    "side": actor,
                    "mapId": selection[1],
                    "mapName": selection[1],
                })
                return
        if phase == "side_pick":
            chooser = actor if actor in SIDES else "left"
            kind = self.status.phase.get("data", {}).get("choiceKind")
            if policy == "random_legal_choice":
                selected = secrets.choice(list(SIDES))
                choice = self._side_choice_label(kind, chooser, selected)
                self._select_side(chooser, selected)
                self._append_notification("SIDE_TIMEOUT_RANDOM", None, {
                    "teamName": self._team_name(chooser),
                    "side": chooser,
                    "selectedSide": selected,
                    "choiceKind": "攻防" if kind == "attack_defense" else "阵营",
                    "choice": choice,
                })
                return
            if policy == "chooser_blue_defense":
                selected = chooser
                choice = self._side_choice_label(kind, chooser, selected)
                self._select_side(chooser, selected)
                self._append_notification("SIDE_TIMEOUT_DEFAULT", None, {
                    "teamName": self._team_name(chooser),
                    "side": chooser,
                    "selectedSide": selected,
                    "choiceKind": "攻防" if kind == "attack_defense" else "阵营",
                    "choice": choice,
                    "policyLabel": "选择蓝色/防守方",
                })
                return
            if policy == "chooser_red_attack":
                selected = other_side(chooser)
                choice = self._side_choice_label(kind, chooser, selected)
                self._select_side(chooser, selected)
                self._append_notification("SIDE_TIMEOUT_DEFAULT", None, {
                    "teamName": self._team_name(chooser),
                    "side": chooser,
                    "selectedSide": selected,
                    "choiceKind": "攻防" if kind == "attack_defense" else "阵营",
                    "choice": choice,
                    "policyLabel": "选择红色/进攻方",
                })
                return
        if phase in {"ban_first", "ban_second"} and policy == "random_legal_hero":
            heroes = self._legal_heroes(actor)
            if heroes and actor in SIDES:
                hero = secrets.choice(heroes)
                self._select_hero_ban(actor, hero)
                self._append_notification("HERO_BAN_TIMEOUT_RANDOM", None, {
                    "teamName": self._team_name(actor),
                    "side": actor,
                    "heroId": hero,
                    "heroName": hero,
                })
                return
        if phase == "ban_order" and policy == "random_legal_order":
            chooser = actor if actor in SIDES else secrets.choice(list(SIDES))
            choice = secrets.choice(["first", "second"])
            self._choose_ban_order(chooser, choice)
            self._append_notification("BAN_ORDER_TIMEOUT_AUTOMATIC", None, {
                "teamName": self._team_name(chooser),
                "firstOrSecond": "先手禁用" if choice == "first" else "后手禁用",
                "policyLabel": "随机合法顺序",
            })
            return
        if phase == "ban_order" and policy in {"advantage_first", "advantage_second"}:
            chooser = actor if actor in SIDES else "left"
            choice = "first" if policy == "advantage_first" else "second"
            self._choose_ban_order(chooser, choice)
            self._append_notification("BAN_ORDER_TIMEOUT_AUTOMATIC", None, {
                "teamName": self._team_name(chooser),
                "firstOrSecond": "先手禁用" if choice == "first" else "后手禁用",
                "policyLabel": "自动先手" if choice == "first" else "自动后手",
            })
            return
        if phase == "lineup_pick" and policy == "forfeit_map":
            missing = [side for side in SIDES if self.runtime.lineupSubmissions[side] is None]
            loser = missing[0] if len(missing) == 1 else None
        if loser:
            self._forfeit_current_map(loser, f"{phase}_timeout")
        else:
            self._enter_admin_decision(f"{phase}_timeout")

    def _action_config_confirm(self, portal: str, _payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        self._require_phase("configuring")
        self._publish("waiting_ready", None, None, {})

    def _action_team_name_set(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("configuring", "waiting_ready")
        side = self._side(portal, payload)
        if side not in SIDES or (not self._is_admin(portal) and not self.status.config["teamsCanEditOwnName"]):
            raise StateActionError("forbidden", "不能修改该队伍名称", 403)
        name = payload.get("name")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
            raise StateActionError("invalid_team_name", "队伍名称无效")
        self.status.config["teamNames"][side] = name.strip()
        self.status.match["teams"][side]["name"] = name.strip()
        code = "A" if side == "left" else "B"
        self.runtime.presence[code]["nameConfirmed"] = True
        self._publish(self.status.phase["type"], None, None, {})

    def _action_ready(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("waiting_ready")
        side = self._side(portal, payload)
        if side not in SIDES:
            raise StateActionError("forbidden", "只有队伍可以准备", 403)
        ready = payload.get("ready", True)
        if ready is not True:
            raise StateActionError("ready_cannot_be_revoked", "准备后不能撤销", 409)
        code = "A" if side == "left" else "B"
        self.runtime.presence[code]["ready"] = True
        if self.status.config["startPolicy"] == "auto_when_both_ready" and all(self.runtime.presence[c]["ready"] for c in ("A", "B")):
            self._start_match()

    def _action_start(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        self._require_phase("waiting_ready")
        if payload.get("force") is not True and not all(self.runtime.presence[c]["ready"] for c in ("A", "B")):
            raise StateActionError("teams_not_ready", "双方尚未准备", 409)
        self._start_match()

    def _start_match(self) -> None:
        self._publish("pre_start_rest", 0, "both", {})
        if self.runtime.totalTimeMs == 0:
            self._begin_first_map()

    def _begin_first_map(self) -> None:
        config = self.status.config
        map_config = config["map"]
        if map_config["selectionPolicy"] == "fixed_map_order" or map_config["fixedFirstMapEnabled"]:
            fixed = map_config["fixedMapOrder"]
            if map_config["selectionPolicy"] == "fixed_map_order" and not fixed:
                self._enter_admin_decision("series_winner", {"reason": "fixed_map_order_exhausted"})
                return
            map_id = fixed[0] if map_config["selectionPolicy"] == "fixed_map_order" else map_config["fixedFirstMapId"]
            self._select_map(None, map_id)
        else:
            picker = self._priority_side_or_publish(0, "map_picker")
            if picker is not None:
                self.status.match["decisions"]["firstMapPickerSide"] = picker
                self._publish("map_pick", 0, picker, self._map_phase_data(0))

    def _priority_side_or_publish(self, map_index: int, purpose: str) -> str | None:
        decisions = self.status.match["decisions"]
        if map_index > 0:
            for previous in reversed(self.status.match["maps"][:map_index]):
                winner = previous.get("winnerSide")
                if winner in SIDES:
                    policy = self.status.config["map"]["subsequentPriorityPolicy"]
                    return winner if policy == "previous_winner" else other_side(winner)
        initial = decisions.get("initialPrioritySide")
        if initial in SIDES:
            return initial
        policy = self.status.config["map"]["initialPriorityPolicy"]
        if policy == "interactive_random":
            self._publish("interactive_random", map_index, "both", {"purpose": purpose})
            return None
        initial = secrets.choice(list(SIDES)) if policy == "system_random" else policy
        decisions["initialPrioritySide"] = initial
        return initial

    def _action_interactive_random(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("interactive_random")
        side = self._require_actor(portal, payload)
        value = payload.get("value")
        if value not in {0, 1}:
            raise StateActionError("invalid_random_value", "随机值必须是 0 或 1")
        assert self.runtime.interactiveRandom is not None
        if self.runtime.interactiveRandom[side] is not None:
            raise StateActionError("already_submitted", "本方已经提交", 409)
        self.runtime.interactiveRandom[side] = value
        if all(self.runtime.interactiveRandom[candidate] is not None for candidate in SIDES):
            self._resolve_interactive_random()

    def _resolve_interactive_random(self, timeout_summary: str = "") -> None:
        assert self.runtime.interactiveRandom is not None
        result = "left" if self.runtime.interactiveRandom["left"] == self.runtime.interactiveRandom["right"] else "right"
        self.runtime.interactiveRandomResult = {
            "left": self.runtime.interactiveRandom["left"],
            "right": self.runtime.interactiveRandom["right"],
            "resultSide": result,
        }
        self.runtime.totalTimeMs = INTERACTIVE_RANDOM_RESULT_SECONDS * 1000
        self.runtime.remainingTimeMs = self.runtime.totalTimeMs
        self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs
        purpose = self.status.phase["data"].get("purpose")
        right_label = (
            "首次选图权"
            if purpose == "map_picker"
            else "禁用首次先手权"
            if purpose == "opening_ban"
            else "攻防选择权"
        )
        self._append_notification("INTERACTIVE_RANDOM_RESULT", None, {
            "left": self.runtime.interactiveRandomResult["left"],
            "right": self.runtime.interactiveRandomResult["right"],
            "result": (
                int(self.runtime.interactiveRandomResult["left"])
                ^ int(self.runtime.interactiveRandomResult["right"])
            ),
            "resultSide": result,
            "teamName": self._team_name(result),
            "rightLabel": right_label,
            "timeoutSummary": timeout_summary,
        })

    def _continue_interactive_random(self) -> None:
        assert self.runtime.interactiveRandomResult is not None
        result = self.runtime.interactiveRandomResult["resultSide"]
        purpose = self.status.phase["data"]["purpose"]
        map_index = self.status.phase["mapIndex"]
        if purpose == "map_picker":
            self.status.match["decisions"]["initialPrioritySide"] = result
            self.status.match["decisions"]["firstMapPickerSide"] = result
            self._publish("map_pick", map_index, result, self._map_phase_data(map_index))
        elif purpose == "side_choice":
            self.status.match["decisions"]["initialPrioritySide"] = result
            chooser = result if self.status.config["sideChoice"]["chooserRelation"] == "priority" else other_side(result)
            self._enter_side_pick(map_index, chooser)
        elif purpose == "ban_advantage":
            self.status.match["decisions"]["initialPrioritySide"] = result
            self._enter_ban_from_priority(map_index, result)

    def _map_phase_data(self, map_index: int) -> dict[str, Any]:
        modes = sorted({mode for mode, _map_id in self._legal_maps(map_index)})
        return {"allowedModeIds": modes} if modes else {}

    def _legal_maps(self, map_index: int) -> list[tuple[str, str]]:
        config = self.status.config
        used = {item["mapId"] for item in self.status.match["maps"] if item["mapId"]}
        map_config = config["map"]
        candidates = [(mode, map_id) for mode, maps in map_config["mapPool"].items() for map_id in maps if map_id not in used]
        selection = map_config["selectionPolicy"]
        if selection == "first_mode_then_unique_mode" and map_index == 0:
            candidates = [item for item in candidates if item[0] == map_config["firstMapMode"]]
        elif selection == "strict_mode_order" and map_config["modeOrder"]:
            required = map_config["modeOrder"][map_index % len(map_config["modeOrder"])]
            candidates = [item for item in candidates if item[0] == required]
        elif selection in {"unique_mode_until_cycle", "first_mode_then_unique_mode"}:
            used_modes = {item["modeId"] for item in self.status.match["maps"] if item["modeId"]}
            all_modes = set(map_config["mapPool"])
            remaining_modes = all_modes - used_modes
            if remaining_modes:
                candidates = [item for item in candidates if item[0] in remaining_modes]
        return candidates

    def _action_map_select(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("map_pick")
        side = self._require_actor(portal, payload)
        map_id = stable_id(payload.get("mapId"))
        legal = self._legal_maps(self.status.phase["mapIndex"])
        match = next((item for item in legal if item[1] == map_id), None)
        if match is None:
            raise StateActionError("illegal_map", "该地图当前不可选择")
        self._select_map(side, match)

    def _select_map(self, picker: str | None, selection: str | tuple[str, str], map_index: int | None = None) -> None:
        index = int(self.status.phase.get("mapIndex") or 0) if map_index is None else map_index
        if isinstance(selection, tuple):
            mode_id, map_id = selection
        else:
            map_id = stable_id(selection)
            mode_id = next((mode for mode, maps in self.status.config["map"]["mapPool"].items() if map_id in maps), "unknown")
        item = self.status.match["maps"][index]
        item.update({"status": "selected", "mapId": map_id, "modeId": mode_id, "pickerSide": picker})
        if index == 0 and picker in SIDES:
            self.status.match["decisions"]["firstMapPickerSide"] = picker
        phase_before_chooser = self.status.phase["phaseId"]
        chooser = self._side_chooser(index, picker)
        if self.status.phase["phaseId"] != phase_before_chooser:
            return
        if chooser is None:
            self._after_side_pick(index)
        else:
            self._enter_side_pick(index, chooser)

    def _side_chooser(self, index: int, picker: str | None) -> str | None:
        side_config = self.status.config["sideChoice"]
        current = self.status.match["maps"][index]
        capability = self.status.config.get("_mapCapabilities", {}).get(current.get("mapId"), "none")
        should_skip = (
            capability == "none"
            or (capability == "red_blue" and not side_config["symmetricSideChoiceEnabled"])
            or (index == 0 and not side_config["firstMapSideChoiceEnabled"])
        )
        if should_skip:
            current["sideChoice"] = {
                "kind": "color" if capability == "red_blue" else capability,
                "chooserSide": "left",
                "selectedSide": "left",
                "automatic": True,
            }
            return None
        priority = self._priority_side_or_publish(index, "side_choice")
        if priority is None:
            return None
        return priority if side_config["chooserRelation"] == "priority" else other_side(priority)

    def _enter_side_pick(self, index: int, chooser: str) -> None:
        map_id = self.status.match["maps"][index].get("mapId")
        capability = self.status.config.get("_mapCapabilities", {}).get(map_id, "none")
        kind = "color" if capability == "red_blue" else capability
        if index == 0:
            self.status.match["decisions"]["firstMapSidePickerSide"] = chooser
        self._publish("side_pick", index, chooser, {"choiceKind": kind, "chooserSide": chooser})

    def _action_side_select(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("side_pick")
        chooser = self._require_actor(portal, payload)
        selected = payload.get("selectedSide")
        if selected not in SIDES:
            raise StateActionError("invalid_side", "selectedSide 必须是 left 或 right")
        self._select_side(chooser, selected)

    def _select_side(self, chooser: str, selected: str) -> None:
        index = self.status.phase["mapIndex"]
        current = self.status.match["maps"][index]
        current["sideChoice"] = {
            "kind": self.status.phase["data"]["choiceKind"],
            "chooserSide": chooser,
            "selectedSide": selected,
        }
        self._after_side_pick(index)

    def _after_side_pick(self, index: int) -> None:
        if self.status.config["lineup"]["mode"] == "skip":
            self._begin_bans(index)
        else:
            self._publish("lineup_pick", index, "both", {})

    def _action_lineup_submit(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("lineup_pick")
        side = self._require_actor(portal, payload)
        lineup = payload.get("lineup")
        if not isinstance(lineup, dict):
            raise StateActionError("invalid_lineup", "lineup 必须是对象")
        slot_ids = [slot["id"] for slot in LINEUP_SLOTS]
        normalized: dict[str, str] = {}
        for slot_id in slot_ids:
            value = lineup.get(slot_id)
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > 80:
                raise StateActionError("invalid_lineup", f"阵容位 {slot_id} 无效")
            normalized[slot_id] = value.strip()
        if len(set(normalized.values())) != len(normalized):
            raise StateActionError("invalid_lineup", "同一方阵容中的选手不能重复")
        if self.status.config["lineup"]["mode"] == "preset_only":
            allowed = set(self.status.config["lineup"]["presetRosters"][side])
            if any(value not in allowed for value in normalized.values()):
                raise StateActionError("invalid_lineup", "阵容包含预设名单外成员")
        self.runtime.lineupSubmissions[side] = normalized
        if all(self.runtime.lineupSubmissions[candidate] is not None for candidate in SIDES):
            index = self.status.phase["mapIndex"]
            self.status.match["maps"][index]["lineups"] = deepcopy(self.runtime.lineupSubmissions)
            self._begin_bans(index)

    def _begin_bans(self, index: int) -> None:
        if not self.status.config["ban"]["enabled"]:
            self._publish("score_entry", index, "both", {})
            return
        priority = self._priority_side_or_publish(index, "ban_advantage")
        if priority is None:
            return
        self._enter_ban_from_priority(index, priority)

    def _enter_ban_from_priority(self, index: int, priority: str) -> None:
        config = self.status.config["ban"]
        advantage = priority if config["advantageRelation"] == "priority" else other_side(priority)
        if index == 0:
            self.status.match["decisions"]["openingBanSide"] = advantage
        if config["orderPolicy"] == "advantage_must_first":
            self.status.match["maps"][index]["bans"]["firstBanSide"] = advantage
            self._publish("ban_first", index, advantage, {"firstBanSide": advantage, "advantageSide": advantage})
        else:
            self._publish("ban_order", index, advantage, {"chooserSide": advantage, "advantageSide": advantage})

    def _action_ban_order(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("ban_order")
        chooser = self._require_actor(portal, payload)
        choice = payload.get("choice")
        if choice not in {"first", "second"}:
            raise StateActionError("invalid_ban_order", "choice 必须是 first 或 second")
        self._choose_ban_order(chooser, choice)

    def _choose_ban_order(self, chooser: str, choice: str) -> None:
        first = chooser if choice == "first" else other_side(chooser)
        index = self.status.phase["mapIndex"]
        self.status.match["maps"][index]["bans"]["firstBanSide"] = first
        self._publish("ban_first", index, first, {"firstBanSide": first})

    def _hero_role(self, hero_id: str | None) -> str | None:
        if not hero_id:
            return None
        return next((role for role, heroes in self.status.config["_heroPool"].items() if hero_id in heroes), None)

    def _legal_heroes(self, side: str | None = None) -> list[str]:
        pool = [hero for heroes in self.status.config["_heroPool"].values() for hero in heroes]
        index = self.status.phase["mapIndex"]
        bans = self.status.match["maps"][index]["bans"]
        used = {bans["leftHeroId"], bans["rightHeroId"]}
        series_used = {
            item["bans"].get(f"{side}HeroId")
            for item in self.status.match["maps"][:index]
        } if side in SIDES else set()
        blocked_role = None
        if self.status.phase["type"] == "ban_second":
            first_side = bans["firstBanSide"]
            blocked_role = self._hero_role(bans.get(f"{first_side}HeroId"))
        return [
            hero for hero in pool
            if hero not in used and hero not in series_used and self._hero_role(hero) != blocked_role
        ]

    def _action_hero_ban(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("ban_first", "ban_second")
        side = self._require_actor(portal, payload)
        hero = catalog_hero_id(payload.get("heroId"))
        if hero not in self._legal_heroes(side):
            raise StateActionError("illegal_hero", "该英雄当前不可 Ban")
        self._select_hero_ban(side, hero)

    def _select_hero_ban(self, side: str, hero: str) -> None:
        index = self.status.phase["mapIndex"]
        bans = self.status.match["maps"][index]["bans"]
        bans[f"{side}HeroId"] = hero
        first = bans["firstBanSide"]
        if self.status.phase["type"] == "ban_first":
            self._publish("ban_second", index, other_side(first), {"firstBanSide": first})
        else:
            self._publish("score_entry", index, "both", {})

    def _action_score_submit(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("score_entry")
        score = self._validate_score(payload.get("score"))
        if self._is_admin(portal):
            self._commit_score(score)
            return
        side = self._require_actor(portal, payload)
        self._end_team_pause(side)
        map_index = self.status.phase["mapIndex"]
        self._publish("score_confirmation", map_index, other_side(side), {"submittedBy": side, "score": score})
        self.runtime.scoreProposal = {"submittedBy": side, "score": score, "rejectedBy": None}

    def _validate_score(self, value: Any) -> dict[str, int]:
        if not isinstance(value, dict):
            raise StateActionError("invalid_score", "score 必须是对象")
        result: dict[str, int] = {}
        for side in SIDES:
            number = value.get(side)
            if isinstance(number, bool) or not isinstance(number, int) or not 0 <= number <= 99:
                raise StateActionError("invalid_score", "比分必须是 0 到 99 的整数")
            result[side] = number
        return result

    def _action_score_confirm(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("score_confirmation")
        proposal = self.runtime.scoreProposal
        if proposal is None:
            raise StateActionError("no_score_proposal", "没有待确认比分", 409)
        side = self._side(portal, payload)
        if not self._is_admin(portal) and side == proposal["submittedBy"]:
            raise StateActionError("forbidden", "提交方不能确认自己的比分", 403)
        if side in SIDES:
            self._end_team_pause(side)
        self._commit_score(proposal["score"])

    def _action_score_reject(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("score_confirmation")
        proposal = self.runtime.scoreProposal
        if proposal is None:
            raise StateActionError("no_score_proposal", "没有待确认比分", 409)
        side = self._side(portal, payload)
        if not self._is_admin(portal) and side == proposal["submittedBy"]:
            raise StateActionError("forbidden", "提交方不能拒绝自己的比分", 403)
        if side in SIDES:
            self._end_team_pause(side)
        proposal["rejectedBy"] = side
        self._enter_admin_decision("score_dispute", {
            "mapIndex": self.status.phase["mapIndex"],
            "proposal": deepcopy(proposal),
        })

    def _commit_score(self, score: dict[str, int]) -> None:
        index = self.status.phase["mapIndex"]
        current = self.status.match["maps"][index]
        current["score"] = deepcopy(score)
        current["resultType"] = "score"
        current["status"] = "completed"
        winner = "left" if score["left"] > score["right"] else "right" if score["right"] > score["left"] else None
        current["winnerSide"] = winner
        if winner:
            self.status.match["teams"][winner]["seriesScore"] += 1
        self._after_map_result(index)

    def _after_map_result(self, index: int) -> None:
        winner = next((side for side in SIDES if self.status.match["teams"][side]["seriesScore"] >= MATCH_WINS[self.status.config["matchFormat"]]), None)
        if winner:
            self.status.match["winnerSide"] = winner
            self._publish("completed", None, None, {"winnerSide": winner})
        else:
            self._publish("post_map_rest", index, "both", {})

    def _action_rest_skip(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("pre_start_rest", "post_map_rest")
        pre_start = self.status.phase["type"] == "pre_start_rest"
        if self._is_admin(portal):
            self.runtime.restSkip = {"left": True, "right": True}
            if pre_start:
                self._begin_first_map()
            else:
                self._begin_next_map(self.status.phase["mapIndex"] + 1)
            return
        side = self._require_actor(portal, payload)
        self.runtime.restSkip[side] = True
        if all(self.runtime.restSkip.values()):
            if pre_start:
                self._begin_first_map()
            else:
                self._begin_next_map(self.status.phase["mapIndex"] + 1)

    def _begin_next_map(self, index: int) -> None:
        if index >= len(self.status.match["maps"]):
            self._enter_admin_decision("series_winner", {"reason": "map_slots_exhausted"})
            return
        map_config = self.status.config["map"]
        if map_config["selectionPolicy"] == "fixed_map_order":
            fixed = map_config["fixedMapOrder"]
            if index >= len(fixed):
                self._enter_admin_decision("series_winner", {"reason": "fixed_map_order_exhausted"})
                return
            self._select_map(None, fixed[index], index)
        else:
            picker = self._priority_side_or_publish(index, "map_picker")
            if picker is None:
                return
            if not self._legal_maps(index):
                self._enter_admin_decision("series_winner", {"reason": "no_legal_map"})
                return
            self._publish("map_pick", index, picker, self._map_phase_data(index))

    def _action_global_pause(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        if not self.status.config["pause"]["globalPauseEnabled"]:
            raise StateActionError("feature_disabled", "当前配置未启用全局暂停", 409)
        active = payload.get("active")
        if not isinstance(active, bool):
            raise StateActionError("invalid_pause", "active 必须是布尔值")
        current = self.runtime.pause["global"]["active"]
        if active == current:
            return
        now = self.now_ms()
        self._refresh_runtime()
        if active:
            self._suspend_score_pauses_for_global(now)
            self.runtime.pause["global"]["active"] = True
            self._global_pause_started_ms = now
        else:
            elapsed = now - int(self._global_pause_started_ms or now)
            self.runtime.pause["global"]["totalMs"] += elapsed
            if self._deadline_ms is not None:
                self._deadline_ms += elapsed
            self._global_pause_started_ms = None
            self.runtime.pause["global"]["active"] = False
            self._resume_score_pauses_after_global(now)

    def _suspend_score_pauses_for_global(self, now: int) -> None:
        active_sides = [
            side
            for side in SIDES
            if self.runtime.pause["scoreTeams"][side]["active"]
        ]
        if not active_sides:
            return
        for side in active_sides:
            started = self._score_team_pause_started[side]
            if started is not None:
                elapsed = max(0, now - started)
                state = self.runtime.pause["scoreTeams"][side]
                state["phaseTotalMs"] += elapsed
                state["matchTotalMs"] += elapsed
                self._score_team_pause_current_ms[side] += elapsed
            self._score_team_pause_started[side] = None
        if self._score_pause_started_ms is not None:
            frozen = max(0, now - self._score_pause_started_ms)
            if self._deadline_ms is not None:
                self._deadline_ms += frozen
            self._score_pause_started_ms = None

    def _resume_score_pauses_after_global(self, now: int) -> None:
        active_sides = [
            side
            for side in SIDES
            if self.runtime.pause["scoreTeams"][side]["active"]
        ]
        if not active_sides:
            return
        for side in active_sides:
            self._score_team_pause_started[side] = now
        self._score_pause_started_ms = now

    def _action_score_pause(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("score_entry", "score_confirmation")
        if not self.status.config["pause"]["teamPauseEnabled"]:
            raise StateActionError("feature_disabled", "当前配置未启用队伍暂停", 409)
        side = self._side(portal, payload)
        if side not in SIDES:
            raise StateActionError("forbidden", "只有队伍可以控制队伍暂停", 403)
        active = payload.get("active")
        if not isinstance(active, bool):
            raise StateActionError("invalid_pause", "active 必须是布尔值")
        state = self.runtime.pause["scoreTeams"][side]
        now = self.now_ms()
        self._refresh_runtime()
        if active == state["active"]:
            return
        any_before = any(self.runtime.pause["scoreTeams"][candidate]["active"] for candidate in SIDES)
        if active:
            max_count = self.status.config["pause"]["teamPauseMaxCountPerMap"]
            if max_count is not None and state["count"] >= max_count:
                raise StateActionError("pause_limit_reached", "本张地图的队伍暂停次数已用完", 409)
            max_total = self.status.config["pause"]["teamPauseMaxTotalSeconds"]
            if max_total is not None and state["phaseTotalMs"] >= int(max_total) * 1000:
                raise StateActionError("pause_limit_reached", "本张地图的队伍累计暂停时间已用完", 409)
            state["active"] = True
            state["count"] += 1
            self._score_team_pause_started[side] = now
            self._score_team_pause_current_ms[side] = 0
            if not any_before:
                self._score_pause_started_ms = now
        else:
            self._end_team_pause(side, end_at=now)

    def _end_team_pause(self, side: str, *, end_at: int | None = None, automatic: bool = False) -> None:
        state = self.runtime.pause["scoreTeams"][side]
        if not state["active"]:
            return
        now = self.now_ms() if end_at is None else end_at
        started = self._score_team_pause_started[side]
        elapsed = max(0, now - started) if started is not None else 0
        state["active"] = False
        state["phaseTotalMs"] += elapsed
        state["matchTotalMs"] += elapsed
        self._score_team_pause_started[side] = None
        total_current_ms = self._score_team_pause_current_ms[side] + elapsed
        self._score_team_pause_current_ms[side] = 0
        if not any(self.runtime.pause["scoreTeams"][candidate]["active"] for candidate in SIDES):
            frozen = max(0, now - int(self._score_pause_started_ms or now))
            if self._deadline_ms is not None:
                self._deadline_ms += frozen
            self._score_pause_started_ms = None
        if automatic:
            self._append_notification("TEAM_PAUSE_AUTO_ENDED", None, {
                "side": side,
                "teamName": self._team_name(side),
                "seconds": total_current_ms // 1000,
            })

    def _action_timeout_resolve(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        self._require_phase("admin_decision")
        if not self.runtime.awaitingAdminDecision:
            raise StateActionError("not_waiting_admin", "当前没有等待管理员裁定", 409)
        resolution = payload.get("resolution")
        decision = self.status.phase["data"]
        source = decision.get("sourcePhase") if isinstance(decision.get("sourcePhase"), dict) else None
        source_type = source.get("type") if source else None
        allowed_resolutions = {
            "map_pick": {"retry", "extend", "extend_30", "select_map", "forfeit"},
            "side_pick": {"retry", "extend", "extend_30", "select_side", "forfeit"},
            "lineup_pick": {"retry", "extend", "extend_30", "submit_lineup", "forfeit"},
            "ban_order": {"retry", "extend", "extend_30", "select_ban_order", "forfeit"},
            "ban_first": {"retry", "extend", "extend_30", "select_hero", "random_legal_hero", "forfeit"},
            "ban_second": {"retry", "extend", "extend_30", "select_hero", "random_legal_hero", "forfeit"},
            "interactive_random": {"retry", "extend", "extend_30", "submit_interactive_random"},
            "score_confirmation": {"approve_score", "replace_score"},
        }.get(source_type, set())
        if decision.get("decisionKind") == "series_winner":
            allowed_resolutions = {"series_winner"}
        if resolution not in allowed_resolutions:
            raise StateActionError("invalid_resolution", "该裁定类型不支持此处理方式")
        if resolution in {"retry", "extend", "extend_30"} and source:
            saved_lineups = deepcopy(self._admin_decision_private.get("lineupSubmissions"))
            saved_random = deepcopy(self._admin_decision_private.get("interactiveRandom"))
            self._publish(source["type"], source.get("mapIndex"), source.get("actorSide"), source.get("data", {}))
            if isinstance(saved_lineups, dict):
                self.runtime.lineupSubmissions = saved_lineups
            if isinstance(saved_random, dict):
                self.runtime.interactiveRandom = saved_random
            if resolution in {"extend", "extend_30"}:
                seconds = int(self.status.config["timing"]["timeoutExtensionSeconds"])
                self.runtime.totalTimeMs = seconds * 1000
                self.runtime.remainingTimeMs = self.runtime.totalTimeMs
                self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs
        elif resolution == "forfeit":
            loser = payload.get("loserSide")
            if loser not in SIDES:
                raise StateActionError("invalid_side", "必须指定 loserSide")
            self._forfeit_current_map(loser, "admin_ruling")
        elif resolution in {"approve_score", "replace_score"}:
            proposal = decision.get("proposal") if isinstance(decision.get("proposal"), dict) else {}
            score = self._validate_score(payload.get("score") if resolution == "replace_score" else proposal.get("score"))
            self._commit_score(score)
        elif resolution == "select_map" and source and source.get("type") == "map_pick":
            map_index = source.get("mapIndex")
            map_id = stable_id(payload.get("mapId"))
            legal = self._legal_maps(map_index) if isinstance(map_index, int) else []
            selection = next((candidate for candidate in legal if candidate[1] == map_id), None)
            if selection is None:
                raise StateActionError("illegal_map", "管理员选择的地图当前不合法")
            picker = source.get("actorSide") if source.get("actorSide") in SIDES else None
            self._select_map(picker, selection, map_index)
        elif resolution == "select_side" and source and source.get("type") == "side_pick":
            selected = payload.get("selectedSide")
            chooser = source.get("actorSide")
            if selected not in SIDES or chooser not in SIDES:
                raise StateActionError("invalid_side", "管理员必须选择合法阵营")
            self.status.phase = deepcopy(source)
            self._select_side(chooser, selected)
        elif resolution == "select_ban_order" and source and source.get("type") == "ban_order":
            chooser = source.get("actorSide")
            choice = payload.get("choice")
            if chooser not in SIDES or choice not in {"first", "second"}:
                raise StateActionError("invalid_ban_order", "管理员必须选择合法 Ban 顺序")
            self.status.phase = deepcopy(source)
            self._choose_ban_order(chooser, choice)
        elif resolution == "submit_lineup" and source and source.get("type") == "lineup_pick":
            self._publish("lineup_pick", source.get("mapIndex"), "both", source.get("data", {}))
            saved = self._admin_decision_private.get("lineupSubmissions")
            if isinstance(saved, dict):
                self.runtime.lineupSubmissions = deepcopy(saved)
            submitted = payload.get("lineups")
            if isinstance(submitted, dict):
                pending = [side for side in SIDES if self.runtime.lineupSubmissions.get(side) is None]
                if not pending or any(not isinstance(submitted.get(side), dict) for side in pending):
                    raise StateActionError("invalid_lineup", "管理员必须填写所有缺失方的阵容")
                for side in pending:
                    self._action_lineup_submit("C", {"side": side, "lineup": submitted[side]})
            else:
                self._action_lineup_submit("C", payload)
        elif resolution == "submit_interactive_random" and source and source.get("type") == "interactive_random":
            saved = self._admin_decision_private.get("interactiveRandom")
            if not isinstance(saved, dict):
                raise StateActionError("invalid_random_state", "交互随机裁定缺少原始提交状态", 409)
            values = payload.get("values")
            if not isinstance(values, dict):
                raise StateActionError("invalid_random_value", "管理员必须补齐未提交方的随机值")
            missing = [side for side in SIDES if saved.get(side) not in {0, 1}]
            if any(values.get(side) not in {0, 1} for side in missing):
                raise StateActionError("invalid_random_value", "管理员必须为所有未提交方选择 0 或 1")
            self._publish(source["type"], source.get("mapIndex"), source.get("actorSide"), source.get("data", {}))
            assert self.runtime.interactiveRandom is not None
            self.runtime.interactiveRandom = {
                side: saved.get(side) if saved.get(side) in {0, 1} else values[side]
                for side in SIDES
            }
            self._resolve_interactive_random("管理员已补齐未提交的交互随机值")
        elif resolution == "series_winner":
            winner = payload.get("winnerSide")
            if winner not in SIDES:
                raise StateActionError("invalid_side", "必须指定 winnerSide")
            self.status.match["winnerSide"] = winner
            self._publish("completed", None, None, {"winnerSide": winner, "decidedByAdmin": True})
        elif resolution in {"select_hero", "random_legal_hero"} and source:
            actor = source.get("actorSide")
            admin_phase = self.status.phase
            self.status.phase = deepcopy(source)
            heroes = self._legal_heroes(actor)
            self.status.phase = admin_phase
            if not heroes:
                raise StateActionError("no_legal_hero", "当前没有合法英雄候选", 409)
            hero = catalog_hero_id(payload.get("heroId")) if resolution == "select_hero" else secrets.choice(heroes)
            if actor not in SIDES or hero not in heroes:
                raise StateActionError("illegal_hero", "管理员选择的英雄不合法")
            self.status.phase = deepcopy(source)
            self._select_hero_ban(actor, hero)
        else:
            raise StateActionError("invalid_resolution", "不支持该裁定")
        self._admin_decision_private = {}

    def _action_map_forfeit(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        loser = payload.get("loserSide")
        if loser not in SIDES:
            raise StateActionError("invalid_side", "必须指定 loserSide")
        reason = payload.get("reason") if payload.get("reason") in {
            "map_timeout", "lineup_timeout", "ban_timeout", "rule_violation", "admin_ruling"
        } else "admin_ruling"
        self._forfeit_current_map(loser, reason)

    def _forfeit_current_map(self, loser: str, reason: str) -> None:
        index = self.status.phase["mapIndex"]
        if index is None:
            raise StateActionError("invalid_phase", "当前没有可判负地图", 409)
        before_status = self.status.to_dict()
        winner = other_side(loser)
        current = self.status.match["maps"][index]
        current.update({
            "status": "forfeited",
            "score": None,
            "resultType": "forfeit",
            "winnerSide": winner,
            "forfeitSide": loser,
            "forfeitReason": reason,
        })
        self.status.match["teams"][winner]["seriesScore"] += 1
        self._after_map_result(index)
        self._append_notification("MAP_FORFEITED", None, {
            "mapIndex": index,
            "loserSide": loser,
            "loserTeam": self._team_name(loser),
            "selectionType": self._business_stage_label(before_status["phase"]),
            "reason": reason,
        })
        self._record_map_result_notifications(before_status)


class RoomStateRegistry:
    def __init__(self) -> None:
        self._sessions: dict[str, RoomSession] = {}
        self._tokens: dict[str, tuple[str, str]] = {}
        self._lock = threading.RLock()

    def create(
        self,
        room_id: str,
        tokens: dict[str, str],
        config: dict[str, Any],
        catalog_hash: str = "",
        hero_pool: dict[str, list[str]] | None = None,
        map_capabilities: dict[str, str] | None = None,
    ) -> RoomSession:
        with self._lock:
            session = RoomSession.create(room_id, config, catalog_hash, hero_pool, map_capabilities)
            self._sessions[room_id] = session
            for portal, token in tokens.items():
                self._tokens[token] = (room_id, portal)
            return session

    def resolve(self, token: str) -> tuple[RoomSession, str] | None:
        with self._lock:
            indexed = self._tokens.get(token)
            if indexed is None:
                return None
            session = self._sessions.get(indexed[0])
            return (session, indexed[1]) if session else None

    def get(self, room_id: str) -> RoomSession | None:
        with self._lock:
            return self._sessions.get(room_id)

    def remove(self, room_id: str) -> None:
        with self._lock:
            self._sessions.pop(room_id, None)
            self._tokens = {token: value for token, value in self._tokens.items() if value[0] != room_id}

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()
            self._tokens.clear()
