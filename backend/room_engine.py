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
        empty_map,
        normalize_config,
        other_side,
        stable_id,
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
        empty_map,
        normalize_config,
        other_side,
        stable_id,
    )


class StateActionError(ValueError):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


PHASE_LIMITS = {
    "pre_start_rest": "preStartRestSeconds",
    "interactive_random": "mapSelectSeconds",
    "map_pick": "mapSelectSeconds",
    "side_pick": "mapSelectSeconds",
    "lineup_pick": "playerSelectSeconds",
    "ban_order": "firstBanChoiceSeconds",
    "ban_first": "firstBanActionSeconds",
    "ban_second": "secondBanActionSeconds",
    "score_entry": "scoreConfirmSeconds",
    "post_map_rest": "postMatchRestSeconds",
}
INTERACTIVE_RANDOM_RESULT_SECONDS = 5


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

    @classmethod
    def create(
        cls,
        room_id: str,
        config: dict[str, Any] | None = None,
        catalog_hash: str = "",
        now_ms: Callable[[], int] | None = None,
    ) -> "RoomSession":
        normalized = normalize_config(config or {}, accept_legacy=True)
        status = RoomStatus.initial(room_id, normalized, catalog_hash)
        runtime = RoomRuntime(status.revision, status.hash, status.phase["phaseId"])
        session = cls(room_id, status, runtime, now_ms=now_ms or (lambda: int(time.time() * 1000)))
        session.status_history.append(status.to_dict())
        session._reset_runtime_for_phase()
        return session

    def response(
        self,
        client: dict[str, Any] | None = None,
        notification_cursor: int | None = None,
        *,
        force_full: bool = False,
    ) -> dict[str, Any]:
        with self.lock:
            self._settle_timeouts()
            self._refresh_runtime()
            current = self.status.to_dict()
            notification_stream = self._notification_stream(notification_cursor)
            same = bool(client) and all(
                client.get(key) == current.get(key) for key in ("epoch", "revision", "hash")
            )
            if same and not force_full:
                return {
                    "kind": "runtime",
                    "statusRef": self.status_ref(),
                    "runtime": self.runtime.to_dict(),
                    "notificationStream": notification_stream,
                }
            return {
                "kind": "full",
                "status": current,
                "runtime": self.runtime.to_dict(),
                "notificationStream": notification_stream,
            }

    def status_ref(self) -> dict[str, Any]:
        return {
            "epoch": self.status.epoch,
            "revision": self.status.revision,
            "hash": self.status.hash,
            "phaseId": self.status.phase["phaseId"],
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
            return self.response(client, notification_cursor)

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
            ]

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

    def _business_stage_label(self, phase: dict[str, Any]) -> str:
        map_index = phase.get("mapIndex")
        prefix = f"第{int(map_index) + 1}张地图 · " if isinstance(map_index, int) else ""
        phase_type = phase.get("type")
        labels = {
            "map_pick": "选图",
            "lineup_pick": "确认上人",
            "ban_order": "确认 Ban",
            "ban_first": "确认 Ban",
            "ban_second": "确认 Ban",
            "score_entry": "录入比赛得分",
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
            self._append_notification("SIDE_CONFIRMED", portal_code, {
                "mapIndex": before_map_index,
                "teamName": self._team_name(actor_side),
                "side": actor_side,
                "selectedSide": selected,
                "choiceKind": kind,
                "choice": selected,
            })
        elif (
            action_type == "lineup_submit"
            and portal_code == "C"
            and before_phase_type == "lineup_pick"
            and self.status.phase["type"] != "lineup_pick"
        ):
            self._append_notification("LINEUP_CONFIRMED_BY_ADMIN", portal_code, {"mapIndex": before_map_index})
        elif action_type == "ban_order_select":
            choice = payload.get("choice")
            event_type = "BAN_ORDER_CONFIRMED_BY_ADMIN" if portal_code == "C" else "BAN_ORDER_CONFIRMED"
            self._append_notification(event_type, portal_code, {
                "mapIndex": before_map_index,
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "firstOrSecond": "先手" if choice == "first" else "后手",
            })
        elif action_type == "hero_ban_select":
            event_type = "HERO_BAN_CONFIRMED_BY_ADMIN" if portal_code == "C" else "HERO_BAN_CONFIRMED"
            self._append_notification(event_type, portal_code, {
                "mapIndex": before_map_index,
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "heroId": stable_id(payload.get("heroId")),
                "heroName": stable_id(payload.get("heroId")),
            })
        elif action_type == "timeout_resolve" and before_runtime.get("awaitingAdminDecision"):
            resolution = payload.get("resolution")
            summary = "延长30秒" if resolution == "extend_30" else "本张地图判负"
            self._append_notification("ADMIN_DECISION_RESOLVED", portal_code, {
                "decisionType": self._business_stage_label(before_phase),
                "decisionSummary": summary,
            })

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
            normalized = normalize_config(value)
            self.status.config = normalized
            self.status.match["teams"]["left"]["name"] = normalized["teams"]["left"]
            self.status.match["teams"]["right"]["name"] = normalized["teams"]["right"]
            expected_count = {"ft2": 5, "ft3": 7, "ft4": 9}[normalized["matchFormat"]]
            current_maps = self.status.match["maps"]
            if len(current_maps) != expected_count:
                self.status.match["maps"] = [empty_map(index) for index in range(expected_count)]
            self._publish("configuring", None, None, {})
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
            if not request_id or len(request_id) > 128:
                raise StateActionError("invalid_request_id", "requestId 缺失或过长")
            if request_id in self.processed_requests:
                return deepcopy(self.processed_requests[request_id])
            self._settle_timeouts()
            if not self._expected_matches(expected):
                raise StateActionError("stale_status", "客户端状态已过期", 409)
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
            result = self.response(notification_cursor=notification_cursor, force_full=True)
            self.processed_requests[request_id] = deepcopy(result)
            if len(self.processed_requests) > 2048:
                self.processed_requests.pop(next(iter(self.processed_requests)))
            return result

    def rollback(self, revision: int, notification_cursor: int | None = None) -> dict[str, Any]:
        with self.lock:
            if self.runtime.pause["global"]["active"]:
                raise StateActionError("global_paused", "必须先恢复全局暂停才能回退比赛", 409)
            target = next((item for item in self.status_history if item["revision"] == revision), None)
            if target is None:
                raise StateActionError("revision_not_found", "找不到目标 revision", 404)
            old_revision = self.status.revision
            restored = deepcopy(target)
            restored["epoch"] = self.status.epoch + 1
            restored["revision"] = old_revision + 1
            restored["phase"]["phaseId"] = self._phase_id(
                restored["epoch"], restored["revision"], restored["phase"]["type"]
            )
            self.status = RoomStatus(**restored)
            self.status.seal()
            self.status_history.append(self.status.to_dict())
            self.processed_requests.clear()
            self._reset_runtime_for_phase()
            self._append_notification(
                "STAGE_RESTORED",
                "C",
                {"stageLabel": self._business_stage_label(self.status.phase)},
            )
            return self.response(notification_cursor=notification_cursor, force_full=True)

    def _expected_matches(self, expected: dict[str, Any] | None) -> bool:
        if not isinstance(expected, dict):
            return False
        ref = self.status_ref()
        return all(expected.get(key) == ref[key] for key in ("epoch", "revision", "hash", "phaseId"))

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

    def _reset_runtime_for_phase(self) -> None:
        previous_presence = deepcopy(self.runtime.presence) if hasattr(self, "runtime") else {}
        match_totals = {side: 0 for side in SIDES}
        if hasattr(self, "runtime"):
            for side in SIDES:
                match_totals[side] = int(self.runtime.pause.get("scoreTeams", {}).get(side, {}).get("matchTotalMs", 0))
        self.runtime = RoomRuntime(self.status.revision, self.status.hash, self.status.phase["phaseId"])
        self.runtime.presence = previous_presence
        for code in PORTAL_ROLES:
            self.runtime.presence.setdefault(code, {"connected": False, "ready": False, "nameConfirmed": False, "lastSeenAt": 0})
        for side in SIDES:
            self.runtime.pause["scoreTeams"][side]["matchTotalMs"] = match_totals[side]
        phase = self.status.phase["type"]
        seconds = int(self.status.config["stageLimits"].get(PHASE_LIMITS.get(phase, ""), 0))
        self.runtime.totalTimeMs = max(0, seconds * 1000)
        self.runtime.remainingTimeMs = self.runtime.totalTimeMs
        self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs if phase in PHASE_LIMITS else None
        self._global_pause_started_ms = None
        self._score_pause_started_ms = None
        self._score_team_pause_started = {"left": None, "right": None}
        if phase == "interactive_random":
            self.runtime.interactiveRandom = {"left": None, "right": None}

    def _refresh_runtime(self) -> None:
        now = self.now_ms()
        for entry in self.runtime.presence.values():
            last_seen = int(entry.get("lastSeenAt") or 0)
            entry["connected"] = bool(last_seen and now - last_seen <= 5000)
        if self._deadline_ms is not None:
            if self.runtime.pause["global"]["active"] or self._score_pause_started_ms is not None:
                return
            self.runtime.remainingTimeMs = max(0, self._deadline_ms - now)

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
            for side in SIDES:
                if self.runtime.interactiveRandom[side] is None:
                    self.runtime.interactiveRandom[side] = secrets.randbelow(2)
            self._resolve_interactive_random()
        elif phase == "map_pick":
            self._timeout_policy(self.status.config["mapTimeoutPolicy"], phase)
        elif phase == "side_pick":
            chooser = self.status.phase["actorSide"]
            self._select_side(chooser, secrets.choice(list(SIDES)))
        elif phase == "lineup_pick":
            self._timeout_policy(self.status.config["lineupTimeoutPolicy"], phase)
        elif phase in {"ban_order", "ban_first", "ban_second"}:
            self._timeout_policy(self.status.config["banTimeoutPolicy"], phase)
        elif phase == "score_entry":
            if self.runtime.scoreProposal and self.status.config["scoreTimeoutPolicy"] == "auto_confirm_submitted":
                before_status = self.status.to_dict()
                self._commit_score(self.runtime.scoreProposal["score"])
                self._record_map_result_notifications(before_status)
            else:
                if not self.runtime.awaitingAdminDecision:
                    self.runtime.timedOut = True
                    self.runtime.awaitingAdminDecision = True
                    self._append_notification("SELECTION_AWAITING_ADMIN", None, {
                        "subject": "比分提交方",
                        "selectionType": "比分确认",
                    })

    def _timeout_policy(self, policy: str, phase: str) -> None:
        if policy == "warn_extend_30":
            self.runtime.timedOut = True
            self.runtime.totalTimeMs = 30000
            self.runtime.remainingTimeMs = 30000
            self._deadline_ms = self.now_ms() + 30000
            self._append_notification("SELECTION_TIMEOUT_EXTENDED", None, {
                "subject": self._team_name(self.status.phase.get("actorSide")),
                "selectionType": self._business_stage_label(self.status.phase),
                "seconds": 30,
            })
            return
        if policy == "admin_decision":
            if not self.runtime.awaitingAdminDecision:
                self.runtime.timedOut = True
                self.runtime.awaitingAdminDecision = True
                self._append_notification("SELECTION_AWAITING_ADMIN", None, {
                    "subject": self._team_name(self.status.phase.get("actorSide")) or "当前操作方",
                    "selectionType": self._business_stage_label(self.status.phase),
                })
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
        if phase in {"ban_first", "ban_second"} and policy == "random_legal_ban":
            heroes = self._legal_heroes()
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
        if phase == "ban_order" and policy == "random_legal_ban":
            chooser = actor if actor in SIDES else secrets.choice(list(SIDES))
            self._choose_ban_order(chooser, secrets.choice(["first", "second"]))
            return
        if phase == "lineup_pick" and policy == "forfeit_map":
            missing = [side for side in SIDES if self.runtime.lineupSubmissions[side] is None]
            loser = missing[0] if len(missing) == 1 else None
        if loser:
            self._forfeit_current_map(loser, f"{phase}_timeout")
        else:
            if not self.runtime.awaitingAdminDecision:
                self.runtime.timedOut = True
                self.runtime.awaitingAdminDecision = True
                self._append_notification("SELECTION_AWAITING_ADMIN", None, {
                    "subject": self._team_name(actor) or "当前操作方",
                    "selectionType": self._business_stage_label(self.status.phase),
                })

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
        self.status.config["teams"][side] = name.strip()
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
        if self.status.config["startWithDefaultConfig"] and all(self.runtime.presence[c]["ready"] for c in ("A", "B")):
            self._start_match()

    def _action_start(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        self._require_phase("waiting_ready")
        if payload.get("force") is not True and not all(self.runtime.presence[c]["ready"] for c in ("A", "B")):
            raise StateActionError("teams_not_ready", "双方尚未准备", 409)
        self._start_match()

    def _start_match(self) -> None:
        self._publish("pre_start_rest", 0, None, {})
        if self.runtime.totalTimeMs == 0:
            self._begin_first_map()

    def _begin_first_map(self) -> None:
        config = self.status.config
        policy = config["firstMapPickerPolicy"]
        if config["mapSelectionMode"] == "fixed_map_order" or config["fixedFirstMapEnabled"]:
            map_id = config["fixedMapOrder"][0] if config["mapSelectionMode"] == "fixed_map_order" else config["fixedFirstMapId"]
            self._select_map(None, map_id)
        elif policy == "interactive_random":
            self._publish("interactive_random", 0, "both", {"purpose": "map_picker"})
        else:
            picker = secrets.choice(list(SIDES)) if policy == "random" else policy
            self.status.match["decisions"]["firstMapPickerSide"] = picker
            self._publish("map_pick", 0, picker, self._map_phase_data(0))

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

    def _resolve_interactive_random(self) -> None:
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
        })

    def _continue_interactive_random(self) -> None:
        assert self.runtime.interactiveRandomResult is not None
        result = self.runtime.interactiveRandomResult["resultSide"]
        purpose = self.status.phase["data"]["purpose"]
        map_index = self.status.phase["mapIndex"]
        if purpose == "map_picker":
            self.status.match["decisions"]["firstMapPickerSide"] = result
            self._publish("map_pick", map_index, result, self._map_phase_data(map_index))
        elif purpose == "opening_ban":
            self.status.match["decisions"]["openingBanSide"] = result
            self.status.match["maps"][map_index]["bans"]["firstBanSide"] = result
            self._publish("ban_first", map_index, result, {"firstBanSide": result})
        else:
            self._enter_side_pick(map_index, result)

    def _map_phase_data(self, map_index: int) -> dict[str, Any]:
        modes = sorted({mode for mode, _map_id in self._legal_maps(map_index)})
        return {"allowedModeIds": modes} if modes else {}

    def _legal_maps(self, map_index: int) -> list[tuple[str, str]]:
        config = self.status.config
        used = {item["mapId"] for item in self.status.match["maps"] if item["mapId"]}
        candidates = [(mode, map_id) for mode, maps in config["mapPool"].items() for map_id in maps if map_id not in used]
        selection = config["mapSelectionMode"]
        if selection == "first_mode_then_unique_mode" and map_index == 0:
            candidates = [item for item in candidates if item[0] == config["firstMapMode"]]
        elif selection == "strict_mode_order" and config["modeOrder"]:
            required = config["modeOrder"][map_index % len(config["modeOrder"])]
            candidates = [item for item in candidates if item[0] == required]
        elif selection in {"unique_mode_until_cycle", "first_mode_then_unique_mode"}:
            used_modes = {item["modeId"] for item in self.status.match["maps"] if item["modeId"]}
            all_modes = set(config["mapPool"])
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

    def _select_map(self, picker: str | None, selection: str | tuple[str, str]) -> None:
        index = int(self.status.phase.get("mapIndex") or 0)
        if isinstance(selection, tuple):
            mode_id, map_id = selection
        else:
            map_id = stable_id(selection)
            mode_id = next((mode for mode, maps in self.status.config["mapPool"].items() if map_id in maps), "unknown")
        item = self.status.match["maps"][index]
        item.update({"status": "selected", "mapId": map_id, "modeId": mode_id, "pickerSide": picker})
        if index == 0 and picker in SIDES:
            self.status.match["decisions"]["firstMapPickerSide"] = picker
        chooser = self._side_chooser(index, picker)
        if chooser is None:
            self._after_side_pick(index)
        else:
            self._enter_side_pick(index, chooser)

    def _side_chooser(self, index: int, picker: str | None) -> str | None:
        config = self.status.config
        if index == 0:
            policy = config["firstSideChoicePolicy"]
            if policy == "none":
                return None
            if policy == "map_picker":
                return picker
            if policy in SIDES:
                return policy
            return "left"
        previous = self.status.match["maps"][index - 1]
        winner = previous["winnerSide"]
        if winner not in SIDES:
            return picker
        return winner if config["subsequentSideChoicePolicy"] == "previous_winner" else other_side(winner)

    def _enter_side_pick(self, index: int, chooser: str) -> None:
        kind = "color" if self.status.config["symmetricSideChoiceEnabled"] else "attack_defense"
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
        if self.status.config["rosterMode"] == "skip":
            self._begin_bans(index)
        else:
            self._publish("lineup_pick", index, "both", {})

    def _action_lineup_submit(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("lineup_pick")
        side = self._require_actor(portal, payload)
        lineup = payload.get("lineup")
        if not isinstance(lineup, dict):
            raise StateActionError("invalid_lineup", "lineup 必须是对象")
        slot_ids = [slot["id"] for slot in self.status.config["lineupSlots"]]
        normalized: dict[str, str] = {}
        for slot_id in slot_ids:
            value = lineup.get(slot_id)
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > 80:
                raise StateActionError("invalid_lineup", f"阵容位 {slot_id} 无效")
            normalized[slot_id] = value.strip()
        if self.status.config["rosterMode"] == "preset_only":
            allowed = set(self.status.config["presetRosters"][side])
            if any(value not in allowed for value in normalized.values()):
                raise StateActionError("invalid_lineup", "阵容包含预设名单外成员")
        self.runtime.lineupSubmissions[side] = normalized
        if all(self.runtime.lineupSubmissions[candidate] is not None for candidate in SIDES):
            index = self.status.phase["mapIndex"]
            self.status.match["maps"][index]["lineups"] = deepcopy(self.runtime.lineupSubmissions)
            self._begin_bans(index)

    def _begin_bans(self, index: int) -> None:
        if not self.status.config["banEnabled"]:
            self._publish("score_entry", index, "both" if self.status.config["scoreReportMode"] != "admin_only" else None, {})
            return
        if index == 0:
            policy = self.status.config["openingSidePolicy"]
            if policy == "interactive_random":
                self._publish("interactive_random", index, "both", {"purpose": "opening_ban"})
                return
            if policy == "follow_map_picker":
                first = self.status.match["maps"][index]["pickerSide"] or self.status.match["decisions"]["firstMapPickerSide"]
            elif policy == "random":
                first = secrets.choice(list(SIDES))
            else:
                first = policy
            self.status.match["decisions"]["openingBanSide"] = first
            self.status.match["maps"][index]["bans"]["firstBanSide"] = first
            self._publish("ban_first", index, first, {"firstBanSide": first})
            return
        previous = self.status.match["maps"][index - 1]
        loser = other_side(previous["winnerSide"]) if previous["winnerSide"] in SIDES else secrets.choice(list(SIDES))
        if self.status.config["firstBanPolicy"] == "loser_must_first":
            self.status.match["maps"][index]["bans"]["firstBanSide"] = loser
            self._publish("ban_first", index, loser, {"firstBanSide": loser})
        else:
            self._publish("ban_order", index, loser, {"chooserSide": loser})

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

    def _legal_heroes(self) -> list[str]:
        pool = [hero for heroes in self.status.config["heroPool"].values() for hero in heroes]
        index = self.status.phase["mapIndex"]
        bans = self.status.match["maps"][index]["bans"]
        used = {bans["leftHeroId"], bans["rightHeroId"]}
        return [hero for hero in pool if hero not in used]

    def _action_hero_ban(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("ban_first", "ban_second")
        side = self._require_actor(portal, payload)
        hero = stable_id(payload.get("heroId"))
        if hero not in self._legal_heroes():
            raise StateActionError("illegal_hero", "该英雄当前不可 Ban")
        self._select_hero_ban(side, hero)

    def _select_hero_ban(self, side: str, hero: str) -> None:
        index = self.status.phase["mapIndex"]
        bans = self.status.match["maps"][index]["bans"]
        bans[f"{side}HeroId"] = hero
        first = bans["firstBanSide"]
        if self.status.phase["type"] == "ban_first" and int(self.status.config["bansPerSide"]) >= 1:
            self._publish("ban_second", index, other_side(first), {"firstBanSide": first})
        else:
            actor = "both" if self.status.config["scoreReportMode"] == "team_submit_opponent_confirm" else None
            self._publish("score_entry", index, actor, {})

    def _action_score_submit(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("score_entry")
        score = self._validate_score(payload.get("score"))
        if self._is_admin(portal) or self.status.config["scoreReportMode"] == "admin_only":
            self._require_admin(portal)
            self._commit_score(score)
            return
        side = self._require_actor(portal, payload)
        if self.runtime.scoreProposal is not None:
            raise StateActionError("score_already_submitted", "已有比分等待确认", 409)
        self.runtime.scoreProposal = {"submittedBy": side, "score": score, "rejectedBy": None}
        self.runtime.totalTimeMs = self.status.config["stageLimits"]["scoreConfirmSeconds"] * 1000
        self.runtime.remainingTimeMs = self.runtime.totalTimeMs
        self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs

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
        self._require_phase("score_entry")
        proposal = self.runtime.scoreProposal
        if proposal is None:
            raise StateActionError("no_score_proposal", "没有待确认比分", 409)
        side = self._side(portal, payload)
        if not self._is_admin(portal) and side == proposal["submittedBy"]:
            raise StateActionError("forbidden", "提交方不能确认自己的比分", 403)
        self._commit_score(proposal["score"])

    def _action_score_reject(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_phase("score_entry")
        proposal = self.runtime.scoreProposal
        if proposal is None:
            raise StateActionError("no_score_proposal", "没有待确认比分", 409)
        side = self._side(portal, payload)
        if not self._is_admin(portal) and side == proposal["submittedBy"]:
            raise StateActionError("forbidden", "提交方不能拒绝自己的比分", 403)
        proposal["rejectedBy"] = side
        self.runtime.remainingTimeMs = self.runtime.totalTimeMs
        self._deadline_ms = self.now_ms() + self.runtime.totalTimeMs

    def _commit_score(self, score: dict[str, int]) -> None:
        index = self.status.phase["mapIndex"]
        current = self.status.match["maps"][index]
        current["score"] = deepcopy(score)
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
        if self.status.phase["type"] == "pre_start_rest":
            self._require_admin(portal)
            self._begin_first_map()
            return
        if self._is_admin(portal):
            self.runtime.restSkip = {"left": True, "right": True}
            self._begin_next_map(self.status.phase["mapIndex"] + 1)
            return
        side = self._require_actor(portal, payload)
        self.runtime.restSkip[side] = True
        if all(self.runtime.restSkip.values()):
            self._begin_next_map(self.status.phase["mapIndex"] + 1)

    def _begin_next_map(self, index: int) -> None:
        if index >= len(self.status.match["maps"]):
            self.runtime.timedOut = True
            self.runtime.awaitingAdminDecision = True
            return
        previous = self.status.match["maps"][index - 1]
        picker = other_side(previous["winnerSide"]) if previous["winnerSide"] in SIDES else secrets.choice(list(SIDES))
        if self.status.config["mapSelectionMode"] == "fixed_map_order":
            fixed = self.status.config["fixedMapOrder"]
            if index >= len(fixed):
                self.runtime.awaitingAdminDecision = True
                return
            self._publish("map_pick", index, picker, self._map_phase_data(index))
            self._select_map(picker, fixed[index])
        else:
            self._publish("map_pick", index, picker, self._map_phase_data(index))

    def _action_global_pause(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
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
        self._require_phase("score_entry")
        side = self._side(portal, payload)
        if side not in SIDES:
            raise StateActionError("forbidden", "只有队伍可以控制队伍暂停", 403)
        active = payload.get("active")
        if not isinstance(active, bool):
            raise StateActionError("invalid_pause", "active 必须是布尔值")
        state = self.runtime.pause["scoreTeams"][side]
        if active == state["active"]:
            return
        now = self.now_ms()
        self._refresh_runtime()
        any_before = any(self.runtime.pause["scoreTeams"][candidate]["active"] for candidate in SIDES)
        state["active"] = active
        if active:
            state["count"] += 1
            self._score_team_pause_started[side] = now
            if not any_before:
                self._score_pause_started_ms = now
        else:
            elapsed = now - int(self._score_team_pause_started[side] or now)
            state["phaseTotalMs"] += elapsed
            state["matchTotalMs"] += elapsed
            self._score_team_pause_started[side] = None
            if not any(self.runtime.pause["scoreTeams"][candidate]["active"] for candidate in SIDES):
                frozen = now - int(self._score_pause_started_ms or now)
                if self._deadline_ms is not None:
                    self._deadline_ms += frozen
                self._score_pause_started_ms = None

    def _action_timeout_resolve(self, portal: str, payload: dict[str, Any]) -> None:
        self._require_admin(portal)
        if not self.runtime.awaitingAdminDecision:
            raise StateActionError("not_waiting_admin", "当前没有等待管理员裁定", 409)
        resolution = payload.get("resolution")
        if resolution == "extend_30":
            self.runtime.awaitingAdminDecision = False
            self.runtime.timedOut = False
            self.runtime.totalTimeMs = 30000
            self.runtime.remainingTimeMs = 30000
            self._deadline_ms = self.now_ms() + 30000
        elif resolution == "forfeit":
            loser = payload.get("loserSide")
            if loser not in SIDES:
                raise StateActionError("invalid_side", "必须指定 loserSide")
            self._forfeit_current_map(loser, "admin_ruling")
        else:
            raise StateActionError("invalid_resolution", "不支持该裁定")

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
            "score": {loser: 0, winner: 1},
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

    def create(self, room_id: str, tokens: dict[str, str], config: dict[str, Any], catalog_hash: str = "") -> RoomSession:
        with self._lock:
            session = RoomSession.create(room_id, config, catalog_hash)
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
