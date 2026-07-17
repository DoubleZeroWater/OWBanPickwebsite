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
  await expect(page.getByText(`队伍1入口哈希 ${room.links.A.hash} 已复制。`)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(room.links.A.hash);

  await Promise.all([
    page.waitForURL(`**/r/${room.links.A.hash}`),
    redCard.getByRole("link", { name: "进入" }).click(),
  ]);
  await expect(page.locator(".portal-badge")).toHaveText("红队入口");

  await page.goto("/");
  await page.locator("#joinRoomHash").fill(room.links.A.hash.toUpperCase());
  await Promise.all([
    page.waitForURL(`**/r/${room.links.A.hash}`),
    page.getByRole("button", { name: "进入房间" }).click(),
  ]);
  await expect(page.locator(".portal-badge")).toHaveText("红队入口");
});

test("room hashes, admin dashboard, sync, expiration, and rate limit", async ({ page, baseURL }) => {
  const firstRoom = await createRoom(page);
  expect(Object.keys(firstRoom.links)).toEqual(["A", "B", "C", "D"]);
  expect(firstRoom.roomId).toMatch(/^[0-9a-z]{4}$/);
  Object.values(firstRoom.links).forEach((link) => expect(link.hash).toMatch(/^[0-9a-z]{4}$/));
  expect(new Set(Object.values(firstRoom.links).map((link) => link.hash)).size).toBe(4);
  expect(new Set([firstRoom.roomId, ...Object.values(firstRoom.links).map((link) => link.hash)]).size).toBe(5);

  await page.goto(firstRoom.links.C.url);
  await expect(page.locator(".portal-badge")).toHaveText("房间管理员入口");
  await expect(page.getByRole("heading", { name: "比赛配置" })).toBeVisible();

  const redPage = await page.context().newPage();
  await redPage.goto(firstRoom.links.A.url);
  await expect(redPage.locator(".portal-badge")).toHaveText("红队入口");
  const bluePage = await page.context().newPage();
  await bluePage.goto(firstRoom.links.B.url);
  await expect(bluePage.locator(".portal-badge")).toHaveText("蓝队入口");
  await redPage.keyboard.press("i");
  await expect(redPage.getByRole("heading", { name: "比赛配置" })).toHaveCount(0);

  await page.locator("details", { hasText: "地图设置" }).locator("summary").click();
  await page.locator("#firstMapPickerPolicy").selectOption("interactive_random");
  await page.locator("#confirmRoomConfig").click();
  await expect(page.getByText("已确认，等待开始").first()).toBeVisible();
  await page.locator("#startMatchFromSettings").click();
  await expect(redPage.getByText("比赛尚未开始")).toHaveCount(0, { timeout: 10_000 });
  await expect(redPage.locator('.interactive-random-choice:not(:disabled)', { hasText: "1" })).toBeVisible();
  await redPage.locator('.interactive-random-choice:not(:disabled)', { hasText: "1" }).click();
  await expect(bluePage.locator('.interactive-random-choice:not(:disabled)', { hasText: "0" })).toBeVisible({ timeout: 10_000 });
  await bluePage.locator('.interactive-random-choice:not(:disabled)', { hasText: "0" }).click();
  await expect(page.getByText("0 XOR 1 = 1", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "继续" }).click();
  await redPage.close();
  await bluePage.close();

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
