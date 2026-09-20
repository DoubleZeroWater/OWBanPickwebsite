from __future__ import annotations

from ..contracts import CommandPayload
from ..errors import StateActionError
from ..state_models import SIDES, other_side, stable_id


class MapSelectionPhaseMixin:
    def _action_map_select(self, portal: str, payload: CommandPayload) -> None:
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

    def _action_side_select(self, portal: str, payload: CommandPayload) -> None:
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
