from __future__ import annotations

import secrets
from copy import deepcopy

from ..contracts import CommandPayload
from ..errors import StateActionError
from ..state_models import SIDES, catalog_hero_id, other_side, stable_id


class RulingPhaseMixin:
    def _action_timeout_resolve(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_map_forfeit(self, portal: str, payload: CommandPayload) -> None:
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
