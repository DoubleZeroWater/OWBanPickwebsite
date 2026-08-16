import type { NoticeModule } from "./notice";
import { payloadAction, payloadText, textNotice } from "./notice";

export const resultNotice = {
  id: "result",
  eventTypes: ["MAP_FORFEITED", "MAP_WON", "MATCH_WON"],
  matches: () => true,
  format: (event) => {
    if (event.eventType === "MAP_FORFEITED") return textNotice(`${payloadText(event, "loserTeam")}在${payloadAction(event, "selectionType")}时超时，本张地图判负`);
    if (event.eventType === "MAP_WON") return textNotice(`${payloadText(event, "winnerTeam")}赢得本张地图`);
    return textNotice(`${payloadText(event, "winnerTeam")}赢得本场比赛`);
  },
} satisfies NoticeModule;
