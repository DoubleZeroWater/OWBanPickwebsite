from __future__ import annotations

from copy import deepcopy

from ..constants import LINEUP_SLOTS
from ..contracts import CommandPayload
from ..errors import StateActionError
from ..state_models import SIDES, catalog_hero_id, other_side


class LineupBanPhaseMixin:
    def _action_lineup_submit(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_ban_order(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_hero_ban(self, portal: str, payload: CommandPayload) -> None:
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
