import { normalizeKey } from "../../utils";

export function getHeroRoleKeyFromText(role: string): string {
  const normalized = normalizeKey(role);
  if (normalized.includes("tank") || role.includes("重装") || role.includes("坦克")) return "tank";
  if (normalized.includes("damage") || normalized.includes("offense") || role.includes("输出")) return "damage";
  if (normalized.includes("support") || role.includes("支援") || role.includes("辅助")) return "support";
  return normalized;
}

export function getHeroRoleLabel(role: string): string {
  return ({ tank: "坦克", damage: "输出", support: "支援" } as Record<string, string>)[getHeroRoleKeyFromText(role)] ?? role;
}
