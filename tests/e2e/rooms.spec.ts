import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test.describe.configure({ mode: "serial" });

const runtimeStorePath = resolve(process.env.OW_RUNTIME_DIR ?? "backend/data/runtime", "rooms.json");

interface RoomLink {
  hash: string;
  url: string;
}

interface CreatedRoom {
  roomId: string;
  archiveKey: string;
  links: Record<string, RoomLink>;
}

test("landing page joins rooms, creates role entrances, copies hashes, and stays responsive", async ({ page, baseURL }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "守望先锋赛事BP房间" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "已有房间" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "创建房间" })).toBeVisible();
  const initialPanelHeights = await page.locator(".landing-panel").evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().height)
  ));
  expect(initialPanelHeights[0]).toBe(initialPanelHeights[1]);

  await page.setViewportSize({ width: 320, height: 900 });
  await expect(page.locator(".landing-layout")).toHaveCSS("grid-template-columns", "300px");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });

  const hashInput = page.locator("#joinRoomHash");
  await hashInput.fill("A-7@K2");
  await expect(hashInput).toHaveValue("a7k2");
  await hashInput.fill("a7");
  await page.getByRole("button", { name: "进入房间" }).click();
  await expect(page.getByText("请输入完整的 4 位数字或小写字母哈希。")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.route("**/api/rooms/token/miss", (route) => route.fulfill({
    status: 404,
    contentType: "application/json",
    body: JSON.stringify({ error: "not_found" }),
  }));
  await hashInput.fill("MISS");
  await page.getByRole("button", { name: "进入房间" }).click();
  await expect(page.getByText("房间入口不存在，请检查哈希。")).toBeVisible();
  await page.unroute("**/api/rooms/token/miss");

  await page.route("**/api/rooms/token/netw", (route) => route.abort());
  await hashInput.fill("netw");
  await page.getByRole("button", { name: "进入房间" }).click();
  await expect(page.getByText("网络连接失败，请稍后重试。")).toBeVisible();
  await page.unroute("**/api/rooms/token/netw");

  let releaseCreateResponse: (() => void) | null = null;
  const createResponseGate = new Promise<void>((resolvePromise) => {
    releaseCreateResponse = resolvePromise;
  });
  await page.route("**/api/rooms", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await createResponseGate;
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "failed" }) });
  });
  const createButton = page.locator("#createRoomButton");
  const createClick = createButton.click();
  await expect(createButton).toBeDisabled();
  releaseCreateResponse?.();
  await createClick;
  await expect(page.getByText("创建房间失败，请稍后重试。")).toBeVisible();
  await expect(page.getByRole("button", { name: "创建房间" })).toBeEnabled();
  await page.unroute("**/api/rooms");

  const room = await createRoom(page);
  await expect(page.getByRole("button", { name: "创建房间" })).toHaveCount(0);
  const createdPanelHeights = await page.locator(".landing-panel").evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().height)
  ));
  expect(createdPanelHeights[1]).toBeGreaterThan(createdPanelHeights[0]);
  await expect(page.locator(".room-link-role span:last-child")).toHaveText([
    "队伍1入口",
    "队伍2入口",
    "管理员入口",
    "直播入口",
  ]);

  const origin = new URL(baseURL ?? "http://127.0.0.1:5175").origin;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const redCard = page.locator(".room-link-card", { hasText: "队伍1入口" });
  await redCard.locator(".copy-room-hash-button").click();
  await expect(page.getByText(`队伍1入口 ${room.links.A.hash} 已复制。`)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(room.links.A.hash);

  await Promise.all([
    page.waitForURL(`**/r/${room.links.A.hash}`),
    redCard.getByRole("link", { name: "进入" }).click(),
  ]);
  await expect(page.locator(".portal-badge")).toHaveText("队伍1入口");

  await page.goto("/");
  await page.locator("#joinRoomHash").fill(room.links.A.hash.toUpperCase());
  await Promise.all([
    page.waitForURL(`**/r/${room.links.A.hash}`),
    page.getByRole("button", { name: "进入房间" }).click(),
  ]);
  await expect(page.locator(".portal-badge")).toHaveText("队伍1入口");
});

