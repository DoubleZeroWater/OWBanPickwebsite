export type AuthoritativeActionSpec = { type: string; payload?: Record<string, unknown> };

type Side = "left" | "right";
type Operation = { category: string; action: string; details: Record<string, unknown> };
type LineupState = {
  mapIndex: number;
  values: Record<Side, Record<string, string>>;
  ready: Record<Side, boolean>;
};

export type ActionMapperContext = {
  isAdmin: boolean;
  awaitingAdminDecision: boolean;
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
    if (context.isAdmin && context.awaitingAdminDecision) {
      return [{ type: "timeout_resolve", payload: { resolution: "select_map", mapId: context.stableId(String(details.mapName ?? "")) } }];
    }
    return [{ type: "map_select", payload: { mapId: context.stableId(String(details.mapName ?? "")) } }];
  }
  if (category === "map" && action === "side_choice_confirmed") {
    if (context.isAdmin && context.awaitingAdminDecision) {
      return [{ type: "timeout_resolve", payload: { resolution: "select_side", selectedSide: details.selectedSide } }];
    }
    return [{ type: "side_select", payload: { selectedSide: details.selectedSide } }];
  }
  if (category === "lineup" && (action === "ready" || action === "confirmed")) {
    const mapIndex = Number(details.mapIndex ?? context.lineup?.mapIndex ?? 0);
    const values = context.confirmedLineups[mapIndex] ?? context.lineup?.values;
    if (!values) return [];
    const sides: Side[] = context.isAdmin
      ? (["left", "right"] as Side[]).filter((side) => !context.lineup?.ready[side])
      : context.portalSide ? [context.portalSide] : [];
    if (context.isAdmin && context.awaitingAdminDecision) {
      return [{
        type: "timeout_resolve",
        payload: {
          resolution: "submit_lineup",
          lineups: Object.fromEntries(sides.map((side) => [
            side,
            Object.fromEntries(Object.entries(values[side]).map(([key, value]) => [key.replaceAll("-", "_"), value])),
          ])),
        },
      }];
    }
    return sides.map((side) => ({
      type: "lineup_submit",
      payload: {
        side,
        lineup: Object.fromEntries(Object.entries(values[side]).map(([key, value]) => [key.replaceAll("-", "_"), value])),
      },
    }));
  }
  if (category === "ban" && action === "order_confirmed") {
    if (context.isAdmin && context.awaitingAdminDecision) {
      return [{ type: "timeout_resolve", payload: {
        resolution: "select_ban_order",
        choice: details.firstBanSide === details.chooserSide ? "first" : "second",
      } }];
    }
    return [{ type: "ban_order_select", payload: { choice: details.firstBanSide === details.chooserSide ? "first" : "second" } }];
  }
  if (category === "ban" && action === "hero_confirmed") {
    if (context.isAdmin && context.awaitingAdminDecision) {
      return [{ type: "timeout_resolve", payload: { resolution: "select_hero", heroId: context.stableId(String(details.hero ?? "")) } }];
    }
    return [{ type: "hero_ban_select", payload: { heroId: context.stableId(String(details.hero ?? "")) } }];
  }
  if (category === "ban" && action === "random_legal_hero" && context.isAdmin && context.awaitingAdminDecision) {
    return [{ type: "timeout_resolve", payload: { resolution: "random_legal_hero" } }];
  }
  if (category === "score" && action === "submitted" && context.score) {
    return [{ type: "score_submit", payload: { score: {
      left: Number(context.score.values.left), right: Number(context.score.values.right),
    } } }];
  }
  if (category === "score" && action === "confirmed") {
    if (context.isAdmin) {
      if (context.awaitingAdminDecision) {
        return [{ type: "timeout_resolve", payload: { resolution: "replace_score", score: {
          left: Number(details.leftScore), right: Number(details.rightScore),
        } } }];
      }
      return [{ type: "score_submit", payload: { score: {
        left: Number(details.leftScore), right: Number(details.rightScore),
      } } }];
    }
    return [{ type: "score_confirm" }];
  }
  if (category === "score" && action === "rejected") return [{ type: "score_reject" }];
  if (category === "rest" && ["skip_requested", "finished"].includes(action)) return [{ type: "rest_skip" }];
  if (["map", "ban", "lineup"].includes(category) && action === "forfeited") {
    if (context.isAdmin && context.awaitingAdminDecision) {
      return [{ type: "timeout_resolve", payload: { resolution: "forfeit", loserSide: details.loserSide } }];
    }
    return [{ type: "map_forfeit", payload: { loserSide: details.loserSide, reason: `${category}_timeout` } }];
  }
  if (["map", "ban", "lineup"].includes(category) && action === "timeout_extended") {
    return [{ type: "timeout_resolve", payload: { resolution: "extend" } }];
  }
  if (category === "pause" && action === "started") return [{ type: "global_pause_set", payload: { active: true } }];
  if (category === "pause" && action === "resumed") return [{ type: "global_pause_set", payload: { active: false } }];
  if (category === "pause" && action.startsWith("score_team_")) {
    return [{ type: "score_pause_set", payload: { side: details.side, active: action === "score_team_started" } }];
  }
  if (category === "admin" && action === "series_winner") {
    return [{ type: "timeout_resolve", payload: { resolution: "series_winner", winnerSide: details.winnerSide } }];
  }
  if (category === "admin" && action === "interactive_random") {
    return [{ type: "timeout_resolve", payload: { resolution: "submit_interactive_random", values: details.values } }];
  }
  return [];
}
