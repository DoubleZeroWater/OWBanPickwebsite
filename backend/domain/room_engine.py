from __future__ import annotations

import threading
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Callable

from .phases.timeout import TimeoutPhaseMixin
from .phases.preparation import PreparationPhaseMixin
from .phases.map_selection import MapSelectionPhaseMixin
from .phases.lineup_ban import LineupBanPhaseMixin
from .phases.score import ScorePhaseMixin
from .phases.pause import PausePhaseMixin
from .phases.rulings import RulingPhaseMixin
from .notifications import NotificationMixin

from .constants import INTERACTIVE_RANDOM_RESULT_SECONDS, LINEUP_SLOTS, PHASE_LIMITS
from .contracts import (
    ClientCheck,
    CommandContext,
    CommandPayload,
    HeroPool,
    JsonObject,
    MapCapabilities,
    MatchConfig,
    NotificationEvent,
    PortalCode,
    RoomStatusData,
    Side,
    StatusRef,
)
from .errors import StateActionError
from .state_models import (
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


@dataclass
class RoomSession(NotificationMixin, TimeoutPhaseMixin, PreparationPhaseMixin, MapSelectionPhaseMixin, LineupBanPhaseMixin, ScorePhaseMixin, PausePhaseMixin, RulingPhaseMixin):
    room_id: str
    status: RoomStatus
    runtime: RoomRuntime
    status_history: list[RoomStatusData] = field(default_factory=list)
    processed_requests: dict[str, JsonObject] = field(default_factory=dict)
    notification_events: list[NotificationEvent] = field(default_factory=list)
    notification_sequence: int = 0
    lock: threading.RLock = field(default_factory=threading.RLock)
    now_ms: Callable[[], int] = field(default=lambda: int(time.time() * 1000), repr=False)
    _deadline_ms: int | None = None
    _global_pause_started_ms: int | None = None
    _score_pause_started_ms: int | None = None
    _score_team_pause_started: dict[Side, int | None] = field(default_factory=lambda: {"left": None, "right": None})
    _score_team_pause_current_ms: dict[Side, int] = field(default_factory=lambda: {"left": 0, "right": 0})
    _runtime_fingerprint: str = ""
    _admin_decision_private: JsonObject = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        room_id: str,
        config: MatchConfig | None = None,
        catalog_hash: str = "",
        hero_pool: HeroPool | None = None,
        map_capabilities: MapCapabilities | None = None,
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
        client: ClientCheck | None = None,
        notification_cursor: int | None = None,
        *,
        force_full: bool = False,
        portal_code: PortalCode | None = None,
    ) -> JsonObject:
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
            result: JsonObject = {
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

    def _board_segment(self) -> JsonObject:
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

    def _facts_segment(self) -> JsonObject:
        facts = {
            "epoch": self.status.epoch,
            "revision": self.status.revision,
            "lifecycle": self.status.lifecycle,
            "match": deepcopy(self.status.match),
        }
        facts["factsHash"] = status_hash(facts)
        return facts

    def _runtime_segments_for_portal(self, portal_code: PortalCode | None) -> tuple[JsonObject, JsonObject]:
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
        private_context: JsonObject = {
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

    def _allowed_actions(self, portal_code: PortalCode | None) -> list[str]:
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

    def _runtime_for_portal(self, portal_code: PortalCode | None) -> JsonObject:
        runtime, private_context = self._runtime_segments_for_portal(portal_code)
        runtime["presence"] = deepcopy(self.runtime.presence)
        runtime["lineupSubmissions"] = private_context["lineupSubmissions"]
        if "interactiveRandom" in private_context:
            runtime["interactiveRandom"] = private_context["interactiveRandom"]
        return runtime

    def status_ref(self) -> StatusRef:
        return {
            "epoch": self.status.epoch,
            "revision": self.status.revision,
            "hash": self.status.hash,
            "phaseId": self.status.phase["phaseId"],
            "runtimeId": self.runtime.runtimeId,
        }

    def heartbeat(
        self,
        portal_code: PortalCode,
        client: ClientCheck | None = None,
        notification_cursor: int | None = None,
    ) -> JsonObject:
        with self.lock:
            if portal_code not in PORTAL_ROLES:
                raise StateActionError("forbidden", "未知入口", 403)
            entry = self.runtime.presence.setdefault(portal_code, {"ready": False, "nameConfirmed": False})
            entry["lastSeenAt"] = self.now_ms()
            entry["connected"] = True
            return self.response(client, notification_cursor, portal_code=portal_code)

    def history_summary(self) -> list[JsonObject]:
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

    def _is_legal_checkpoint(self, item: RoomStatusData) -> bool:
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

    def _notification_stream(self, cursor: int | None) -> JsonObject:
        if cursor is None:
            events: list[JsonObject] = []
        else:
            safe_cursor = max(0, int(cursor))
            events = [
                deepcopy(event)
                for event in self.notification_events
                if int(event["sequence"]) > safe_cursor
            ]
        return {"cursor": self.notification_sequence, "events": events}

    def has_live_presence(self) -> bool:
        with self.lock:
            self._refresh_runtime()
            return any(bool(entry.get("connected")) for entry in self.runtime.presence.values())

    def update_config(self, value: object) -> JsonObject:
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
        portal_code: PortalCode,
        action_type: str,
        payload: CommandPayload,
        expected: CommandContext | None,
        request_id: str,
        notification_cursor: int | None = None,
    ) -> JsonObject:
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

    def rollback(self, revision: int, notification_cursor: int | None = None) -> JsonObject:
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

    def _validate_command_context(self, expected: CommandContext | None) -> None:
        if not isinstance(expected, dict):
            raise StateActionError("missing_command_context", "命令缺少状态核对信息", 409)
        if expected.get("epoch") != self.status.epoch:
            raise StateActionError("stale_epoch", "命令属于旧比赛分支", 409)
        if expected.get("phaseId") != self.status.phase["phaseId"]:
            raise StateActionError("stale_phase", "命令属于旧业务阶段", 409)
        if expected.get("runtimeId") != self.runtime.runtimeId:
            raise StateActionError("stale_runtime", "命令属于旧计时运行实例", 409)

    def _is_admin(self, portal_code: PortalCode) -> bool:
        return portal_code == "C"

    def _side(self, portal_code: PortalCode, payload: CommandPayload | None = None) -> Side | None:
        side = PORTAL_SIDES[portal_code]
        if side is None and portal_code == "C" and payload:
            requested = payload.get("side")
            if requested in SIDES:
                side = requested
        return side

    def _require_admin(self, portal_code: PortalCode) -> None:
        if not self._is_admin(portal_code):
            raise StateActionError("forbidden", "仅管理员可以执行此操作", 403)

    def _require_phase(self, *phases: str) -> None:
        if self.status.phase["type"] not in phases:
            raise StateActionError("invalid_phase", f"当前阶段不能执行此操作：{self.status.phase['type']}", 409)

    def _require_actor(self, portal_code: PortalCode, payload: CommandPayload | None = None) -> Side:
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

    def _publish(self, phase_type: str, map_index: int | None, actor: str | None, data: JsonObject) -> None:
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

    def _enter_admin_decision(self, decision_kind: str, data: JsonObject | None = None) -> None:
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


class RoomStateRegistry:
    def __init__(self) -> None:
        self._sessions: dict[str, RoomSession] = {}
        self._tokens: dict[str, tuple[str, str]] = {}
        self._lock = threading.RLock()

    def create(
        self,
        room_id: str,
        tokens: dict[PortalCode, str],
        config: MatchConfig,
        catalog_hash: str = "",
        hero_pool: HeroPool | None = None,
        map_capabilities: MapCapabilities | None = None,
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