test("room hashes, admin dashboard, sync, expiration, and rate limit", async ({ page, baseURL }) => {
  const firstRoom = await createRoom(page);
  expect(Object.keys(firstRoom.links)).toEqual(["A", "B", "C", "D"]);
  expect(firstRoom.roomId).toMatch(/^[0-9a-z]{4}$/);
  Object.values(firstRoom.links).forEach((link) => expect(link.hash).toMatch(/^[0-9a-z]{4}$/));
  expect(new Set(Object.values(firstRoom.links).map((link) => link.hash)).size).toBe(4);
  expect(new Set([firstRoom.roomId, ...Object.values(firstRoom.links).map((link) => link.hash)]).size).toBe(5);

  await page.goto(firstRoom.links.C.url);
  await expect(page.locator(".portal-badge")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "比赛配置" })).toBeVisible();

  const team1Page = await page.context().newPage();
  await team1Page.goto(firstRoom.links.A.url);
  await expect(team1Page.locator(".portal-badge")).toHaveText("队伍1入口");
  const team2Page = await page.context().newPage();
  await team2Page.goto(firstRoom.links.B.url);
  await expect(team2Page.locator(".portal-badge")).toHaveText("队伍2入口");
  await team1Page.keyboard.press("i");
  await expect(team1Page.getByRole("heading", { name: "比赛配置" })).toHaveCount(0);

  await page.locator("details", { hasText: "地图设置" }).locator("summary").click();
  await page.locator("#fixedFirstMapEnabled").uncheck();
  await expect(page.locator("#firstMapPickerPolicy")).toBeEnabled();
  await page.locator("#firstMapPickerPolicy").selectOption("interactive_random");
  await page.locator("#confirmRoomConfig").click();
  await expect(page.locator(".match-phase-label")).toHaveText("确认配置阶段");
  await expect(team1Page.getByRole("button", { name: "是" })).toBeVisible();
  await expect(team2Page.getByRole("button", { name: "是" })).toBeVisible();
  await team1Page.getByRole("button", { name: "是" }).click();
  await team2Page.getByRole("button", { name: "是" }).click();
  await page.locator("#startMatchFromSettings").click();
  await expect(team1Page.locator(".match-phase-label")).toHaveText("比赛进行阶段", { timeout: 10_000 });
  await team1Page.getByRole("dialog", { name: "比赛通知" }).getByRole("button", { name: "确认" }).click();
  await team2Page.getByRole("dialog", { name: "比赛通知" }).getByRole("button", { name: "确认" }).click();
  await expect(team1Page.locator('.interactive-random-choice:not(:disabled)', { hasText: "1" })).toBeVisible();
  await team1Page.locator('.interactive-random-choice:not(:disabled)', { hasText: "1" }).click();
  await expect(team2Page.locator('.interactive-random-choice:not(:disabled)', { hasText: "0" })).toBeVisible({ timeout: 10_000 });
  await team2Page.locator('.interactive-random-choice:not(:disabled)', { hasText: "0" }).click();
  await expect(page.getByText("1 XOR 0 = 1", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "继续" }).click();
  await team1Page.close();
  await team2Page.close();

  const autoStartRoom = await createRoom(page);
  await page.goto(autoStartRoom.links.C.url);
  await page.locator("#teamsCanEditOwnName").check();
  await page.locator("#startWithDefaultConfig").check();
  const autoTeam1Page = await page.context().newPage();
  const autoTeam2Page = await page.context().newPage();
  await autoTeam1Page.goto(autoStartRoom.links.A.url);
  await autoTeam2Page.goto(autoStartRoom.links.B.url);
  await expect(autoTeam1Page.getByRole("dialog", { name: "赛前准备" })).toBeVisible();
  await expect(autoTeam1Page.getByRole("button", { name: "确认队伍名称" })).toHaveCount(0);
  const modalPosition = await autoTeam1Page.locator(".start-gate-team-modal").evaluate((element) => (
    getComputedStyle(element).position
  ));
  expect(modalPosition).toBe("fixed");
  await autoTeam1Page.getByRole("textbox", { name: "队伍名称" }).fill("A队");
  await autoTeam2Page.getByRole("textbox", { name: "队伍名称" }).fill("B队");
  await autoTeam1Page.getByRole("button", { name: "是" }).click();
  await expect(autoTeam2Page.getByRole("textbox", { name: "队伍名称" })).toHaveValue("B队");
  await autoTeam2Page.getByRole("button", { name: "是" }).click();
  await expect(autoTeam1Page.locator(".match-phase-label")).toHaveText("比赛进行阶段", { timeout: 10_000 });
  await expect(autoTeam2Page.locator(".room-presence-left strong")).toHaveText("A队");
  await expect(autoTeam2Page.locator(".room-presence-right strong")).toHaveText("B队");
  await autoTeam1Page.close();
  await autoTeam2Page.close();

  const adminHash = readAdminHash();
  await page.goto(`${baseURL}/admin/${adminHash}`);
  await expect(page.getByText("全局管理")).toBeVisible();
  const activeRoomCard = page.locator(".active-admin-room-card", { hasText: firstRoom.roomId });
  await expect(activeRoomCard.getByText(`房间 ${firstRoom.roomId}`, { exact: true })).toBeVisible();
  await expect(activeRoomCard.getByText("队伍1入口", { exact: true })).toBeVisible();
  await expect(activeRoomCard.getByText("队伍2入口", { exact: true })).toBeVisible();
  await expect(activeRoomCard).toContainText(/创建：\d{4}\/\d{1,2}\/\d{1,2} \d{2}:\d{2}:\d{2}/);

  await page.locator("#adminRoomsPerHour").fill("5");
  await page.locator("#adminInactiveTimeout").fill("1");
  await page.getByRole("button", { name: "新建模板" }).click();
  await page.locator("#globalPresetName").fill("E2E FT2 杯赛");
  await page.locator("#matchFormat").selectOption("ft2");
  await page.getByRole("button", { name: "保存模板" }).click();
  await expect(page.getByText("模板“E2E FT2 杯赛”已保存。")).toBeVisible();
  await page.locator("#adminDefaultPreset").selectOption({ label: "E2E FT2 杯赛" });
  await page.getByRole("button", { name: "保存全局设置" }).click();
  await expect(page.getByText("全局设置已保存。")).toBeVisible();

  const defaultRoom = await createRoom(page);
  await page.goto(defaultRoom.links.C.url);
  await expect(page.locator(".match-title").getByText("FT2", { exact: true })).toBeVisible();

  await page.goto(`${baseURL}/admin/${adminHash}`);
  await page.locator(".admin-room-card", { hasText: firstRoom.roomId }).getByRole("button", { name: "关闭房间" }).click();
  await expect(page.getByText("房间已关闭。")).toBeVisible();
  const historyCard = page.locator(".history-room-row", { hasText: firstRoom.archiveKey });
  await expect(historyCard.getByText("手动关闭")).toBeVisible();
  await historyCard.getByRole("button", { name: "查看" }).click();
  const historyDialog = page.locator("#roomHistoryDialog");
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.locator("pre")).toContainText('"status": "closed"');
  await expect(historyDialog.locator("pre")).toContainText('"action": "closed"');

  const download = await page.request.get(
    `${baseURL}/api/admin/${adminHash}/room-history/${firstRoom.archiveKey}/download`,
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-disposition"]).toContain(`${firstRoom.archiveKey}.json`);
  await historyDialog.getByRole("button", { name: "关闭历史详情" }).click();

  await page.goto("/");
  await page.locator("#joinRoomHash").fill(firstRoom.links.C.hash);
  await page.getByRole("button", { name: "进入房间" }).click();
  await expect(page.getByText("房间已经关闭或因不活跃而过期。")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.goto(firstRoom.links.C.url);
  await expect(page.getByText("房间已经关闭或因不活跃而过期。")).toBeVisible();

  const staleRoom = await createRoom(page);
  markRoomInactive(staleRoom.roomId);
  await page.goto(staleRoom.links.A.url);
  await expect(page.getByText("房间已经关闭或因不活跃而过期。")).toBeVisible();

  await expectEventuallyRateLimited(page);
});

