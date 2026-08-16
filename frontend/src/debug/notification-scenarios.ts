import type { MatchNotificationEvent } from "../state/protocol";

type NotificationScenario = {
  id: string;
  label: string;
  event: MatchNotificationEvent;
};

const portalActor = { kind: "portal", portalCode: "A", role: "blue-team", side: "left" } as const;
const adminActor = { kind: "portal", portalCode: "C", role: "admin", side: null } as const;
const systemActor = { kind: "system", portalCode: null, role: "system", side: null } as const;

function scenario(
  id: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  actor: MatchNotificationEvent["actor"] = systemActor,
): NotificationScenario {
  return {
    id,
    label: eventType,
    event: {
      eventId: `debug-notification-${id}`,
      sequence: 1,
      eventType,
      actor,
      payload,
      occurredAt: Date.now(),
      statusVersion: { epoch: 1, revision: 1, hash: "debug", phaseId: "debug-phase" },
    },
  };
}

const extended = (id: string, selectionType: string, subject = "队伍 1") => scenario(id, "SELECTION_TIMEOUT_EXTENDED", {
  subject, selectionType, seconds: 30,
});
const awaiting = (id: string, selectionType: string, subject = "队伍 1") => scenario(id, "SELECTION_AWAITING_ADMIN", {
  subject, selectionType,
});
const resolved = (id: string, decisionType: string, decisionSummary: string) => scenario(id, "ADMIN_DECISION_RESOLVED", {
  decisionType, decisionSummary,
}, adminActor);

