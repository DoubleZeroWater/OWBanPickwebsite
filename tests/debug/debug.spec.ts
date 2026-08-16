import { expect, test, type Page } from "@playwright/test";

async function chooseScenario(page: Page, id: string): Promise<void> {
  await page.locator(`[data-debug-scenario="${id}"]`).click();
  await expect(page.locator(`[data-debug-scenario="${id}"]`)).toHaveAttribute("aria-pressed", "true");
}

test("debug page previews every phase without creating a room", async ({ page }) => {
  const roomRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/rooms(?:\/|$)/.test(new URL(request.url()).pathname)) roomRequests.push(request.url());
  });

  await page.goto("/debug");
  await expect(page.locator("[data-debug-toolbar]")).toBeVisible();
  await expect(page.locator("[data-debug-preview-group]")).toHaveCount(0);
  await expect(page.locator("[data-debug-toolbar]")).not.toContainText("方案");
  await expect(page.locator('[data-debug-portal="admin"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-debug-scenario="map-pick"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-pop-window-id="map-select"]')).toBeVisible();
  expect(roomRequests).toEqual([]);

  await chooseScenario(page, "waiting-ready");
  await expect(page.locator(".admin-preparation-status-grid")).toBeVisible();
  await expect(page.locator(".admin-preparation-status").filter({ hasText: "CR" })).toContainText("已准备");
  await expect(page.locator(".admin-preparation-status").filter({ hasText: "FAL" })).toContainText("等待中");
  await expect(page.locator("#forceStartMatchFromGate")).toHaveText("跳过等待并开始");
  await expect(page.locator(".team-preparation-success")).toHaveCount(0);

  const primaryWindows: Record<string, string | null> = {
    configuring: "prepare",
    "default-config-direct": "prepare",
    "ready-none": "prepare",
    "waiting-ready": "prepare",
    "ready-right": "prepare",
    "ready-both": "prepare",
    "team-name-empty": "prepare",
    "team-name-readonly": "prepare",
    "team-offline": "prepare",
    "auto-start": "prepare",
    "pre-start-rest": "prepare",
    "pre-countdown-final-five": "prepare",
    "pre-countdown-paused": "prepare",
    "random-map-picker": "map-select",
    "map-pick-first": "map-select",
    "map-pick": "map-select",
    "map-pick-strict-mode": "map-select",
    "map-pick-timeout-admin": "map-select",
    "map-pick-retry": "map-select",
    "random-side-choice": "map-select",
    "side-pick": "map-select",
    "lineup-pick": "player-select",
    "random-opening-ban": "ban-select",
    "ban-order": "ban-select",
    "ban-first": "ban-select",
    "ban-second": "ban-select",
    "score-entry": "score",
    "score-entry-timeout-empty": "score",
    "score-confirm": "score",
    "post-map-rest": "result",
    completed: null,
    "global-pause": "map-select",
    "timeout-admin": "ban-select",
  };

  for (const [scenario, windowId] of Object.entries(primaryWindows)) {
    await chooseScenario(page, scenario);
    if (windowId) {
      await expect(page.locator(`[data-pop-window-id="${windowId}"]`)).toBeVisible();
    } else {
      await expect(page.locator(".pop-window-stage, .pop-window-minimized")).toHaveCount(0);
    }
  }
  await expect(page.locator('[data-debug-scenario="global-pause"]')).toBeVisible();
  await chooseScenario(page, "global-pause");
  await expect(page.locator('[data-pop-window-id="pause"]')).toBeVisible();
  expect(roomRequests).toEqual([]);
});