test("global admin refreshes the English catalog and edits the Chinese mapping", async ({ page, baseURL }) => {
  const adminHash = readAdminHash();
  const template = {
    schemaVersion: 1,
    catalogHash: "sha256:new",
    modes: { Escort: "" },
    maps: { "Circuit Royal": "" },
    heroes: { Ana: "" },
  };
  const diagnostics = {
    valid: true,
    versionMismatch: false,
    hashMismatch: false,
    missing: { modes: [], maps: [], heroes: [] },
    extra: { modes: [], maps: [], heroes: [] },
    blank: { modes: [], maps: [], heroes: [] },
    typeErrors: [],
  };
  const maintenance = {
    catalogHash: "sha256:current",
    catalogSource: "bundled",
    sources: { heroes: "https://overwatch.fandom.com/wiki/Heroes", maps: "https://overwatch.fandom.com/wiki/Overwatch_Wiki" },
    updatedAt: Math.floor(Date.now() / 1000),
    counts: { modes: 5, maps: 30, heroes: 52 },
    translation: { source: "bundled", active: true, diagnostics, document: template },
    translationTemplate: template,
    job: null,
  };

  await page.route("**/api/admin/*/catalog-maintenance", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(maintenance),
  }));
  await page.route("**/api/admin/*/catalog-refresh", (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ id: "job-1", status: "running", stage: "fetch", progress: 10, message: "正在读取", error: null }),
  }));
  await page.route("**/api/admin/*/catalog-refresh/job-1", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "job-1",
      status: "completed",
      stage: "completed",
      progress: 100,
      message: "完成",
      error: null,
      result: { counts: { modes: 5, maps: 30, heroes: 52 }, catalogHash: "sha256:new", translationTemplate: template },
    }),
  }));
  await page.route("**/api/admin/*/catalog-translation", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ active: false, diagnostics: { ...diagnostics, valid: false, hashMismatch: true } }),
  }));

  const origin = new URL(baseURL ?? "http://127.0.0.1:5175").origin;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.goto(`${baseURL}/admin/${adminHash}`);
  await expect(page.getByRole("heading", { name: "英雄与地图数据" })).toBeVisible();
  await expect(page.getByText("52 英雄 · 30 地图")).toBeVisible();

  await page.getByRole("button", { name: "爬取英文更新" }).click();
  const templateDialog = page.getByRole("dialog", { name: "英文到中文映射模板" });
  await expect(templateDialog).toBeVisible({ timeout: 5_000 });
  await expect(templateDialog.locator("textarea")).toContainText('"Circuit Royal"');
  await expect(templateDialog.locator("footer span")).toContainText(/已自动复制|请按 Ctrl\+C/);
  await templateDialog.getByRole("button", { name: "关闭映射模板" }).click();

  await page.getByRole("button", { name: "更新中文映射" }).click();
  const translationDialog = page.getByRole("dialog", { name: "更新中文映射" });
  await translationDialog.locator("textarea").fill("{not-json");
  await translationDialog.getByRole("button", { name: "保存映射" }).click();
  await expect(translationDialog.getByText("JSON 格式错误，旧映射未被覆盖。")).toBeVisible();
  await translationDialog.locator("textarea").fill(JSON.stringify({ schemaVersion: 1 }));
  await translationDialog.getByRole("button", { name: "保存映射" }).click();
  await expect(page.getByText("中文映射已保存，但与当前目录不匹配；网站现统一显示英文。")).toBeVisible();
});

