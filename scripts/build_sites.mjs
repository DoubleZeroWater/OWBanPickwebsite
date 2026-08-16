import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const assets = JSON.parse(await readFile(resolve(root, "backend/data/assets.json"), "utf8"));
const translation = JSON.parse(await readFile(resolve(root, "backend/data/catalog_translation.zh-CN.json"), "utf8"));

const normalizeKey = (value) =>
  value
    .normalize("NFKD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .replaceAll(/[^\p{Letter}\p{Number}]/gu, "")
    .toLowerCase();

const findMap = (mode, nameEn) =>
  (assets.maps?.[mode] ?? []).find((map) => map.nameEn === nameEn);
const findHero = (nameEn) =>
  (assets.heroes ?? []).find((hero) => normalizeKey(hero.nameEn) === normalizeKey(nameEn));
const mapImage = (mode, nameEn) =>
  findMap(mode, nameEn)?.imageUrl ?? "/static/placeholders/map-blank.svg";
const modeIcon = (mode) => assets.modeIcons?.[mode]?.imageUrl ?? null;
const heroBan = (nameEn, hero, role) => ({
  hero,
  nameEn,
  role,
  imageUrl: findHero(nameEn)?.imageUrl ?? "/static/placeholders/hero-blank.svg",
});

const catalogKeys = {
  modes: assets.modes ?? [],
  maps: [...new Set(Object.values(assets.maps ?? {}).flat().map((map) => map.nameEn))].sort((a, b) => a.localeCompare(b, "en")),
  heroes: [...new Set((assets.heroes ?? []).map((hero) => hero.nameEn))].sort((a, b) => a.localeCompare(b, "en")),
};
const translationActive = translation.schemaVersion === 1
  && translation.catalogHash === assets.catalogHash
  && ["modes", "maps", "heroes"].every((category) => {
    const expected = catalogKeys[category];
    const values = translation[category];
    return values && Object.keys(values).length === expected.length
      && expected.every((key) => typeof values[key] === "string" && values[key].trim());
  });

const mapCatalog = {
  modes: assets.modes ?? Object.keys(assets.maps ?? {}),
  modeIcons: assets.modeIcons ?? {},
  roleIcons: assets.roleIcons ?? {},
  maps: assets.maps ?? {},
  heroes: assets.heroes ?? [],
  catalogHash: assets.catalogHash ?? "",
  locale: translationActive ? "zh-CN" : "en",
  translation: {
    active: translationActive,
    modes: translationActive ? translation.modes : {},
    maps: translationActive ? translation.maps : {},
    heroes: translationActive ? translation.heroes : {},
  },
};

const matchState = {
  roomCode: "default",
  matchName: "OW Ban Pick Invitational",
  phase: "after",
  currentCountdownSeconds: 116,
  currentOperation: "等待赛事管理员根据选择设置下一张地图",
  teams: {
    left: { id: "team-a", name: "蓝色方", seriesScore: 1, seed: 1 },
    right: { id: "team-b", name: "红色方", seriesScore: 0, seed: 2 },
  },
  maps: [
    {
      id: "lijang-tower",
      mode: "Control",
      modeIconUrl: modeIcon("Control"),
      nameZh: "漓江塔",
      nameEn: "Lijiang Tower",
      status: "completed",
      imageUrl: mapImage("Control", "Lijiang Tower"),
      score: { left: 2, right: 1 },
      bans: {
        left: heroBan("Ana", "安娜", "支援"),
        right: heroBan("Tracer", "猎空", "输出"),
      },
      firstBanSide: "left",
    },
    {
      id: "kings-row",
      mode: "Hybrid",
      modeIconUrl: modeIcon("Hybrid"),
      nameZh: "国王大道",
      nameEn: "King's Row",
      status: "after",
      imageUrl: mapImage("Hybrid", "King's Row"),
      score: { left: null, right: null },
      bans: {
        left: heroBan("Mauga", "毛加", "重装"),
        right: heroBan("Lúcio", "卢西奥", "支援"),
      },
      firstBanSide: "right",
    },
    ...Array.from({ length: 3 }, (_, index) => ({
      id: `tbd-${index + 3}`,
      mode: null,
      modeIconUrl: null,
      nameZh: null,
      nameEn: null,
      status: "tbd",
      imageUrl: "/static/placeholders/map-blank.svg",
      score: { left: null, right: null },
      bans: { left: null, right: null },
      firstBanSide: null,
    })),
  ],
};

const workerSource = [
  "const mapCatalog = ",
  JSON.stringify(mapCatalog),
  ";\nconst matchState = ",
  JSON.stringify(matchState),
  `;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const withOriginMetadata = async (response, origin) => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response((await response.text()).replaceAll("__SITE_ORIGIN__", origin), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/maps/catalog") {
      return json(mapCatalog);
    }

    if (request.method === "GET" && /^\\/api\\/matches\\/[^/]+\\/state$/.test(url.pathname)) {
      const roomCode = decodeURIComponent(url.pathname.split("/")[3]);
      return json({ ...matchState, roomCode });
    }

    if (url.pathname === "/api/settings/preset") {
      return request.method === "GET"
        ? json({ presets: {}, last: null })
        : json({ ok: true, mode: "sites-showcase" });
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const roleByCode = {
        A: { role: "red-team", label: "红色队入口", side: "right" },
        B: { role: "blue-team", label: "蓝色队入口", side: "left" },
        C: { role: "admin", label: "管理员入口", side: null },
        D: { role: "broadcast", label: "直播入口", side: null },
      };
      const links = Object.fromEntries(
        Object.entries(roleByCode).map(([code, details]) => [
          code,
          { code, hash: "demo", url: url.origin + "/" + code, ...details },
        ]),
      );
      return json({ roomId: "demo", createdAt: Date.now(), lastActiveAt: Date.now(), links });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "frontend_showcase_only" }, 501);
    }

    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === "GET") {
      response = await env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return withOriginMetadata(response, url.origin);
  },
};
`,
].join("");

await mkdir(resolve(dist, "server"), { recursive: true });
await mkdir(resolve(dist, ".openai"), { recursive: true });
await mkdir(resolve(dist, "client"), { recursive: true });
await cp(resolve(root, "static"), resolve(dist, "static"), { recursive: true });
await cp(resolve(dist, "index.html"), resolve(dist, "client/index.html"));
await cp(resolve(dist, "assets"), resolve(dist, "client/assets"), { recursive: true });
await cp(resolve(root, "static"), resolve(dist, "client/static"), { recursive: true });
await cp(resolve(root, ".openai/hosting.json"), resolve(dist, ".openai/hosting.json"));
await writeFile(resolve(dist, "server/index.js"), workerSource, "utf8");
