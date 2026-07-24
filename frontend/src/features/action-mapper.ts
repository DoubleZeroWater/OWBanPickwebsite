export type AuthoritativeActionSpec = { type: string; payload?: Record<string, unknown> };

type Side = "left" | "right";
type Operation = { category: string; action: string; details: Record<string, unknown> };
type LineupState = {
  mapIndex: number;
  values: Record<Side, Record<string, string>>;
};

export type ActionMapperContext = {
  isAdmin: boolean;
  portalSide: Side | null;
  interactiveRandom: { choices: Record<Side, number | null> } | null;
  lineup: LineupState | null;
  confirmedLineups: Record<number, Record<Side, Record<string, string>>>;
  score: { values: Record<Side, string> } | null;
  stableId: (value: string) => string;
};

export function mapOperationToActions(operation: Operation, context: ActionMapperContext): AuthoritativeActionSpec[] {
  const { category, action, details } = operation;
  if (category === "room" && action === "started") {
    return [{ type: "match_start", payload: { force: details.startKind === "force" } }];
  }
  if (category === "room" && action === "interactive_random_submitted"
    && context.interactiveRandom && context.portalSide) {
    return [{ type: "interactive_random_submit", payload: { value: context.interactiveRandom.choices[context.portalSide] } }];
  }
  if (category === "map" && action === "confirmed") {
    return [{ type: "map_select", payload: { mapId: context.stableId(String(details.mapName ?? "")) } }];
  }
  if (category === "map" && action === "side_choice_confirmed") {
    return [{ type: "side_select", payload: { selectedSide: details.selectedSide } }];
  }
  if (category === "lineup" && (action === "ready" || action === "confirmed")) {
    const mapIndex = Number(details.mapIndex ?? context.lineup?.mapIndex ?? 0);
    const values = context.confirmedLineups[mapIndex] ?? context.lineup?.values;
    if (!values) return [];
    const sides: Side[] = context.isAdmin ? ["left", "right"] : context.portalSide ? [context.portalSide] : [];
    return sides.map((side) => ({
      type: "lineup_submit",
      payload: {
        side,
        lineup: Object.fromEntries(Object.entries(values[side]).map(([key, value]) => [key.replaceAll("-", "_"), value])),
      },
    }));
  }
  if (category === "ban" && action === "order_confirmed") {
    return [{ type: "ban_order_select", payload: { choice: details.firstBanSide === details.chooserSide ? "first" : "second" } }];
  }
  if (category === "ban" && action === "hero_confirmed") {
    return [{ type: "hero_ban_select", payload: { heroId: context.stableId(String(details.hero ?? "")) } }];
  }
  if (category === "score" && action === "submitted" && context.score) {
    return [{ type: "score_submit", payload: { score: {
      left: Number(context.score.values.left), right: Number(context.score.values.right),
    } } }];
  }
  if (category === "score" && action === "confirmed") {
    if (context.isAdmin) {
      return [{ type: "score_submit", payload: { score: {
        left: Number(details.leftScore), right: Number(details.rightScore),
      } } }];
    }
    return [{ type: "score_confirm" }];
  }
  if (category === "score" && action === "rejected") return [{ type: "score_reject" }];
  if (category === "rest" && ["skip_requested", "finished"].includes(action)) return [{ type: "rest_skip" }];
  if (["map", "ban", "lineup"].includes(category) && action === "forfeited") {
    return [{ type: "map_forfeit", payload: { loserSide: details.loserSide, reason: `${category}_timeout` } }];
  }
  if (["map", "ban", "lineup"].includes(category) && action === "timeout_extended") {
    return [{ type: "timeout_resolve", payload: { resolution: "extend_30" } }];
  }
  if (category === "pause" && action === "started") return [{ type: "global_pause_set", payload: { active: true } }];
  if (category === "pause" && action === "resumed") return [{ type: "global_pause_set", payload: { active: false } }];
  if (category === "pause" && action.startsWith("score_team_")) {
    return [{ type: "score_pause_set", payload: { side: details.side, active: action === "score_team_started" } }];
  }
  return [];
}
