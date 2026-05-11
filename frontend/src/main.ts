import "./styles.css";

type Side = "left" | "right";
type MapStatus = "completed" | "after" | "tbd";

interface TeamState {
  id: string;
  name: string;
  seriesScore: number;
  seed: number;
}

interface HeroBan {
  hero: string;
  nameEn: string;
  role: string;
  imageUrl: string;
}

interface MatchMap {
  id: string;
  mode: string | null;
  modeIconUrl: string | null;
  nameZh: string | null;
  nameEn: string | null;
  status: MapStatus;
  imageUrl: string;
  score: Record<Side, number | null>;
  bans: Record<Side, HeroBan | null>;
  firstBanSide: Side | null;
}

interface MatchState {
  roomCode: string;
  matchName: string;
  phase: string;
  currentCountdownSeconds: number;
  currentOperation: string;
  teams: Record<Side, TeamState>;
  maps: MatchMap[];
}

const app = getAppRoot();

renderShell(app);
void loadMatchState();

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");

  if (!root) {
    throw new Error("Missing #app root element");
  }

  return root;
}

async function loadMatchState(): Promise<void> {
  try {
    const response = await fetch("/api/matches/A/state", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const state = (await response.json()) as MatchState;
    renderMatch(state);
  } catch (error) {
    renderError(error instanceof Error ? error.message : "未知错误");
  }
}

function renderShell(root: HTMLDivElement): void {
  root.innerHTML = `
    <main class="page-shell">
      <section class="loading-card">
        <div class="loading-pulse"></div>
        <p>正在载入赛事页面...</p>
      </section>
    </main>
  `;
}

function renderMatch(state: MatchState): void {
  app.innerHTML = `
    <main class="page-shell">
      <header class="match-header">
        ${renderTeamHeader("left", state.teams.left)}
        <div class="match-title">
          <span>Match Room ${escapeHtml(state.roomCode)}</span>
          <h1>${escapeHtml(state.matchName)}</h1>
        </div>
        ${renderTeamHeader("right", state.teams.right)}
      </header>
      <section class="map-stack" aria-label="地图列表">
        ${state.maps.map((map, index) => renderMapRow(map, index + 1, state.teams)).join("")}
      </section>
    </main>
  `;
}

function renderTeamHeader(side: Side, team: TeamState): string {
  return `
    <div class="team-header team-header-${side}">
      <span>TEAM ${team.seed}</span>
      <strong>${escapeHtml(team.name)}</strong>
      <b>${team.seriesScore}</b>
    </div>
  `;
}

function renderMapRow(
  map: MatchMap,
  index: number,
  teams: Record<Side, TeamState>,
): string {
  const isTbd = map.status === "tbd";
  const firstBanSide = map.firstBanSide;

  return `
    <article class="map-row map-row-${map.status}">
      ${renderBanSlot("left", map, teams.left)}
      ${renderBanPointer("left", firstBanSide)}
      <div class="map-card">
        <div class="map-image-wrap">
          ${isTbd ? "" : `<img src="${map.imageUrl}" alt="${map.nameZh ?? "待定地图"}" class="map-image" />`}
          <div class="map-score map-score-left">${formatMapScore(map.score.left)}</div>
          <div class="map-score map-score-right">${formatMapScore(map.score.right)}</div>
          ${map.status === "after" ? '<div class="after-ribbon">After</div>' : ""}
          ${isTbd ? '<div class="tbd-watermark">TBD</div>' : ""}
          <div class="map-meta">
            <div class="map-title-block">
              <span class="map-index">MAP ${index}</span>
              <h2>
                ${renderModeIcon(map)}
                <span>${escapeHtml(map.nameEn ?? "TBD")}</span>
              </h2>
              <p>${escapeHtml(map.nameZh ?? "待选择地图")}${map.mode ? ` · ${escapeHtml(map.mode)}` : ""}</p>
            </div>
          </div>
        </div>
      </div>
      ${renderBanPointer("right", firstBanSide)}
      ${renderBanSlot("right", map, teams.right)}
    </article>
  `;
}

function renderModeIcon(map: MatchMap): string {
  if (!map.modeIconUrl) {
    return "";
  }

  return `<img class="mode-icon" src="${map.modeIconUrl}" alt="${escapeHtml(map.mode ?? "地图模式")}" />`;
}

function renderBanSlot(side: Side, map: MatchMap, team: TeamState): string {
  const ban = map.bans[side];
  const empty = !ban;

  return `
    <aside class="ban-slot ban-slot-${side} ${empty ? "ban-slot-empty" : ""}" aria-label="${escapeHtml(team.name)} 禁用英雄">
      ${ban ? `<img src="${ban.imageUrl}" alt="${escapeHtml(ban.hero)}" class="ban-hero-image" />` : '<div class="ban-empty-mark">BAN</div>'}
      <div class="ban-caption">
        <strong>${escapeHtml(ban?.hero ?? "未 Ban")}</strong>
        <small>${escapeHtml(ban?.role ?? team.name)}</small>
      </div>
    </aside>
  `;
}

function renderBanPointer(side: Side, firstBanSide: Side | null): string {
  const active = firstBanSide === side;
  const arrow = side === "left" ? "▶" : "◀";

  return `
    <div class="ban-pointer ${active ? "ban-pointer-active" : ""}" aria-label="${active ? "先手 Ban 方" : ""}">
      ${active ? arrow : ""}
    </div>
  `;
}

function renderError(message: string): void {
  app.innerHTML = `
    <main class="page-shell">
      <section class="error-card">
        <p class="eyebrow">加载失败</p>
        <h1>无法打开赛事方页面</h1>
        <p>${escapeHtml(message)}</p>
      </section>
    </main>
  `;
}

function formatMapScore(score: number | null): string {
  return score === null ? "-" : score.toString();
}

function escapeHtml(value: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return value.replace(/[&<>"']/g, (character) => escapeMap[character]);
}
