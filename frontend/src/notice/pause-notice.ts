import type { NoticeModule } from "./notice";
import { payloadText, textNotice } from "./notice";

export const pauseNotice = {
  id: "pause",
  eventTypes: ["GLOBAL_PAUSE_CHANGED", "TEAM_PAUSE_CHANGED", "TEAM_PAUSE_AUTO_ENDED"],
  matches: () => true,
  format: (event) => {
    if (event.eventType === "GLOBAL_PAUSE_CHANGED") {
      return textNotice(event.payload.active === true ? "管理员已暂停全局时间" : "管理员已恢复全局时间");
    }
    if (event.eventType === "TEAM_PAUSE_AUTO_ENDED") {
      return textNotice(`${payloadText(event, "teamName")}已达到暂停时长上限，暂停自动结束`);
    }
    return textNotice(event.payload.active === true
      ? `${payloadText(event, "teamName")}开始暂停计时`
      : `${payloadText(event, "teamName")}结束暂停计时`);
  },
} satisfies NoticeModule;