test("interactive random uses the reviewed copy and footer hierarchy", async ({ page }) => {
  await page.goto("/debug?portal=admin&phase=random-map-picker", { waitUntil: "domcontentloaded" });
  const randomWindow = page.locator('[data-pop-window-id="map-select"]');
  await expect(randomWindow).toBeVisible();
  await expect(randomWindow.locator(".selector-eyebrow")).toHaveText("交互随机");
  await expect(randomWindow.locator("h2")).toHaveText("决定优先选择方");
  await expect(randomWindow.locator(".interactive-random-team > span")).toHaveCount(0);

  const ruleHint = randomWindow.locator(".interactive-random-footer .pop-window-footer-copy > strong");
  await expect(ruleHint).toHaveText("两队选择相同数字时队伍1先选，不同时队伍2先选");
  await expect(randomWindow.locator(".interactive-random-footer .phase-readonly-label")).toHaveCount(0);

  await randomWindow.locator('[data-pop-window-control="minimize"]').click();
  const minimizedWindow = page.locator('[data-pop-window-id="map-select"].pop-window-minimized');
  await expect(minimizedWindow.locator(".selector-eyebrow")).toHaveText("交互随机");
  await expect(minimizedWindow.locator("h2")).toHaveText("决定优先选择方");

  await page.goto("/debug?portal=right&phase=random-map-picker", { waitUntil: "domcontentloaded" });
  const chooseOne = page.locator('.interactive-random-choice:not(:disabled)[data-random-value="1"]');
  await expect(chooseOne).toBeVisible();
  await chooseOne.click();
  const resolvedWindow = page.locator('[data-pop-window-id="map-select"]');
  await expect(resolvedWindow.locator("h2")).toHaveText("计算结果已公布");
  const resolvedFooter = resolvedWindow.locator(".interactive-random-footer");
  await expect(resolvedFooter).toContainText("FAL获得首次选图权");
  await expect(resolvedFooter).not.toContainText("双方选择 0 / 1");
  await expect(resolvedFooter).not.toContainText("结果展示结束后自动进入下一阶段");
});

