from __future__ import annotations

from ..contracts import CommandPayload
from ..errors import StateActionError
from ..state_models import SIDES


class PausePhaseMixin:
    def _action_global_pause(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_score_pause(self, portal: str, payload: CommandPayload) -> None:
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
