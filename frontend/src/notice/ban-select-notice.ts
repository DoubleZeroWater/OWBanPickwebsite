import type { NoticeModule } from "./notice";
import { matchesStageText, payloadAction, payloadTeam, payloadText, textNotice } from "./notice";

const directEvents = [
  "BAN_ORDER_CONFIRMED", "BAN_ORDER_CONFIRMED_BY_ADMIN", "HERO_BAN_CONFIRMED",
  "HERO_BAN_CONFIRMED_BY_ADMIN", "HERO_BAN_RANDOM_BY_ADMIN", "HERO_BAN_TIMEOUT_RANDOM", "BAN_ORDER_TIMEOUT_AUTOMATIC",
];
const genericEvents = ["SELECTION_TIMEOUT_EXTENDED", "SELECTION_AWAITING_ADMIN", "ADMIN_DECISION_RESOLVED"];

export const banSelectNotice = {
  id: "ban-select",
  eventTypes: [...directEvents, ...genericEvents, "INTERACTIVE_RANDOM_RESULT"],
  matches: (event) => directEvents.includes(event.eventType)
    || (genericEvents.includes(event.eventType) && matchesStageText(event, ["Ban", "禁用"]))
    || (event.eventType === "INTERACTIVE_RANDOM_RESULT" && matchesStageText(event, ["Ban", "禁用"])),
  format: (event, context) => {
    const team = payloadTeam(event);
    const value = (key: string) => payloadText(event, key);
    const hero = context.heroName(value("heroName"));
    if (event.eventType === "INTERACTIVE_RANDOM_RESULT") {
      const fallback = value("timeoutSummary");
      return textNotice(`${fallback ? `${fallback}；` : ""}交互随机结果为${value("left")} XOR ${value("right")} = ${value("result")}，${team}获得${value("rightLabel")}`);
    }
    if (event.eventType === "BAN_ORDER_CONFIRMED") return textNotice(`${team}选择了${value("firstOrSecond")}`);
    if (event.eventType === "BAN_ORDER_CONFIRMED_BY_ADMIN") return textNotice(`管理员为${team}选择了${value("firstOrSecond")}`);
    if (event.eventType === "BAN_ORDER_TIMEOUT_AUTOMATIC") return textNotice(`${team}选择禁用顺序超时，自动确定为${value("firstOrSecond")}`);
    if (event.eventType === "HERO_BAN_CONFIRMED") return textNotice(`${team}禁用了${hero}`);
    if (event.eventType === "HERO_BAN_CONFIRMED_BY_ADMIN") return textNotice(`管理员为${team}禁用了${hero}`);
    if (event.eventType === "HERO_BAN_RANDOM_BY_ADMIN") return textNotice(`管理员为${team}随机禁用了${hero}`);
    if (event.eventType === "HERO_BAN_TIMEOUT_RANDOM") return textNotice(`${team}英雄禁用超时，系统随机禁用了${hero}`);
    if (event.eventType === "SELECTION_TIMEOUT_EXTENDED") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，已警告一次，并重新给予${value("seconds")}秒选择时间`);
    if (event.eventType === "SELECTION_AWAITING_ADMIN") return textNotice(`${value("subject")}在${payloadAction(event, "selectionType")}时超时，现等待管理员裁定`);
    return textNotice(`管理员已完成${payloadAction(event, "decisionType")}裁定：${value("decisionSummary")}`);
  },
} satisfies NoticeModule;
