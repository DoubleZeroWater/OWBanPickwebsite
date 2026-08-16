import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

type PortalCode = "A" | "B" | "C" | "D";
type CreatedRoom = {
  roomId: string;
  links: Record<PortalCode, { hash: string; url: string }>;
};
type SegmentedSync = {
  kind: "ok" | "changed" | "rebase";
  check: any;
  board: any;
  facts: any;
  phase: any;
  runtime: any;
  presence: any;
  privateContext: any;
};
const E2E_CREATE_HASH = "4b7dc102e5fa8c39b6d1e4f0729a5cb8e3f61d94a70c2be58f39d6a1c4e8072b";

async function createRoom(request: APIRequestContext): Promise<CreatedRoom> {
  const response = await request.post(`/api/rooms/unlimited/${E2E_CREATE_HASH}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as CreatedRoom;
}

async function full(request: APIRequestContext, token: string): Promise<SegmentedSync> {
  const response = await request.post(`/api/rooms/token/${token}/sync`, { data: { check: null } });
  expect(response.ok()).toBeTruthy();
  return await response.json() as SegmentedSync;
}

async function action(
  request: APIRequestContext,
  token: string,
  type: string,
  payload: Record<string, unknown> = {},
  commandId = crypto.randomUUID(),
) {
  const state = await full(request, token);
  return await request.post(`/api/rooms/token/${token}/actions`, {
    data: { commandId, check: state.check, type, payload },
  });
}

async function configureFastRoom(request: APIRequestContext, room: CreatedRoom): Promise<void> {
  const admin = room.links.C.hash;
  const configResponse = await request.get(`/api/rooms/token/${admin}/config`);
  const configEnvelope = await configResponse.json();
  const config = configEnvelope.value;
  config.matchFormat = "ft2";
  config.timing.preMatchRestSeconds = 0;
  config.timing.interMapRestSeconds = 0;
  config.map.selectionPolicy = "unique_map";
  config.map.initialPriorityPolicy = "left";
  config.sideChoice.firstMapSideChoiceEnabled = false;
  config.lineup.mode = "skip";
  config.ban.enabled = false;
  config.rollback.allowAfterCompletion = true;
  const saved = await request.put(`/api/rooms/token/${admin}/config`, { data: { config } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect((await action(request, admin, "config_confirm")).ok()).toBeTruthy();
}

async function configureBanRoom(request: APIRequestContext, room: CreatedRoom): Promise<void> {
  const admin = room.links.C.hash;
  const configResponse = await request.get(`/api/rooms/token/${admin}/config`);
  const configEnvelope = await configResponse.json();
  const config = configEnvelope.value;
  config.matchFormat = "ft2";
  config.timing.preMatchRestSeconds = 0;
  config.timing.interMapRestSeconds = 0;
  config.map.selectionPolicy = "unique_map";
  config.map.initialPriorityPolicy = "left";
  config.sideChoice.firstMapSideChoiceEnabled = false;
  config.lineup.mode = "skip";
  config.ban.enabled = true;
  config.ban.orderPolicy = "advantage_must_first";
  const saved = await request.put(`/api/rooms/token/${admin}/config`, { data: { config } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect((await action(request, admin, "config_confirm")).ok()).toBeTruthy();
}

async function expectPortalLoaded(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("status hash 校验失败");
}

test("legacy /A-/D browser routes now resolve to the landing page", async ({ page }) => {
  for (const code of ["A", "B", "C", "D"] as const) {
    await page.goto(`/${code}`);
    await expect(page.locator(".landing-page-shell")).toBeVisible();
    await expect(page.locator(".page-shell:not(.landing-page-shell)")).toHaveCount(0);
    await expect(page.locator(".map-selector-overlay, .lineup-selector-overlay, .ban-selector-overlay, .score-selector-overlay")).toHaveCount(0);
  }
});

test("phase windows use the shared shell, progress, and footer contract", async ({ page, request }) => {
  const room = await createRoom(request);
  await configureFastRoom(request, room);
  await expectPortalLoaded(page, room.links.A.url);

  const prepare = page.locator('[data-pop-window-id="prepare"]');
  await expect(prepare).toBeVisible();
  await expect(prepare.locator("[data-pop-window-progress]")).toHaveCount(0);
  await expect(prepare.locator(".pop-window-footer [data-pop-window-action]")).toHaveCount(1);
  await expect(prepare.locator(".pop-window-body footer, .pop-window-body [data-pop-window-action]")).toHaveCount(0);

  expect((await action(request, room.links.C.hash, "match_start", { force: true })).ok()).toBeTruthy();
  await page.reload();
  const mapWindow = page.locator('[data-pop-window-id="map-select"]');
  await expect(mapWindow).toBeVisible();
  await expect(mapWindow.locator("[data-pop-window-progress] .countdown-bar")).toHaveCount(1);
  await expect(mapWindow.locator('.pop-window-footer [data-pop-window-action="confirm-map"]')).toHaveCount(1);
  await expect(mapWindow.locator(".pop-window-body footer, .pop-window-body [data-pop-window-action]")).toHaveCount(0);
});

test("four portals converge on one authoritative FT2 status and rollback together", async ({ page, request, context }) => {
  const room = await createRoom(request);
  await configureFastRoom(request, room);

  const leftPage = page;
  const rightPage = await context.newPage();
  const adminPage = await context.newPage();
  const broadcastPage = await context.newPage();
  await expectPortalLoaded(leftPage, room.links.A.url);
  await expectPortalLoaded(rightPage, room.links.B.url);
  await expectPortalLoaded(adminPage, room.links.C.url);
  await expectPortalLoaded(broadcastPage, room.links.D.url);
  await expect(leftPage).toHaveURL(new RegExp(`/r/${room.links.A.hash}$`));
  await expect(rightPage).toHaveURL(new RegExp(`/r/${room.links.B.hash}$`));
  await expect(adminPage).toHaveURL(new RegExp(`/r/${room.links.C.hash}$`));
  await expect(broadcastPage).toHaveURL(new RegExp(`/r/${room.links.D.hash}$`));

  expect((await action(request, room.links.A.hash, "portal_ready_set", { ready: true })).ok()).toBeTruthy();
  expect((await action(request, room.links.B.hash, "portal_ready_set", { ready: true })).ok()).toBeTruthy();
  expect((await action(request, room.links.C.hash, "match_start")).ok()).toBeTruthy();

  expect((await action(request, room.links.A.hash, "map_select", { mapId: "lijiang_tower" })).ok()).toBeTruthy();
  const scorePhase = await full(request, room.links.C.hash);
  expect(scorePhase.phase.type).toBe("score_entry");
  expect((await action(request, room.links.C.hash, "score_submit", { score: { left: 2, right: 0 } })).ok()).toBeTruthy();

  await full(request, room.links.A.hash); // settles the zero-length rest phase
  expect((await action(request, room.links.B.hash, "map_select", { mapId: "dorado" })).ok()).toBeTruthy();
  expect((await action(request, room.links.B.hash, "side_select", { selectedSide: "right" })).ok()).toBeTruthy();
  expect((await action(request, room.links.C.hash, "score_submit", { score: { left: 1, right: 0 } })).ok()).toBeTruthy();

  const completedStates = await Promise.all((Object.keys(room.links) as PortalCode[]).map((code) => full(request, room.links[code].hash)));
  expect(new Set(completedStates.map((state) => state.facts.factsHash)).size).toBe(1);
  expect(completedStates[0].facts.lifecycle).toBe("completed");
  await broadcastPage.reload();
  await expect(broadcastPage.locator(".room-presence-center.match-completed")).toContainText("比赛已结束");
  await expect(broadcastPage.locator(".map-selector-overlay, .side-selector-overlay, .lineup-selector-overlay, .ban-selector-overlay, .score-selector-overlay")).toHaveCount(0);
  await broadcastPage.setViewportSize({ width: 1440, height: 900 });
  await expect(broadcastPage).toHaveScreenshot("match-completed.png", { animations: "disabled" });

  const readOnly = await action(request, room.links.D.hash, "global_pause_set", { active: true });
  expect(readOnly.status()).toBe(403);

  const historyResponse = await request.get(`/api/rooms/token/${room.links.C.hash}/status-history`);
  const history = (await historyResponse.json()).items as any[];
  const target = history.find((item) => item.phase.type === "score_entry");
  expect(target).toBeTruthy();
  const rollbackResponse = await request.post(`/api/rooms/token/${room.links.C.hash}/rollback`, {
    data: { revision: target.revision },
  });
  expect(rollbackResponse.ok()).toBeTruthy();
  const rolled = await rollbackResponse.json();
  expect(rolled.facts.epoch).toBe(2);
  expect(rolled.facts.revision).toBeGreaterThan(completedStates[0].facts.revision);

  await expect.poll(async () => {
    const states = await Promise.all((Object.keys(room.links) as PortalCode[]).map((code) => full(request, room.links[code].hash)));
    return `${new Set(states.map((state) => state.facts.factsHash)).size}:${states[0].facts.epoch}`;
  }).toBe("1:2");

  await adminPage.reload();
  await expect(adminPage.locator("#refreshAuthoritativeHistory")).toBeVisible();
  await expect(adminPage.locator(".admin-checkpoint-panel")).not.toContainText("revision");
  await expect(adminPage.locator("#authoritativeHistoryRevision")).toContainText("第 1 张地图的选图阶段");
  expect((await request.get(`/api/rooms/token/${room.links.C.hash}/snapshot`)).status()).toBe(404);
});

test("runtime-only updates keep revision while stale and duplicate actions are handled safely", async ({ request }) => {
  const room = await createRoom(request);
  await configureFastRoom(request, room);
  const left = room.links.A.hash;
  const before = await full(request, left);
  const commandId = crypto.randomUUID();
  const body = {
    commandId,
    check: before.check,
    type: "portal_ready_set",
    payload: { ready: true },
  };
  const first = await request.post(`/api/rooms/token/${left}/actions`, { data: body });
  const repeated = await request.post(`/api/rooms/token/${left}/actions`, { data: body });
  expect(first.ok()).toBeTruthy();
  expect(repeated.ok()).toBeTruthy();
  expect(await repeated.json()).toEqual(await first.json());

  const afterReady = await full(request, left);
  expect(afterReady.facts.revision).toBe(before.facts.revision);
  expect(afterReady.presence.A.ready).toBe(true);

  expect((await action(request, room.links.C.hash, "match_start", { force: true })).ok()).toBeTruthy();
  const stale = await request.post(`/api/rooms/token/${left}/actions`, {
    data: { ...body, commandId: crypto.randomUUID(), type: "map_select", payload: { mapId: "lijiang_tower" } },
  });
  expect(stale.status()).toBe(409);
  const stalePayload = await stale.json();
  expect(["stale_phase", "stale_runtime"]).toContain(stalePayload.error);
  expect(["changed", "rebase"]).toContain(stalePayload.kind);
  expect(stalePayload.status).toBeUndefined();

  const same = await request.post(`/api/rooms/token/${left}/sync`, {
    data: { check: stalePayload.check },
  });
  const samePayload = await same.json();
  expect(["ok", "changed"]).toContain(samePayload.kind);
  expect(samePayload.status).toBeUndefined();
});

test("broadcast mirrors the score phase read-only and global pause locks room actions", async ({ page, request }) => {
  const room = await createRoom(request);
  await configureFastRoom(request, room);
  expect((await action(request, room.links.C.hash, "match_start", { force: true })).ok()).toBeTruthy();
  expect((await action(request, room.links.A.hash, "map_select", { mapId: "lijiang_tower" })).ok()).toBeTruthy();

  await expectPortalLoaded(page, room.links.D.url);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('[data-pop-window-id="score"].pop-window-minimized')).toBeVisible();
  await expect(page.locator('[data-pop-window-id="score"] .pop-window-footer')).toHaveCount(0);
  await expect(page.locator("input.score-control")).toHaveCount(0);
  await expect(page.locator('[data-pop-window-id="score"] button:not([data-pop-window-control])')).toHaveCount(0);

  await expectPortalLoaded(page, room.links.C.url);
  await page.locator("#toggleGlobalPause").click();
  await expect(page.locator("#toggleGlobalPause")).toHaveText("恢复全局时间");
  await expect(page.locator(".pause-overlay")).toBeVisible();
  await expect(page.locator('[data-pop-window-id="pause"]')).toBeVisible();
  await expect(page.locator(".return-home-button, #minimizeMapSelector")).toHaveCount(0);

  await expect(page.locator("#confirmScorePick")).toBeDisabled();
  await expect(page.locator("[data-score-pause-side]")).toHaveCount(2);
  expect(await page.locator("[data-score-pause-side]").evaluateAll((buttons) => (
    buttons.every((button) => (button as HTMLButtonElement).disabled)
  ))).toBe(true);
  await expect(page.locator("#rollbackToConfig")).toBeDisabled();
  await expect(page.locator("#resumeGlobalTimer")).toBeEnabled();
  await expect(page).toHaveScreenshot("global-pause-admin.png", {
    animations: "disabled",
    mask: [page.locator(".pause-elapsed, .pause-total-elapsed, .countdown-time")],
  });
});

test("ban order submits once while hero ban keeps the in-app confirmation", async ({ page, request }) => {
  const room = await createRoom(request);
  await configureBanRoom(request, room);
  expect((await action(request, room.links.C.hash, "match_start", { force: true })).ok()).toBeTruthy();
  expect((await action(request, room.links.A.hash, "map_select", { mapId: "lijiang_tower" })).ok()).toBeTruthy();
  expect((await action(request, room.links.A.hash, "hero_ban_select", { heroId: "mauga" })).ok()).toBeTruthy();
  expect((await action(request, room.links.B.hash, "hero_ban_select", { heroId: "ana" })).ok()).toBeTruthy();
  expect((await action(request, room.links.C.hash, "score_submit", { score: { left: 2, right: 0 } })).ok()).toBeTruthy();
  await full(request, room.links.A.hash);
  expect((await action(request, room.links.B.hash, "map_select", { mapId: "dorado" })).ok()).toBeTruthy();
  expect((await action(request, room.links.B.hash, "side_select", { selectedSide: "right" })).ok()).toBeTruthy();

  await expectPortalLoaded(page, room.links.B.url);
  await page.locator('[data-ban-order="first"]').click();
  await page.locator("#confirmBanPick").click();
  await expect(page.locator(".selection-confirmation-overlay")).toHaveCount(0);
  await expect.poll(async () => (await full(request, room.links.C.hash)).phase.type).toBe("ban_first");

  await page.reload();
  await page.locator(".hero-option:not(:disabled)").first().click();
  await page.locator("#confirmBanPick").click();
  await expect(page.locator(".selection-confirmation-overlay")).toBeVisible();
  await expect(page.locator('[data-pop-window-id="confirmation"] .pop-window-footer [data-pop-window-action]')).toHaveCount(2);
});

test("minimizing a phase keeps its name, remaining time, and live countdown", async ({ page, request }) => {
  const room = await createRoom(request);
  await configureFastRoom(request, room);
  expect((await action(request, room.links.C.hash, "match_start", { force: true })).ok()).toBeTruthy();
  await expectPortalLoaded(page, room.links.A.url);
  await page.setViewportSize({ width: 1440, height: 900 });

  const before = await page.locator(".map-selector-progress .countdown-time").textContent();
  await expect(page).toHaveScreenshot("map-selection.png", {
    animations: "disabled",
    mask: [page.locator(".countdown-time")],
  });
  await page.locator('[data-pop-window-control="minimize"]').click();
  await expect(page.locator(".pop-window-minimized")).toContainText("MAP 1");
  await expect(page.locator('[data-pop-window-control="restore"]')).toBeVisible();
  await page.waitForTimeout(1_100);
  const after = await page.locator(".map-selector-progress-mini .countdown-time").textContent();
  expect(before).not.toBe(after);
  await page.locator('[data-pop-window-control="restore"]').click();
  await expect(page.locator(".map-selector-overlay")).toBeVisible();

  await page.locator(".map-option:not(:disabled)").first().click();
  await page.locator("#confirmMapPick").click();
  await expect(page.locator(".selection-confirmation-overlay")).toBeVisible();
  await expect(page.locator('[data-pop-window-id="confirmation"]')).toBeVisible();
  await page.locator("#acceptSelectionConfirmation").click();
  const notice = page.locator(".match-notification");
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText("选择了地图");
  await notice.locator(".match-notification-close").click();
  await expect(notice).toHaveCount(0);
});
