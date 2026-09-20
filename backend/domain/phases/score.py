from __future__ import annotations

from copy import deepcopy

from ..contracts import CommandPayload, Score
from ..errors import StateActionError
from ..state_models import MATCH_WINS, SIDES, other_side


class ScorePhaseMixin:
    def _action_score_submit(self, portal: str, payload: CommandPayload) -> None:
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

    def _validate_score(self, value: object) -> Score:
        if not isinstance(value, dict):
            raise StateActionError("invalid_score", "score 必须是对象")
        result: dict[str, int] = {}
        for side in SIDES:
            number = value.get(side)
            if isinstance(number, bool) or not isinstance(number, int) or not 0 <= number <= 99:
                raise StateActionError("invalid_score", "比分必须是 0 到 99 的整数")
            result[side] = number
        return result

    def _action_score_confirm(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_score_reject(self, portal: str, payload: CommandPayload) -> None:
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

    def _commit_score(self, score: Score) -> None:
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

    def _action_rest_skip(self, portal: str, payload: CommandPayload) -> None:
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