test("pre-match debug scenarios expose their distinct preparation states", async ({ page }) => {
  await page.goto("/debug?portal=admin&phase=ready-none");
  await expect(page.locator(".admin-preparation-status.is-waiting")).toHaveCount(2);
  await expect(page.locator("#forceStartMatchFromGate")).toBeVisible();

  await chooseScenario(page, "ready-right");
  await expect(page.locator(".admin-preparation-status").filter({ hasText: "CR" })).toContainText("等待中");
  await expect(page.locator(".admin-preparation-status").filter({ hasText: "FAL" })).toContainText("已准备");

  await chooseScenario(page, "ready-both");
  await expect(page.locator("#startMatchFromGate")).toBeVisible();
  await expect(page.locator("#forceStartMatchFromGate")).toHaveCount(0);
  await expect(page.locator(".admin-preparation-status.is-ready")).toHaveCount(2);
  await expect(page.locator(".admin-force-start-warning")).toHaveCount(0);

  await chooseScenario(page, "team-offline");
  await expect(page.locator(".admin-preparation-status.is-offline")).toContainText("FAL");
  await expect(page.locator(".admin-preparation-status.is-offline")).toContainText("已离线");

  await chooseScenario(page, "auto-start");
  await expect(page.locator(".pop-window-header-actions strong")).toHaveCount(0);
  await expect(page.locator(".prepare-gate-footer .pop-window-footer-copy > strong")).toHaveText("双方准备后自动开始");
  await expect(page.locator(".admin-force-start-warning")).toContainText("双方完成准备后将自动进入赛前倒计时，也可由管理员跳过等待");
  await expect(page.locator(".config-editor-fields")).not.toHaveAttribute("disabled", "");
  await expect(page.locator("#forceStartMatchFromGate")).toHaveText("跳过等待并开始");
  await expect(page.locator("#forceStartMatchFromGate")).toBeEnabled();
  await expect(page.locator("#startMatchFromGate")).toHaveCount(0);

  await chooseScenario(page, "default-config-direct");
  await expect(page.locator(".admin-preparation-status-grid")).toBeVisible();
  await expect(page.locator(".team-preparation-waiting")).toHaveCount(0);
  await expect(page.locator("#forceStartMatchFromGate")).toBeEnabled();

  await page.locator('[data-debug-portal="left"]').click();
  await chooseScenario(page, "waiting-ready");
  await expect(page.locator("#ownTeamNameInput")).toHaveValue("CR");
  await expect(page.locator("#ownTeamNameInput")).toBeDisabled();
  await expect(page.locator('[data-pop-window-action="ready-status"]')).toBeDisabled();

  await chooseScenario(page, "team-name-empty");
  await expect(page.locator("#ownTeamNameInput")).toHaveValue("");
  await expect(page.locator('[data-pop-window-action="ready"]')).toBeDisabled();

  await chooseScenario(page, "team-name-readonly");
  await expect(page.locator("#ownTeamNameInput")).toHaveValue("CR");
  await expect(page.locator("#ownTeamNameInput")).toBeDisabled();
  await expect(page.locator('[data-pop-window-action="ready"]')).toBeEnabled();

  await chooseScenario(page, "pre-countdown-final-five");
  await expect(page.locator('[data-pop-window-id="prepare"] .countdown-time')).toHaveText("0:05");
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-header-actions strong')).toHaveCount(0);
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-footer-copy > span')).toHaveCount(0);

  await chooseScenario(page, "pre-countdown-paused");
  await expect(page.locator('[data-pop-window-id="pause"]')).toBeVisible();
  await expect(page.locator('[data-pop-window-id="pause"] [data-pop-window-control]')).toHaveCount(0);
  await expect(page.locator('[data-pop-window-id="pause"] .pop-window-header-actions > strong')).toHaveText(/^\d+:\d{2}$/);
  await expect(page.locator('[data-pop-window-id="pause"] .pop-window-body, [data-pop-window-id="pause"] .pop-window-footer')).toHaveCount(0);
  await expect(page.locator('[data-pop-window-id="prepare"] .countdown-time')).toHaveText("0:31");

  await page.locator('[data-debug-portal="broadcast"]').click();
  await chooseScenario(page, "configuring");
  const minimalBroadcast = page.locator('[data-broadcast-preview="minimal"]');
  await expect(minimalBroadcast.locator("span, p")).toHaveCount(0);
  await expect(minimalBroadcast.locator("h3")).toHaveText("赛事准备中");
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-footer')).toHaveCount(0);
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-inline-actions')).toHaveCount(0);
  await expect(page.locator('[data-pop-window-action="waiting-config"]')).toHaveCount(0);

  await chooseScenario(page, "default-config-direct");
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-footer')).toHaveCount(0);
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-inline-actions')).toHaveCount(0);

  await chooseScenario(page, "ready-both");
  await expect(minimalBroadcast.locator("h3")).toHaveText("等待管理员开始");

  await chooseScenario(page, "pre-start-rest");
  const minimizedCountdown = page.locator('[data-pop-window-id="prepare"].pop-window-minimized');
  await expect(minimizedCountdown).toBeVisible();
  await expect(minimizedCountdown.locator("h2")).toHaveText("MAP 1 准备中");
  await minimizedCountdown.locator('[data-pop-window-control="restore"]').click();
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-body')).toBeVisible();
  await expect(page.locator('[data-pop-window-id="prepare"] .pop-window-footer')).toHaveCount(0);
});

