import { normalizeKey } from "../../utils";
import type {
  MapAvailability,
  MapCatalogState,
  MapChoice,
  MapSelectorState,
  MatchState,
  SettingsState,
} from "../../types";

interface MapRuleContext {
  getState: () => MatchState | null;
  getSettings: () => SettingsState;
  getSelector: () => MapSelectorState | null;
  getCatalog: () => MapCatalogState;
  getMapKey: (mode: string, nameEn: string) => string;
  getModeIconUrl: (mode: string) => string | null;
  getMapName: (nameEn: string) => string;
  getModeLabel: (mode: string) => string;
}

export function createMapRules(context: MapRuleContext) {
  const configuredModes = (): string[] => Object.entries(context.getSettings().mapPool)
    .filter(([, maps]) => Array.isArray(maps) && maps.length > 0)
    .map(([mode]) => mode);

  const fixedOrder = (): string[] => context.getSettings().fixedMapOrderText
    .split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const usedMapNames = (): Set<string> => {
    const state = context.getState();
    const selector = context.getSelector();
    if (!state || !selector) return new Set();
    return new Set(state.maps
      .filter((map, index) => index !== selector.targetMapIndex && map.nameEn)
      .map((map) => normalizeKey(map.nameEn!)));
  };

  const isInPool = (choice: MapChoice): boolean => {
    const names = context.getSettings().mapPool[choice.mode] ?? [];
    const key = normalizeKey(choice.nameEn);
    return names.some((name) => normalizeKey(name) === key);
  };

  const modeOrder = (): string[] => {
    const settings = context.getSettings();
    return settings.modeOrder.length ? settings.modeOrder : configuredModes();
  };

  const requiredStrictMode = (): string | null => {
    const selector = context.getSelector();
    const modes = modeOrder();
    return selector && modes.length ? modes[selector.targetMapIndex % modes.length] : null;
  };

  const isModeBlocked = (mode: string): boolean => {
    const selector = context.getSelector();
    const modes = [...new Set(modeOrder())];
    const cycle = new Set<string>();
    context.getState()?.maps.slice(0, selector?.targetMapIndex ?? 0).forEach((map) => {
      if (!map.mode || !modes.includes(map.mode)) return;
      cycle.add(map.mode);
      if (cycle.size === modes.length) cycle.clear();
    });
    return cycle.has(mode);
  };

  const fixedAvailability = (choice: MapChoice): MapAvailability => {
    const selector = context.getSelector();
    if (!selector) return { available: false, reason: "当前没有选图步骤" };
    const requiredMap = fixedOrder()[selector.targetMapIndex];
    if (!requiredMap) return { available: false, reason: `未配置第 ${selector.targetMapIndex + 1} 张` };
    return normalizeKey(choice.nameEn) === normalizeKey(requiredMap)
      ? { available: true, reason: "" }
      : { available: false, reason: `固定为 ${requiredMap}` };
  };

  const getMapAvailability = (choice: MapChoice): MapAvailability => {
    const selector = context.getSelector();
    const settings = context.getSettings();
    if (!selector) return { available: false, reason: "当前没有选图步骤" };
    if (!isInPool(choice)) return { available: false, reason: "未加入地图池" };
    if (usedMapNames().has(normalizeKey(choice.nameEn))) return { available: false, reason: "本场已使用" };
    if (settings.mapSelectionMode === "fixed_map_order") return fixedAvailability(choice);
    if (selector.targetMapIndex === 0 && settings.fixedFirstMapEnabled
      && normalizeKey(choice.nameEn) !== normalizeKey(settings.fixedFirstMapName)) {
      return { available: false, reason: `首图固定为 ${context.getMapName(settings.fixedFirstMapName)}` };
    }
    if (settings.mapSelectionMode === "strict_mode_order") {
      const requiredMode = requiredStrictMode();
      if (requiredMode && choice.mode !== requiredMode) {
        return { available: false, reason: `本轮限定${context.getModeLabel(requiredMode)}` };
      }
    }
    if (settings.mapSelectionMode === "first_mode_then_unique_mode") {
      if (selector.targetMapIndex === 0 && choice.mode !== settings.firstMapMode) {
        return { available: false, reason: `首图限定${context.getModeLabel(settings.firstMapMode)}` };
      }
      if (selector.targetMapIndex > 0 && isModeBlocked(choice.mode)) {
        return { available: false, reason: "需先轮完地图类型" };
      }
    }
    if (settings.mapSelectionMode === "unique_mode_until_cycle" && isModeBlocked(choice.mode)) {
      return { available: false, reason: "需先轮完地图类型" };
    }
    return { available: true, reason: "" };
  };

  const getMapChoicesByMode = (mode: string): MapChoice[] => {
    const names = new Set((context.getSettings().mapPool[mode] ?? []).map(normalizeKey));
    return (context.getCatalog().maps[mode] ?? [])
      .filter((map) => names.has(normalizeKey(map.nameEn)))
      .map((map) => ({
        ...map,
        key: context.getMapKey(map.mode, map.nameEn),
        modeIconUrl: context.getModeIconUrl(map.mode),
      }));
  };

  const getSelectorModeOrder = (): string[] => configuredModes();
  const getLegalMapChoices = (): MapChoice[] => getSelectorModeOrder()
    .flatMap(getMapChoicesByMode).filter((choice) => getMapAvailability(choice).available);

  return {
    getMapAvailability,
    isUsedMapChoice: (choice: MapChoice): boolean => usedMapNames().has(normalizeKey(choice.nameEn)),
    getConfiguredModeOrder: configuredModes,
    parseFixedMapOrder: fixedOrder,
    getSelectorModeOrder,
    getMapChoicesByMode,
    getLegalMapChoices,
    findMapChoiceByKey(mapKey: string | null): MapChoice | null {
      return mapKey
        ? getSelectorModeOrder().flatMap(getMapChoicesByMode).find((choice) => choice.key === mapKey) ?? null
        : null;
    },
  };
}
