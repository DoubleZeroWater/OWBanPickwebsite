import { normalizeRosterValue } from "../../shared/format";
import type { LineupSelectorState, LineupSlot, Side } from "../../types";

export function createLineupModel(
  slots: LineupSlot[],
  getSelector: () => LineupSelectorState | null,
) {
  const createEmptyLineupValues = (): Record<string, string> =>
    Object.fromEntries(slots.map((slot) => [slot.id, ""]));

  const getDuplicateLineupValues = (values: Record<string, string>): Set<string> => {
    const counts = new Map<string, number>();
    slots.forEach((slot) => {
      const normalized = normalizeRosterValue(values[slot.id] ?? "");
      if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });
    return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
  };

  const isSideLineupComplete = (values: Record<string, string>): boolean =>
    slots.every((slot) => (values[slot.id] ?? "").trim().length > 0)
    && getDuplicateLineupValues(values).size === 0;

  return {
    createEmptyLineupValues,
    createInitialLineupValues: (): Record<Side, Record<string, string>> => ({
      left: createEmptyLineupValues(),
      right: createEmptyLineupValues(),
    }),
    createLineupReadyState: (): Record<Side, boolean> => ({ left: false, right: false }),
    cloneLineupValues: (values: Record<Side, Record<string, string>>): Record<Side, Record<string, string>> => ({
      left: { ...values.left },
      right: { ...values.right },
    }),
    isLineupComplete: (): boolean => {
      const selector = getSelector();
      return Boolean(selector && (["left", "right"] as Side[])
        .every((side) => isSideLineupComplete(selector.values[side])));
    },
    isSideLineupComplete,
    getDuplicateLineupValues,
  };
}