test("broadcast portal is an audience-only view across selectable phases", async ({ page }) => {
  const phases = [
    "configuring", "default-config-direct", "random-map-picker", "map-pick", "random-side-choice",
    "side-pick", "lineup-pick", "random-opening-ban", "ban-order", "ban-first", "ban-second",
    "score-entry", "score-confirm", "post-map-rest",
  ];

  for (const phase of phases) {
    await page.goto(`/debug?portal=broadcast&phase=${phase}`, { waitUntil: "domcontentloaded" });
    const window = page.locator("[data-pop-window-id]").first();
    await expect(window).toBeVisible();
    await expect(window.locator(".pop-window-footer, .pop-window-inline-actions")).toHaveCount(0);
    await expect(window.locator('button:not([data-pop-window-control]), input, select, textarea')).toHaveCount(0);
  }

  await page.goto("/debug?portal=broadcast&phase=ban-first", { waitUntil: "domcontentloaded" });
  const ordinaryHeroes = page.locator(".hero-option-readonly:not(.hero-option-own-history):not(.hero-option-opponent-current):not(.hero-option-unavailable)");
  await expect(ordinaryHeroes.first()).toBeVisible();
  expect(await ordinaryHeroes.count()).toBeGreaterThan(20);
  await expect(ordinaryHeroes.first().locator("img")).toHaveCSS("filter", "none");
  await expect(ordinaryHeroes.first()).toHaveCSS("cursor", "default");

  await page.goto("/debug?portal=broadcast&phase=ban-order", { waitUntil: "domcontentloaded" });
  const readonlyOrderCards = page.locator('.ban-order-choice > div');
  await expect(readonlyOrderCards).toHaveCount(2);
  await expect(readonlyOrderCards.first()).toHaveCSS("border-style", "solid");
  await expect(readonlyOrderCards.first()).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  await page.goto("/debug?portal=broadcast&phase=lineup-pick", { waitUntil: "domcontentloaded" });
  const audienceLineup = page.locator('[data-pop-window-id="player-select"]');
  await expect(audienceLineup.locator(".lineup-slot")).toHaveCount(10);
  await expect(audienceLineup.locator(".lineup-control-readonly")).toHaveCount(10);
  await expect(audienceLineup.locator(".lineup-audience-status")).toHaveCount(0);

  await page.goto("/debug?portal=broadcast&phase=score-entry", { waitUntil: "domcontentloaded" });
  const minimizedScore = page.locator('[data-pop-window-id="score"].pop-window-minimized');
  await expect(minimizedScore).toBeVisible();
  await expect(minimizedScore.locator(".selector-eyebrow")).toHaveText("赛果确认");
  await expect(minimizedScore.locator("h2")).toHaveText("MAP 2 比分确认中");
  await minimizedScore.locator('[data-pop-window-control="restore"]').click();
  const expandedScore = page.locator('[data-pop-window-id="score"]');
  await expect(expandedScore.locator(".score-entry-panel")).toContainText("等待比分确认");
  await expect(expandedScore.locator(".score-detail-panel, .score-team-pause-card")).toHaveCount(0);
  await expect(expandedScore.locator(".pop-window-footer")).toHaveCount(0);

  for (const portal of ["left", "right", "admin", "broadcast"]) {
    await page.goto(`/debug?portal=${portal}&phase=post-map-rest`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-pop-window-id="result"].pop-window-minimized')).toBeVisible();
  }
});

test("portal switching uses the normal permission and interaction code", async ({ page }) => {
  await page.goto("/debug?portal=right&phase=map-pick");
  await expect(page.locator('[data-debug-portal="right"]')).toHaveAttribute("aria-pressed", "true");
  const mapOption = page.locator(".map-option:not(:disabled)").first();
  await expect(mapOption).toBeVisible();
  await mapOption.click();
  await page.locator("#confirmMapPick").click();
  await expect(page.locator('[data-pop-window-id="confirmation"]')).toBeVisible();

  await page.locator('[data-debug-portal="left"]').click();
  await expect(page.locator("#confirmMapPick")).toBeDisabled();
  await page.locator('[data-debug-portal="broadcast"]').click();
  await expect(page.locator('[data-pop-window-id="map-select"] button')).toHaveCount(0);

  await page.goto("/debug?portal=unknown&phase=unknown");
  await expect(page).toHaveURL(/portal=admin&phase=map-pick/);
  await expect(page.locator('[data-debug-portal="admin"]')).toHaveAttribute("aria-pressed", "true");
});

