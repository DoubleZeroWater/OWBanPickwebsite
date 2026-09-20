import { normalizeKey } from "../../utils";
import { getHeroRoleKeyFromText, getHeroRoleLabel } from "../heroes/roles";
import type { HeroBan, HeroCatalogItem, MapCatalogItem, MapCatalogState } from "../../types";

export function createCatalogView(getCatalog: () => MapCatalogState) {
  const allMaps = (): MapCatalogItem[] => {
    const catalog = getCatalog();
    return (catalog.modes.length ? catalog.modes : Object.keys(catalog.maps))
      .flatMap((mode) => catalog.maps[mode] ?? []);
  };

  const translate = (category: "modes" | "maps" | "heroes", nameEn: string): string => {
    const translation = getCatalog().translation;
    if (!translation?.active) return nameEn;
    const values = translation[category] ?? {};
    const exact = values[nameEn];
    if (exact) return exact;
    const normalized = normalizeKey(nameEn);
    return Object.entries(values).find(([key]) => normalizeKey(key) === normalized)?.[1] || nameEn;
  };

  const getHeroKey = (nameEn: string): string => normalizeKey(nameEn);
  const getHeroRoleKey = (hero: HeroCatalogItem): string => getHeroRoleKeyFromText(hero.role || hero.roleZh);

  return {
    getAllCatalogMapChoices: allMaps,
    findCatalogMapByName(nameEn: string): MapCatalogItem | null {
      const normalized = normalizeKey(nameEn);
      return nameEn ? allMaps().find((map) => normalizeKey(map.nameEn) === normalized) ?? null : null;
    },
    getMapKey: (mode: string, nameEn: string): string => `${normalizeKey(mode)}:${normalizeKey(nameEn)}`,
    getModeIconUrl: (mode: string): string | null => getCatalog().modeIcons[mode]?.imageUrl ?? null,
    getDisplayMapName: (nameEn: string): string => translate("maps", nameEn),
    getMapNameZh: (nameEn: string): string => translate("maps", nameEn),
    getModeLabel: (mode: string): string => translate("modes", mode),
    getHeroDisplayName: (nameEn: string): string => translate("heroes", nameEn),
    getHeroKey,
    getHeroRoleKey,
    getHeroesByRole(role: string): HeroCatalogItem[] {
      const roleKey = getHeroRoleKeyFromText(role);
      return getCatalog().heroes.filter((hero) => getHeroRoleKey(hero) === roleKey);
    },
    buildHeroPoolFromCatalog(): Record<string, string[]> {
      const pool: Record<string, string[]> = { tank: [], damage: [], support: [] };
      getCatalog().heroes.forEach((hero) => {
        const role = getHeroRoleKey(hero);
        const heroId = getHeroKey(hero.nameEn);
        if (role in pool && heroId && !pool[role].includes(heroId)) pool[role].push(heroId);
      });
      return pool;
    },
    findHeroByKey(heroKey: string | null): HeroCatalogItem | null {
      return heroKey
        ? getCatalog().heroes.find((hero) => getHeroKey(hero.nameEn) === heroKey) ?? null
        : null;
    },
    createHeroBan(hero: HeroCatalogItem): HeroBan {
      return { hero: hero.nameEn, nameEn: hero.nameEn, role: getHeroRoleLabel(hero.role), imageUrl: hero.imageUrl };
    },
    getRoleHeaderImageUrl(role: string): string {
      const roleKey = getHeroRoleKeyFromText(role);
      const roleName = ({ tank: "Tank", damage: "Damage", support: "Support" } as Record<string, string>)[roleKey];
      const catalogIcon = roleName ? getCatalog().roleIcons?.[roleName]?.imageUrl : undefined;
      if (catalogIcon) return catalogIcon;
      return {
        tank: "/static/role-icons/tank-3bafe60c3c79.png",
        damage: "/static/role-icons/damage-3ce6307df3d7.png",
        support: "/static/role-icons/support-02e199a6fb82.png",
      }[roleKey] ?? "/static/role-icons/damage-3ce6307df3d7.png";
    },
  };
}