async function createRoom(page: Page): Promise<CreatedRoom> {
  await page.goto("/");
  await page.getByRole("button", { name: "创建房间" }).click();
  await expect(page.getByText("房间已创建")).toBeVisible();

  const links: Record<string, RoomLink> = {};

  for (const code of ["A", "B", "C", "D"]) {
    const card = page.locator(`.room-link-card-${code.toLowerCase()}`);
    const url = await card.locator(".enter-room-link").getAttribute("href");
    const hash = await card.locator(".copy-room-hash-button").innerText();

    if (!url) {
      throw new Error(`Missing ${code} room URL`);
    }

    links[code] = { hash, url };
  }

  const store = readStore();
  const matchedRoom = store.rooms.find((room: any) => room.tokens.C === links.C.hash);

  return {
    roomId: matchedRoom.id,
    archiveKey: ["A", "B", "C", "D"].map((code) => links[code].hash).join("-"),
    links,
  };
}

async function expectEventuallyRateLimited(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.goto("/");
    await page.getByRole("button", { name: "创建房间" }).click();

    const rateLimited = page.getByText("创建过于频繁，请稍后再试。");

    try {
      await expect(rateLimited).toBeVisible({ timeout: 1500 });
      return;
    } catch {
      await expect(page.getByText("房间已创建")).toBeVisible();
    }
  }

  throw new Error("Expected room creation to become rate limited");
}

function readAdminHash(): string {
  return readStore().adminHash;
}

function markRoomInactive(roomId: string): void {
  const store = readStore();
  const room = store.rooms.find((entry: any) => entry.id === roomId);

  if (!room) {
    throw new Error(`Missing room ${roomId}`);
  }

  room.lastActiveAt = Math.floor(Date.now() / 1000) - 3600;
  room.closedAt = null;
  writeFileSync(runtimeStorePath, JSON.stringify(store, null, 2), "utf-8");
}

function readStore(): any {
  return JSON.parse(readFileSync(runtimeStorePath, "utf-8"));
}
