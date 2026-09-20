from __future__ import annotations

import secrets

from ..constants import INTERACTIVE_RANDOM_RESULT_SECONDS
from ..contracts import CommandPayload, JsonObject
from ..errors import StateActionError
from ..state_models import SIDES, other_side


class PreparationPhaseMixin:
    def _action_config_confirm(self, portal: str, _payload: CommandPayload) -> None:
        self._require_admin(portal)
        self._require_phase("configuring")
        self._publish("waiting_ready", None, None, {})

    def _action_team_name_set(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_ready(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_start(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_interactive_random(self, portal: str, payload: CommandPayload) -> None:
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

    def _map_phase_data(self, map_index: int) -> JsonObject:
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