export const DEBUG_NOTIFICATION_SCENARIOS: readonly NotificationScenario[] = [
  scenario("match-manual", "MATCH_STARTED_MANUAL", {}, adminActor),
  scenario("match-force", "MATCH_STARTED_FORCE", {}, adminActor),
  scenario("match-auto", "MATCH_STARTED_AUTO"),
  scenario("stage-restored", "STAGE_RESTORED", { stageLabel: "第2张地图的后手英雄禁用阶段" }, adminActor),

  scenario("fixed-map", "FIXED_MAP_ANNOUNCED", { mapName: "漓江塔" }),
  scenario("right-assigned", "RIGHT_ASSIGNED", { teamName: "队伍 1", rightLabel: "优先选择权" }),
  scenario("right-random", "RIGHT_ASSIGNED_RANDOM", { teamName: "队伍 2", rightLabel: "优先选择权" }),
  scenario("interactive-map", "INTERACTIVE_RANDOM_RESULT", { left: 1, right: 0, result: 1, teamName: "队伍 1", rightLabel: "首次选图权" }),
  scenario("interactive-map-timeout", "INTERACTIVE_RANDOM_RESULT", { left: 0, right: 1, result: 1, teamName: "队伍 2", rightLabel: "首次选图权", timeoutSummary: "队伍 1未提交随机值，系统按0处理" }),
  scenario("map-confirmed", "MAP_CONFIRMED", { teamName: "队伍 1", mapName: "漓江塔" }, portalActor),
  scenario("map-admin", "MAP_CONFIRMED_BY_ADMIN", { teamName: "队伍 2", mapName: "国王大道" }, adminActor),
  scenario("map-random", "MAP_TIMEOUT_RANDOM", { teamName: "队伍 1", mapName: "漓江塔" }),
  scenario("side-confirmed", "SIDE_CONFIRMED", { teamName: "队伍 1", choice: "蓝色方", choiceKind: "阵营" }, portalActor),
  scenario("side-admin", "SIDE_CONFIRMED_BY_ADMIN", { teamName: "队伍 2", choice: "先防守方", choiceKind: "攻防" }, adminActor),
  scenario("side-random", "SIDE_TIMEOUT_RANDOM", { teamName: "队伍 2", choice: "先进攻方", choiceKind: "攻防" }),
  scenario("side-default-blue", "SIDE_TIMEOUT_DEFAULT", { teamName: "队伍 1", choice: "先防守方", choiceKind: "攻防", policyLabel: "选择蓝色/防守方" }),
  scenario("side-default-red", "SIDE_TIMEOUT_DEFAULT", { teamName: "队伍 2", choice: "红色方", choiceKind: "阵营", policyLabel: "选择红色/进攻方" }),
  extended("map-extended", "第1张地图的选图阶段"),
  awaiting("map-awaiting", "第1张地图的攻防选择阶段"),
  resolved("map-resolved", "第1张地图的选图阶段", "选择了漓江塔"),

  scenario("lineups-submitted", "LINEUPS_SUBMITTED", { mapIndex: 0 }),
  scenario("lineup-admin", "LINEUP_CONFIRMED_BY_ADMIN", { mapIndex: 0 }, adminActor),
  scenario("lineup-restarted", "LINEUP_BOTH_RESTARTED", { seconds: 30 }),
  extended("lineup-extended", "第1张地图的上场人员确认阶段", "双方队伍"),
  awaiting("lineup-awaiting", "第1张地图的上场人员确认阶段", "双方队伍"),
  resolved("lineup-resolved", "第1张地图的上场人员确认阶段", "双方阵容已确认"),

  scenario("ban-order", "BAN_ORDER_CONFIRMED", { teamName: "队伍 1", firstOrSecond: "先手禁用" }, portalActor),
  scenario("ban-order-admin", "BAN_ORDER_CONFIRMED_BY_ADMIN", { teamName: "队伍 2", firstOrSecond: "后手禁用" }, adminActor),
  scenario("ban-order-timeout-random", "BAN_ORDER_TIMEOUT_AUTOMATIC", { teamName: "队伍 1", firstOrSecond: "后手禁用", policyLabel: "随机合法顺序" }),
  scenario("ban-order-timeout-first", "BAN_ORDER_TIMEOUT_AUTOMATIC", { teamName: "队伍 1", firstOrSecond: "先手禁用", policyLabel: "自动先手" }),
  scenario("ban-order-timeout-second", "BAN_ORDER_TIMEOUT_AUTOMATIC", { teamName: "队伍 2", firstOrSecond: "后手禁用", policyLabel: "自动后手" }),
  scenario("hero-ban", "HERO_BAN_CONFIRMED", { teamName: "队伍 1", heroName: "安娜" }, portalActor),
  scenario("hero-ban-admin", "HERO_BAN_CONFIRMED_BY_ADMIN", { teamName: "队伍 2", heroName: "源氏" }, adminActor),
  scenario("hero-ban-random-admin", "HERO_BAN_RANDOM_BY_ADMIN", { teamName: "队伍 1", heroName: "安娜" }, adminActor),
  scenario("hero-ban-timeout", "HERO_BAN_TIMEOUT_RANDOM", { teamName: "队伍 2", heroName: "源氏" }),
  scenario("interactive-ban", "INTERACTIVE_RANDOM_RESULT", { left: 0, right: 1, result: 1, teamName: "队伍 2", rightLabel: "Ban先手权" }),
  scenario("interactive-ban-timeout", "INTERACTIVE_RANDOM_RESULT", { left: 1, right: 0, result: 1, teamName: "队伍 1", rightLabel: "Ban先手权", timeoutSummary: "队伍 2未提交随机值，系统随机补全为0" }),
  extended("ban-extended", "第1张地图的先手英雄禁用阶段"),
  awaiting("ban-awaiting", "第1张地图的先手英雄禁用阶段"),
  resolved("ban-resolved", "第1张地图的先手英雄禁用阶段", "为队伍 1禁用了安娜"),

  extended("score-extended", "第1张地图的比分录入阶段", "双方队伍"),
  awaiting("score-awaiting", "第1张地图的比分录入阶段", "双方队伍"),
  resolved("score-resolved", "第1张地图的比分录入阶段", "比分已确认"),
  scenario("score-auto-confirm", "SCORE_CONFIRMATION_TIMEOUT_AUTO", { teamName: "队伍 2", leftTeam: "队伍 1", rightTeam: "队伍 2", leftScore: 3, rightScore: 2 }),

  scenario("global-pause-start", "GLOBAL_PAUSE_CHANGED", { active: true }, adminActor),
  scenario("team-pause-end", "TEAM_PAUSE_CHANGED", { teamName: "队伍 1", active: false }, portalActor),
  scenario("team-pause-auto-end", "TEAM_PAUSE_AUTO_ENDED", { teamName: "队伍 1", seconds: 5 }),

  scenario("map-forfeited", "MAP_FORFEITED", { loserTeam: "队伍 2", selectionType: "第1张地图的后手英雄禁用阶段" }),
  scenario("map-won", "MAP_WON", { winnerTeam: "队伍 1" }),
  scenario("match-won", "MATCH_WON", { winnerTeam: "队伍 1" }),
] as const;

export const DEBUG_NOTIFICATION_IDS = DEBUG_NOTIFICATION_SCENARIOS.map(({ id }) => id);

