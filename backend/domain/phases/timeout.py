from __future__ import annotations

import secrets
from copy import deepcopy

from ..state_models import SIDES, other_side


class TimeoutPhaseMixin:
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
