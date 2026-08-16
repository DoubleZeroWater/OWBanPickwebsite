import type { NoticeModule } from "./notice";
import { matchesStageText, payloadAction, payloadText, textNotice } from "./notice";

export const prepareNotice = {
  id: "prepare",
  eventTypes: ["MATCH_STARTED_MANUAL", "MATCH_STARTED_FORCE", "MATCH_STARTED_AUTO", "STAGE_RESTORED", "SELECTION_TIMEOUT_EXTENDED", "SELECTION_AWAITING_ADMIN", "ADMIN_DECISION_RESOLVED"],
  matches: (event) => !["SELECTION_TIMEOUT_EXTENDED", "SELECTION_AWAITING_ADMIN", "ADMIN_DECISION_RESOLVED"].includes(event.eventType)
    || matchesStageText(event, ["交互随机"]),
  format: (event) => {
    if (event.eventType === "MATCH_STARTED_MANUAL") return textNotice("双方准备就绪，管理员开始了比赛");
    if (event.eventType === "MATCH_STARTED_FORCE") return textNotice("管理员强制开始了比赛");
    if (event.eventType === "MATCH_STARTED_AUTO") return textNotice("双方准备就绪，比赛自动开始");
    if (event.eventType === "SELECTION_TIMEOUT_EXTENDED") return textNotice(`交互随机超时，已重新给予${payloadText(event, "seconds")}秒选择时间`);
    if (event.eventType === "SELECTION_AWAITING_ADMIN") return textNotice("交互随机超时，现等待管理员裁定");
    if (event.eventType === "ADMIN_DECISION_RESOLVED") return textNotice(`管理员已完成${payloadAction(event, "decisionType")}裁定：${payloadText(event, "decisionSummary")}`);
    return textNotice(`管理员将比赛回退至${payloadText(event, "stageLabel")}`);
  },
} satisfies NoticeModule;