test("map and side selection use concise phase titles and controls", async ({ page }) => {
  await page.goto("/debug?portal=right&phase=map-pick");
  const mapWindow = page.locator('[data-pop-window-id="map-select"]');
  await expect(mapWindow.locator("h2")).toHaveText("MAP 2 FAL选择地图");
  await expect(mapWindow.locator(".pop-window-header-actions > strong")).toHaveCount(0);

  await mapWindow.locator('[data-pop-window-control="minimize"]').click();
  await expect(mapWindow.locator("h2")).toHaveText("MAP 2 FAL选择地图");
  await mapWindow.locator('[data-pop-window-control="restore"]').click();

  await mapWindow.locator(".map-option:not(:disabled)").first().click();
  await mapWindow.locator("#confirmMapPick").click();
  const confirmation = page.locator('[data-pop-window-id="confirmation"]');
  await expect(confirmation.locator(".selector-eyebrow")).toHaveText("等待确认");
  await expect(confirmation.locator("h2")).toHaveText("确认选择地图 皇家赛道");
  await expect(confirmation.locator(".pop-window-body, pre")).toHaveCount(0);
  await expect(confirmation.locator(".pop-window-footer-actions button")).toHaveText(["返回修改", "确认"]);

  await page.goto("/debug?portal=right&phase=side-pick");
  const sideWindow = page.locator('[data-pop-window-id="map-select"]');
  await expect(sideWindow.locator("h2")).toHaveText("MAP 2 釜山 FAL选择");
  await expect(sideWindow.locator(".side-selector-copy")).toHaveCount(0);
  const options = sideWindow.locator(".side-selector-options button");
  await expect(options).toHaveText(["选择蓝色方", "选择红色方"]);
  await expect(options.locator("span, small")).toHaveCount(0);
  const optionHeights = await options.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.max(...optionHeights)).toBeLessThanOrEqual(110);

  await sideWindow.locator('[data-pop-window-control="minimize"]').click();
  await expect(sideWindow.locator("h2")).toHaveText("MAP 2 FAL选择阵营");
});

test("map debug scenarios cover first pick, mode order, timeout ruling and retry", async ({ page }) => {
  await page.goto("/debug?portal=right&phase=map-pick-first");
  const mapWindow = page.locator('[data-pop-window-id="map-select"]');
  await expect(mapWindow.locator("h2")).toHaveText("MAP 1 FAL选择地图");
  await expect(mapWindow.locator(".map-option:not(:disabled)")).not.toHaveCount(0);

  await page.goto("/debug?portal=left&phase=map-pick-strict-mode");
  await expect(mapWindow.locator("h2")).toHaveText("MAP 2 CR选择地图");
  await expect(mapWindow.locator(".mode-strip-item:not(.mode-strip-item-locked)")).toHaveCount(1);

  await page.goto("/debug?portal=admin&phase=map-pick-timeout-admin");
  await expect(mapWindow.locator("#extendMap")).toBeVisible();
  await expect(mapWindow.locator("#randomLegalMap")).toBeVisible();
  await expect(mapWindow.locator("#forfeitMap")).toBeVisible();

  await page.goto("/debug?portal=right&phase=map-pick-retry");
  await expect(mapWindow.locator("h2")).toHaveText("MAP 1 FAL选择地图");
  await expect(mapWindow.locator(".map-option:not(:disabled)")).not.toHaveCount(0);
  await expect(mapWindow.locator("#extendMap, #randomLegalMap, #forfeitMap")).toHaveCount(0);
  await expect(mapWindow.locator(".countdown-time")).toHaveText(/0:2[0-4]/);
});

