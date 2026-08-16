import type { NoticeModule } from "./notice";
import { matchesStageText, payloadAction, payloadText, textNotice } from "./notice";

const genericEvents = ["SELECTION_TIMEOUT_EXTENDED", "SELECTION_AWAITING_ADMIN", "ADMIN_DECISION_RESOLVED"];

export const playerSelectNotice = {
  id: "player-select",
  eventTypes: ["LINEUPS_SUBMITTED", "LINEUP_CONFIRMED_BY_ADMIN", "LINEUP_BOTH_RESTARTED", ...genericEvents],
  matches: (event) => ["LINEUPS_SUBMITTED", "LINEUP_CONFIRMED_BY_ADMIN", "LINEUP_BOTH_RESTARTED"].includes(event.eventType)
    || matchesStageText(event, ["上人", "上场"]),
  format: (event) => {
    const value = (key: string) => payloadText(event, key);
    if (event.eventType === "LINEUPS_SUBMITTED") return textNotice("双方已提交阵容");
    if (event.eventType === "LINEUP_CONFIRMED_BY_ADMIN") return textNotice("管理员已为双方设置上场人员");
    if (event.eventType === "LINEUP_BOTH_RESTARTED") return textNotice(`双方上场人员选择均超时，已警告一次，并重新给予${value("seconds")}秒选择时间`);
    if (event.eventType === "SELECTION_TIMEOUT_EXTENDED") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，已警告一次，并重新给予${value("seconds")}秒选择时间`);
    if (event.eventType === "SELECTION_AWAITING_ADMIN") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，现等待管理员裁定`);
    return textNotice(`管理员已完成${payloadAction(event, "decisionType")}裁定：${value("decisionSummary")}`);
  },
} satisfies NoticeModule;
