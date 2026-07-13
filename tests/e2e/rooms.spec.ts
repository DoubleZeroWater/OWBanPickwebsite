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

test("room hashes, admin dashboard, sync, expiration, and rate limit", async ({ page, baseURL }) => {
  const firstRoom = await createRoom(page);
  expect(Object.keys(firstRoom.links)).toEqual(["A", "B", "C", "D"]);
  expect(firstRoom.roomId).toMatch(/^[0-9a-z]{4}$/);
  Object.values(firstRoom.links).forEach((link) => expect(link.hash).toMatch(/^[0-9a-z]{4}$/));
  expect(new Set(Object.values(firstRoom.links).map((link) => link.hash)).size).toBe(4);
  expect(new Set([firstRoom.roomId, ...Object.values(firstRoom.links).map((link) => link.hash)]).size).toBe(5);

  await page.goto(firstRoom.links.C.url);
  await expect(page.locator(".portal-badge")).toHaveText("房间管理员入口");
  await page.keyboard.press("i");
  await expect(page.getByText("详细设置")).toBeVisible();

  const redPage = await page.context().newPage();
  await redPage.goto(firstRoom.links.A.url);
  await expect(redPage.locator(".portal-badge")).toHaveText("红队入口");
  await redPage.keyboard.press("i");
  await expect(redPage.getByText("详细设置")).toHaveCount(0);

  await page.getByRole("button", { name: "开始比赛" }).click();
  await expect(redPage.getByText("比赛尚未开始")).toHaveCount(0, { timeout: 10_000 });
  await redPage.close();

  const adminHash = readAdminHash();
  await page.goto(`${baseURL}/admin/${adminHash}`);
  await expect(page.getByText("全局管理")).toBeVisible();
  const activeRoomCard = page.locator(".admin-room-card:not(.history-room-card)", { hasText: firstRoom.roomId });
  await expect(activeRoomCard.getByText(firstRoom.roomId, { exact: true })).toBeVisible();
  await expect(activeRoomCard.getByText("A · 红队入口")).toBeVisible();

  await page.locator("#adminRoomsPerHour").fill("5");
  await page.locator("#adminInactiveTimeout").fill("1");
  await page.locator("#adminDefaultSettings").fill(JSON.stringify({ matchFormat: "ft2" }, null, 2));
  await page.getByRole("button", { name: "保存全局设置" }).click();
  await expect(page.getByText("全局设置已保存。")).toBeVisible();

  const defaultRoom = await createRoom(page);
  await page.goto(defaultRoom.links.C.url);
  await expect(page.getByText("FT2")).toBeVisible();

  await page.goto(`${baseURL}/admin/${adminHash}`);
  await page.locator(".admin-room-card", { hasText: firstRoom.roomId }).getByRole("button", { name: "关闭房间" }).click();
  await expect(page.getByText("房间已关闭。")).toBeVisible();
  const historyCard = page.locator(".history-room-card", { hasText: firstRoom.archiveKey });
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
    const card = page.locator(".room-link-card", { hasText: `${code} ·` });
    const url = await card.locator("a").innerText();
    const hash = await card.locator("strong").innerText();
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