test("lineup, ban and rest phases omit redundant labels", async ({ page }) => {
  await page.goto("/debug?portal=right&phase=lineup-pick");
  const lineupWindow = page.locator('[data-pop-window-id="player-select"]');
  await expect(lineupWindow.locator(".pop-window-header-actions > strong")).toHaveCount(0);
  await expect(lineupWindow.locator(".lineup-team-header > span")).toHaveCount(0);
  const lineupInputs = lineupWindow.locator('.lineup-team-right input');
  for (const [index, value] of ["1", "2", "3", "4", "54"].entries()) await lineupInputs.nth(index).fill(value);
  await lineupWindow.locator("#confirmLineupPick").click();
  const lineupConfirmation = page.locator('[data-pop-window-id="confirmation"]');
  await expect(lineupConfirmation.locator(".selector-eyebrow")).toHaveText("等待确认");
  await expect(lineupConfirmation.locator("h2")).toHaveText("FAL确认上场成员");
  await expect(lineupConfirmation.locator(".pop-window-heading-details > span")).toHaveText(["输出：1", "输出：2", "坦克：3", "辅助：4", "辅助：54"]);
  await expect(lineupConfirmation.locator(".pop-window-body")).toHaveCount(0);
  await lineupConfirmation.locator('[data-pop-window-action="cancel-confirmation"]').click();
  await lineupWindow.locator('[data-pop-window-control="minimize"]').click();
  await expect(lineupWindow.locator("h2")).toHaveText("MAP 2 阵容确认");

  await page.goto("/debug?portal=right&phase=ban-order");
  const banWindow = page.locator('[data-pop-window-id="ban-select"]');
  await expect(banWindow.locator(".ban-order-choice > p")).toHaveText("当前 FAL 决定禁用先后手顺序");
  await expect(banWindow.locator(".ban-order-choice > p > span, .ban-order-choice button > span, .ban-order-choice button > small")).toHaveCount(0);
  await expect(banWindow.locator(".ban-order-choice button")).toHaveText(["选择先手", "选择后手"]);
  await expect(banWindow.locator(".ban-lineup-heading span")).toHaveCount(0);
  await expect(banWindow.locator(".ban-lineup-heading").first()).toHaveCSS("min-height", "38px");
  await expect(banWindow.locator(".ban-lineup-role").first()).toHaveCSS("width", "36px");
  const orderLayout = await banWindow.locator(".ban-order-choice").evaluate((choice) => {
    const sentence = choice.querySelector<HTMLElement>("p");
    const buttons = [...choice.querySelectorAll<HTMLElement>("button")];
    if (!sentence) throw new Error("ban order sentence is missing");
    return {
      sentenceFits: sentence.scrollWidth <= sentence.clientWidth,
      centerDeltas: buttons.map((button) => {
        const strong = button.querySelector<HTMLElement>("strong");
        if (!strong) return Number.POSITIVE_INFINITY;
        const buttonRect = button.getBoundingClientRect();
        const strongRect = strong.getBoundingClientRect();
        return Math.abs((buttonRect.top + buttonRect.height / 2) - (strongRect.top + strongRect.height / 2));
      }),
    };
  });
  expect(orderLayout.sentenceFits).toBe(true);
  expect(Math.max(...orderLayout.centerDeltas)).toBeLessThan(1);
  const orderButtonHeights = await banWindow.locator(".ban-order-choice button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(Math.max(...orderButtonHeights)).toBeLessThanOrEqual(100);
  await banWindow.locator('[data-pop-window-control="minimize"]').click();
  await expect(banWindow.locator("h2")).toHaveText("MAP 2 英雄禁用");

  await page.goto("/debug?portal=left&phase=post-map-rest");
  const restWindow = page.locator('[data-pop-window-id="result"]');
  await expect(restWindow.locator(".pop-window-header-actions > strong")).toHaveCount(0);
  await expect(restWindow.locator(".pop-window-footer-copy > span:not(.phase-readonly-label)")).toHaveCount(0);

  await page.goto("/debug?portal=left&phase=timeout-admin");
  const ruling = page.locator(".ruling-status-banner");
  await expect(ruling.locator("strong")).toHaveText("选择已超时，等待管理员裁定");
  await expect(ruling.locator("p, em")).toHaveCount(0);
});

test("ban confirmation and score details use the expanded hierarchy", async ({ page }) => {
  await page.goto("/debug?portal=left&phase=ban-second");
  const availableHero = page.locator(".hero-option:not(:disabled)").first();
  await availableHero.click();
  await page.locator("#confirmBanPick").click();
  const confirmation = page.locator('[data-pop-window-id="confirmation"]');
  await expect(confirmation.locator(".selector-eyebrow")).toHaveText("等待确认");
  await expect(confirmation.locator("h2")).toHaveText(/^确认禁用英雄 .+/);
  await expect(confirmation.locator(".pop-window-body, pre")).toHaveCount(0);

  for (const phase of ["score-entry", "score-confirm"]) {
    await page.goto(`/debug?portal=left&phase=${phase}`);
    const scoreWindow = page.locator('[data-pop-window-id="score"]');
    await expect(scoreWindow.locator(".score-entry-eyebrow")).toHaveCount(0);
    await expect(scoreWindow.locator("details.score-detail-panel, .score-detail-panel > summary")).toHaveCount(0);
    await expect(scoreWindow.locator("section.score-detail-panel > h3")).toHaveText("本图信息");
    await expect(scoreWindow.locator(".score-map-summary > strong")).toHaveCount(0);
    await expect(scoreWindow.locator(".score-detail-content")).toBeVisible();
    await expect(scoreWindow.locator(".pop-window-footer-copy > span:not(.phase-readonly-label)")).toHaveCount(0);
    const surfaces = await scoreWindow.evaluate((windowElement) => {
      const body = windowElement.querySelector<HTMLElement>(".pop-window-body");
      const entry = windowElement.querySelector<HTMLElement>(".score-entry-panel");
      const sideChoice = windowElement.querySelector<HTMLElement>(".score-map-side-choice strong");
      const banValue = windowElement.querySelector<HTMLElement>(".score-map-info-row:not(.score-map-side-choice) strong");
      if (!body || !entry || !sideChoice || !banValue) throw new Error("score view is incomplete");
      const sideStyle = getComputedStyle(sideChoice);
      const banStyle = getComputedStyle(banValue);
      return {
        bodyBackground: getComputedStyle(body).backgroundColor,
        entryBackground: getComputedStyle(entry).backgroundColor,
        entryBackgroundImage: getComputedStyle(entry).backgroundImage,
        matchingFont: sideStyle.fontFamily === banStyle.fontFamily
          && sideStyle.fontSize === banStyle.fontSize
          && sideStyle.fontWeight === banStyle.fontWeight,
      };
    });
    expect(surfaces.entryBackgroundImage).toBe("none");
    expect(surfaces.entryBackground).toBe("rgba(0, 0, 0, 0)");
    expect(surfaces.bodyBackground).not.toBe("rgba(0, 0, 0, 0)");
    expect(surfaces.matchingFont).toBe(true);
  }

  await page.goto("/debug?portal=right&phase=score-entry");
  const scoreWindow = page.locator('[data-pop-window-id="score"]');
  const centeredNames = scoreWindow.locator(".score-input-card > span, .score-map-team-info > h3");
  await expect(centeredNames).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) await expect(centeredNames.nth(index)).toHaveCSS("text-align", "center");
  const scoreBody = scoreWindow.locator(".pop-window-body");
  const pauseButton = scoreWindow.locator('[data-score-pause-side="right"]');
  await pauseButton.scrollIntoViewIfNeeded();
  const scrollBeforePause = await scoreBody.evaluate((body) => body.scrollTop);
  await pauseButton.click();
  const scrollAfterPause = await scoreBody.evaluate((body) => body.scrollTop);
  expect(Math.abs(scrollAfterPause - scrollBeforePause)).toBeLessThan(2);
});