export const DEBUG_NOTIFICATION_EXPECTED_TEXT: Readonly<Record<string, string>> = {
  "match-manual": "双方准备就绪，管理员开始了比赛",
  "match-force": "管理员强制开始了比赛",
  "match-auto": "双方准备就绪，比赛自动开始",
  "stage-restored": "管理员将比赛回退至第2张地图的后手英雄禁用阶段",
  "fixed-map": "本张地图固定为漓江塔",
  "right-assigned": "队伍 1获得本张地图的优先选择权",
  "right-random": "系统随机确定队伍 2获得本张地图的优先选择权",
  "interactive-map": "交互随机结果为1 XOR 0 = 1，队伍 1获得首次选图权",
  "interactive-map-timeout": "队伍 1未提交随机值，系统按0处理；交互随机结果为0 XOR 1 = 1，队伍 2获得首次选图权",
  "map-confirmed": "队伍 1选择漓江塔作为本张地图",
  "map-admin": "管理员为队伍 2选择国王大道作为本张地图",
  "map-random": "队伍 1选图超时，系统随机选择了漓江塔",
  "side-confirmed": "队伍 1选择了蓝色方",
  "side-admin": "管理员为队伍 2选择了先防守方",
  "side-random": "队伍 2攻防选择超时，系统随机分配为先进攻方",
  "side-default-blue": "队伍 1攻防选择超时，自动分配为先防守方",
  "side-default-red": "队伍 2阵营选择超时，自动分配为红色方",
  "map-extended": "队伍 1在第1张地图的选图时超时，已警告一次，并重新给予30秒选择时间",
  "map-awaiting": "队伍 1在第1张地图的攻防选择时超时，现等待管理员裁定",
  "map-resolved": "管理员已完成第1张地图的选图裁定：选择了漓江塔",
  "lineups-submitted": "双方已提交阵容",
  "lineup-admin": "管理员已为双方设置上场人员",
  "lineup-restarted": "双方上场人员选择均超时，已警告一次，并重新给予30秒选择时间",
  "lineup-extended": "双方队伍在第1张地图的上场人员确认时超时，已警告一次，并重新给予30秒选择时间",
  "lineup-awaiting": "双方队伍在第1张地图的上场人员确认时超时，现等待管理员裁定",
  "lineup-resolved": "管理员已完成第1张地图的上场人员确认裁定：双方阵容已确认",
  "ban-order": "队伍 1选择了先手禁用",
  "ban-order-admin": "管理员为队伍 2选择了后手禁用",
  "ban-order-timeout-random": "队伍 1选择禁用顺序超时，自动确定为后手禁用",
  "ban-order-timeout-first": "队伍 1选择禁用顺序超时，自动确定为先手禁用",
  "ban-order-timeout-second": "队伍 2选择禁用顺序超时，自动确定为后手禁用",
  "hero-ban": "队伍 1禁用了安娜",
  "hero-ban-admin": "管理员为队伍 2禁用了源氏",
  "hero-ban-random-admin": "管理员为队伍 1随机禁用了安娜",
  "hero-ban-timeout": "队伍 2英雄禁用超时，系统随机禁用了源氏",
  "interactive-ban": "交互随机结果为0 XOR 1 = 1，队伍 2获得Ban先手权",
  "interactive-ban-timeout": "队伍 2未提交随机值，系统随机补全为0；交互随机结果为1 XOR 0 = 1，队伍 1获得Ban先手权",
  "ban-extended": "队伍 1在第1张地图的先手英雄禁用时超时，已警告一次，并重新给予30秒选择时间",
  "ban-awaiting": "队伍 1在第1张地图的先手英雄禁用时超时，现等待管理员裁定",
  "ban-resolved": "管理员已完成第1张地图的先手英雄禁用裁定：为队伍 1禁用了安娜",
  "score-extended": "双方队伍在第1张地图的比分录入时超时，已警告一次，并重新给予30秒选择时间",
  "score-awaiting": "双方队伍在第1张地图的比分录入时超时，现等待管理员裁定",
  "score-resolved": "管理员已完成第1张地图的比分录入裁定：比分已确认",
  "score-auto-confirm": "队伍 2比分确认超时，系统自动确认比分为队伍 1 3:2 队伍 2",
  "global-pause-start": "管理员已暂停全局时间",
  "team-pause-end": "队伍 1结束暂停计时",
  "team-pause-auto-end": "队伍 1已达到暂停时长上限，暂停自动结束",
  "map-forfeited": "队伍 2在第1张地图的后手英雄禁用时超时，本张地图判负",
  "map-won": "队伍 1赢得本张地图",
  "match-won": "队伍 1赢得本场比赛",
};
