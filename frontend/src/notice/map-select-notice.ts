import type { NoticeModule } from "./notice";
import { matchesStageText, payloadAction, payloadTeam, payloadText, textNotice } from "./notice";

const directEvents = [
  "FIXED_MAP_ANNOUNCED", "RIGHT_ASSIGNED", "RIGHT_ASSIGNED_RANDOM", "MAP_CONFIRMED",
  "MAP_CONFIRMED_BY_ADMIN", "MAP_TIMEOUT_RANDOM", "SIDE_CONFIRMED", "SIDE_CONFIRMED_BY_ADMIN", "SIDE_TIMEOUT_RANDOM", "SIDE_TIMEOUT_DEFAULT",
];
const genericEvents = ["SELECTION_TIMEOUT_EXTENDED", "SELECTION_AWAITING_ADMIN", "ADMIN_DECISION_RESOLVED"];

export const mapSelectNotice = {
  id: "map-select",
  eventTypes: [...directEvents, ...genericEvents, "INTERACTIVE_RANDOM_RESULT"],
  matches: (event) => directEvents.includes(event.eventType)
    || (genericEvents.includes(event.eventType) && matchesStageText(event, ["选图", "攻防", "阵营"]))
    || (event.eventType === "INTERACTIVE_RANDOM_RESULT" && matchesStageText(event, ["选图", "攻防", "阵营"])),
  format: (event, context) => {
    const team = payloadTeam(event);
    const value = (key: string) => payloadText(event, key);
    const map = context.mapName(value("mapName"));
    if (event.eventType === "FIXED_MAP_ANNOUNCED") return textNotice(`本张地图固定为${map}`);
    if (event.eventType === "RIGHT_ASSIGNED") return textNotice(`${team}获得本张地图的${value("rightLabel")}`);
    if (event.eventType === "RIGHT_ASSIGNED_RANDOM") return textNotice(`系统随机确定${team}获得本张地图的${value("rightLabel")}`);
    if (event.eventType === "INTERACTIVE_RANDOM_RESULT") {
      const fallback = value("timeoutSummary");
      return textNotice(`${fallback ? `${fallback}；` : ""}交互随机结果为${value("left")} XOR ${value("right")} = ${value("result")}，${team}获得${value("rightLabel")}`);
    }
    if (event.eventType === "MAP_CONFIRMED") return textNotice(`${team}选择${map}作为本张地图`);
    if (event.eventType === "MAP_CONFIRMED_BY_ADMIN") return textNotice(`管理员为${team}选择${map}作为本张地图`);
    if (event.eventType === "MAP_TIMEOUT_RANDOM") return textNotice(`${team}选图超时，系统随机选择了${map}`);
    if (event.eventType === "SIDE_CONFIRMED") return textNotice(`${team}选择了${value("choice")}`);
    if (event.eventType === "SIDE_CONFIRMED_BY_ADMIN") return textNotice(`管理员为${team}选择了${value("choice")}`);
    if (event.eventType === "SIDE_TIMEOUT_RANDOM") return textNotice(`${team}${value("choiceKind")}选择超时，系统随机分配为${value("choice")}`);
    if (event.eventType === "SIDE_TIMEOUT_DEFAULT") return textNotice(`${team}${value("choiceKind")}选择超时，自动分配为${value("choice")}`);
    if (event.eventType === "SELECTION_TIMEOUT_EXTENDED") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，已警告一次，并重新给予${value("seconds")}秒选择时间`);
    if (event.eventType === "SELECTION_AWAITING_ADMIN") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，现等待管理员裁定`);
    return textNotice(`管理员已完成${payloadAction(event, "decisionType")}裁定：${value("decisionSummary")}`);
  },
} satisfies NoticeModule;
