import type { NoticeModule } from "./notice";
import { matchesStageText, payloadAction, payloadText, textNotice } from "./notice";

export const scoreNotice = {
  id: "score",
  eventTypes: ["SCORE_CONFIRMATION_TIMEOUT_AUTO", "SELECTION_TIMEOUT_EXTENDED", "SELECTION_AWAITING_ADMIN", "ADMIN_DECISION_RESOLVED"],
  matches: (event) => event.eventType === "SCORE_CONFIRMATION_TIMEOUT_AUTO" || matchesStageText(event, ["比分", "得分"]),
  format: (event) => {
    const value = (key: string) => payloadText(event, key);
    if (event.eventType === "SCORE_CONFIRMATION_TIMEOUT_AUTO") return textNotice(`${value("teamName")}比分确认超时，系统自动确认比分为${value("leftTeam")} ${value("leftScore")}:${value("rightScore")} ${value("rightTeam")}`);
    if (event.eventType === "SELECTION_TIMEOUT_EXTENDED") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，已警告一次，并重新给予${value("seconds")}秒选择时间`);
    if (event.eventType === "SELECTION_AWAITING_ADMIN") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，现等待管理员裁定`);
    return textNotice(`管理员已完成${payloadAction(event, "decisionType")}裁定：${value("decisionSummary")}`);
  },
} satisfies NoticeModule;