test("empty score entry remains editable after a stale timeout snapshot", async ({ page }) => {
  await page.goto("/debug?portal=right&phase=score-entry-timeout-empty");
  const scoreWindow = page.locator('[data-pop-window-id="score"]');
  const inputs = scoreWindow.locator(".score-input-card input");
  await expect(inputs).toHaveCount(2);
  await expect(inputs.nth(0)).toBeEnabled();
  await expect(inputs.nth(1)).toBeEnabled();
  await inputs.nth(0).fill("2");
  await inputs.nth(1).fill("1");
  await expect(scoreWindow.locator("#confirmScorePick")).toBeEnabled();
});

test("hero ban board fills its width with equal cards and a standard progress bar", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/debug?portal=left&phase=ban-second", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-pop-window-id="ban-select"]')).toBeVisible();

  await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>("[data-debug-toolbar]");
    if (toolbar) toolbar.style.display = "none";
    document.body.style.setProperty("--debug-toolbar-height", "0px");
    document.body.style.paddingTop = "0";
  });

  const layout = await page.locator(".hero-board").evaluate((board) => {
    const sections = [...board.querySelectorAll<HTMLElement>(".hero-role-column")];
    const measurements = sections.map((section) => {
      const grid = section.querySelector<HTMLElement>(".hero-grid");
      const card = section.querySelector<HTMLElement>(".hero-option");
      const header = section.querySelector<HTMLElement>("header");
      if (!grid || !card || !header) throw new Error("hero role section is incomplete");
      const sectionRect = section.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
      const firstRowCards = [...grid.querySelectorAll<HTMLElement>(".hero-option")].slice(0, columns);
      const firstCardRect = firstRowCards[0]?.getBoundingClientRect();
      const lastCardRect = firstRowCards.at(-1)?.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      return {
        columns,
        width: cardRect.width,
        height: cardRect.height,
        centerDelta: Math.abs((headerRect.left + headerRect.width / 2) - (sectionRect.left + sectionRect.width / 2)),
        fillDelta: firstCardRect && lastCardRect
          ? Math.abs(gridRect.width - (lastCardRect.right - firstCardRect.left))
          : Number.POSITIVE_INFINITY,
      };
    });
    const separators = sections.slice(1).map((section) => {
      const style = getComputedStyle(section, "::before");
      return { content: style.content, background: style.backgroundImage };
    });
    return {
      measurements,
      separators,
      scrollHeight: board.scrollHeight,
      clientHeight: board.clientHeight,
      progressHeight: document.querySelector<HTMLElement>(".ban-selector-progress")?.getBoundingClientRect().height ?? 0,
    };
  });

  expect(layout.measurements.map(({ columns }) => columns)).toEqual([4, 6, 4]);
  expect(Math.max(...layout.measurements.map(({ width }) => width)) - Math.min(...layout.measurements.map(({ width }) => width))).toBeLessThan(0.5);
  expect(Math.max(...layout.measurements.map(({ height }) => height)) - Math.min(...layout.measurements.map(({ height }) => height))).toBeLessThan(0.5);
  expect(Math.max(...layout.measurements.map(({ centerDelta }) => centerDelta))).toBeLessThan(0.5);
  expect(Math.max(...layout.measurements.map(({ fillDelta }) => fillDelta))).toBeLessThan(0.5);
  expect(layout.separators.every(({ content, background }) => content !== "none" && background.includes("linear-gradient"))).toBe(true);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);
  expect(layout.progressHeight).toBeCloseTo(14, 1);

  await expect(page.locator("[data-hero-state]")).toHaveCount(0);

  const hoverStates = [
    { selector: ".hero-option-own-history", description: "本方本场历史禁用英雄" },
    { selector: ".hero-option-opponent-current", description: "对手本场禁用英雄" },
  ];
  for (const { selector, description } of hoverStates) {
    const card = page.locator(selector).first();
    await expect(card).toHaveAttribute("data-hero-state-description", description);
    await expect(card).toHaveAttribute("aria-label", new RegExp(description));
    await card.hover();
    const hoverStyle = await card.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return {
        content: style.content.replace(/^["']|["']$/g, ""),
        opacity: Number(style.opacity),
      };
    });
    expect(hoverStyle.content).toBe(description);
    expect(hoverStyle.opacity).toBeGreaterThan(0.9);
  }

  await page.screenshot({ path: testInfo.outputPath("hero-ban-board.png"), fullPage: true, animations: "disabled" });
});
