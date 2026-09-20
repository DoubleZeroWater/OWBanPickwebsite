from __future__ import annotations

import uuid
from copy import deepcopy

from .contracts import CommandPayload, JsonObject, PhaseState, RoomRuntimeData, RoomStatusData
from .state_models import PORTAL_ROLES, PORTAL_SIDES, SIDES, catalog_hero_id


DECISION_SUMMARIES = {
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


class NotificationMixin:
    def _append_notification(
        self,
        event_type: str,
        portal_code: str | None,
        payload: JsonObject | None = None,
    ) -> None:
        self.notification_sequence += 1
        side = PORTAL_SIDES.get(portal_code) if portal_code else None
        actor = (
            {"kind": "portal", "portalCode": portal_code, "role": PORTAL_ROLES[portal_code], "side": side}
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
        return str(self.status.match["teams"][side]["name"]) if side in SIDES else ""

    def _selection_subject(self, phase: PhaseState) -> str:
        actor_side = phase.get("actorSide")
        if actor_side in SIDES:
            return self._team_name(actor_side)
        if phase.get("type") == "lineup_pick":
            missing = [side for side in SIDES if self.runtime.lineupSubmissions.get(side) is None]
            if len(missing) == 1:
                return self._team_name(missing[0])
        return "双方队伍" if actor_side == "both" else "当前操作方"

    @staticmethod
    def _side_choice_label(kind: str | None, chooser: str, selected: str) -> str:
        if kind == "attack_defense":
            return "先防守方" if selected == chooser else "先进攻方"
        return "蓝色方" if selected == chooser else "红色方"

    @staticmethod
    def _admin_event(base: str, portal_code: str) -> str:
        return f"{base}_BY_ADMIN" if portal_code == "C" else base

    def _business_stage_label(self, phase: PhaseState) -> str:
        map_index = phase.get("mapIndex")
        prefix = f"第{map_index + 1}张地图的" if isinstance(map_index, int) else ""
        phase_type = str(phase.get("type"))
        data = phase.get("data")
        choice_kind = data.get("choiceKind") if isinstance(data, dict) else None
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
        return f"{prefix}{labels.get(phase_type, phase_type)}"

    def _record_map_result_notifications(self, before_status: RoomStatusData) -> None:
        before_maps = before_status["match"]["maps"]
        for index, current in enumerate(self.status.match["maps"]):
            before = before_maps[index]
            if before.get("status") == current.get("status") or current.get("status") not in {"completed", "forfeited"}:
                continue
            winner = current.get("winnerSide")
            if winner in SIDES:
                self._append_notification("MAP_WON", None, {
                    "mapIndex": index,
                    "winnerSide": winner,
                    "winnerTeam": self._team_name(winner),
                })
        winner = self.status.match.get("winnerSide")
        if not before_status["match"].get("winnerSide") and winner in SIDES:
            self._append_notification("MATCH_WON", None, {"winnerSide": winner, "winnerTeam": self._team_name(winner)})

    def _record_action_notifications(
        self,
        portal_code: str,
        action_type: str,
        payload: CommandPayload,
        before_status: RoomStatusData,
        before_runtime: RoomRuntimeData,
    ) -> None:
        phase = before_status["phase"]
        phase_type, map_index = phase["type"], phase.get("mapIndex")
        actor_side = PORTAL_SIDES.get(portal_code)
        if portal_code == "C":
            requested = payload.get("side")
            actor_side = requested if requested in SIDES else phase.get("actorSide")

        if action_type == "match_start" and phase_type == "waiting_ready":
            self._append_notification("MATCH_STARTED_FORCE" if payload.get("force") is True else "MATCH_STARTED_MANUAL", portal_code)
        elif action_type == "portal_ready_set" and phase_type == "waiting_ready" and self.status.phase["type"] != "waiting_ready":
            self._append_notification("MATCH_STARTED_AUTO", None)
        elif action_type == "map_select" and isinstance(map_index, int):
            selected = self.status.match["maps"][map_index]
            self._append_notification(self._admin_event("MAP_CONFIRMED", portal_code), portal_code, {
                "mapIndex": map_index,
                "mapId": selected.get("mapId"),
                "mapName": selected.get("mapId"),
                "teamName": self._team_name(actor_side),
                "side": actor_side,
            })
        elif action_type == "side_select":
            selected = payload.get("selectedSide")
            data = phase.get("data", {})
            kind = data.get("choiceKind") if isinstance(data, dict) else None
            self._append_notification(self._admin_event("SIDE_CONFIRMED", portal_code), portal_code, {
                "mapIndex": map_index,
                "teamName": self._team_name(actor_side),
                "side": actor_side,
                "selectedSide": selected,
                "choiceKind": "攻防" if kind == "attack_defense" else "阵营",
                "choice": self._side_choice_label(kind, actor_side, selected),
            })
        elif action_type == "lineup_submit" and phase_type == "lineup_pick" and self.status.phase["type"] != "lineup_pick":
            self._append_notification("LINEUPS_SUBMITTED", portal_code, {"mapIndex": map_index})
        elif action_type == "ban_order_select":
            self._append_notification(self._admin_event("BAN_ORDER_CONFIRMED", portal_code), portal_code, {
                "mapIndex": map_index,
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "firstOrSecond": "先手禁用" if payload.get("choice") == "first" else "后手禁用",
            })
        elif action_type == "hero_ban_select":
            hero_id = catalog_hero_id(payload.get("heroId"))
            self._append_notification(self._admin_event("HERO_BAN_CONFIRMED", portal_code), portal_code, {
                "mapIndex": map_index,
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "heroId": hero_id,
                "heroName": hero_id,
            })
        elif action_type == "global_pause_set":
            self._append_notification("GLOBAL_PAUSE_CHANGED", portal_code, {"active": payload.get("active") is True})
        elif action_type == "score_pause_set" and actor_side in SIDES:
            self._append_notification("TEAM_PAUSE_CHANGED", portal_code, {
                "side": actor_side,
                "teamName": self._team_name(actor_side),
                "active": payload.get("active") is True,
            })
        elif action_type == "timeout_resolve" and before_runtime.get("awaitingAdminDecision"):
            resolution = payload.get("resolution")
            data = phase.get("data", {})
            source = data.get("sourcePhase") if isinstance(data, dict) and isinstance(data.get("sourcePhase"), dict) else phase
            self._append_notification("ADMIN_DECISION_RESOLVED", portal_code, {
                "decisionType": self._business_stage_label(source),
                "decisionKind": data.get("decisionKind") if isinstance(data, dict) else None,
                "resolution": resolution,
                "decisionSummary": DECISION_SUMMARIES.get(str(resolution), str(resolution)),
                "winnerSide": payload.get("winnerSide") if resolution == "series_winner" else None,
                "winnerTeam": self._team_name(payload.get("winnerSide")) if resolution == "series_winner" else None,
            })
            if resolution == "submit_lineup" and self.status.phase["type"] != "lineup_pick":
                self._append_notification("LINEUPS_SUBMITTED", portal_code, {"mapIndex": map_index})

        if action_type in {"score_submit", "score_confirm"}:
            self._record_map_result_notifications(before_status)
