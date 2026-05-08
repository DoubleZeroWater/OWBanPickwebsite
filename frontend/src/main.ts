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
  role: string;
}

interface MatchMap {
  id: string;
  mode: string | null;
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
      <section class="hero-panel">
        <div>
          <p class="eyebrow">Overwatch Match Control</p>
          <h1>赛事方地图与 Ban Pick 总览</h1>
          <p class="subtitle">房间 ${escapeHtml(state.roomCode)} · ${escapeHtml(state.currentOperation)}</p>
        </div>
        <div class="scoreboard" aria-label="当前大比分">
          ${renderTeamScore("left", state.teams.left)}
          <div class="score-divider">:</div>
          ${renderTeamScore("right", state.teams.right)}
        </div>
      </section>

      <section class="status-strip">
        <div>
          <span class="label">当前阶段</span>
          <strong>${phaseLabel(state.phase)}</strong>
        </div>
        <div>
          <span class="label">倒计时</span>
          <strong>${formatCountdown(state.currentCountdownSeconds)}</strong>
        </div>
        <div>
          <span class="label">地图数量</span>
          <strong>${state.maps.length}</strong>
        </div>
      </section>

      <section class="map-stack" aria-label="地图列表">
        ${state.maps.map((map, index) => renderMapRow(map, index + 1, state.teams)).join("")}
      </section>
    </main>
  `;
}

function renderTeamScore(side: Side, team: TeamState): string {
  return `
    <div class="team-score team-score-${side}">
      <span class="team-seed">Seed ${team.seed}</span>
      <span class="team-name">${escapeHtml(team.name)}</span>
      <strong>${team.seriesScore}</strong>
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
      ${renderBanSquare("left", map, teams.left)}
      ${renderBanPointer("left", firstBanSide)}
      <div class="map-card">
        <div class="map-image-wrap">
          <img src="${map.imageUrl}" alt="${map.nameZh ?? "待定地图"}" class="map-image" />
          <div class="map-score map-score-left">${formatMapScore(map.score.left)}</div>
          <div class="map-score map-score-right">${formatMapScore(map.score.right)}</div>
          ${map.status === "after" ? '<div class="after-ribbon">After</div>' : ""}
          ${isTbd ? '<div class="tbd-watermark">TBD</div>' : ""}
        </div>
        <div class="map-meta">
          <div>
            <span class="map-index">Map ${index}</span>
            <h2>${escapeHtml(map.nameZh ?? "TBD")}</h2>
            <p>${escapeHtml(map.nameEn ?? "待选择地图")}</p>
          </div>
          <span class="mode-pill ${isTbd ? "mode-pill-empty" : ""}">
            ${escapeHtml(map.mode ?? "TBD")}
          </span>
        </div>
      </div>
      ${renderBanPointer("right", firstBanSide)}
      ${renderBanSquare("right", map, teams.right)}
    </article>
  `;
}

function renderBanSquare(side: Side, map: MatchMap, team: TeamState): string {
  const ban = map.bans[side];
  const empty = !ban;

  return `
    <aside class="ban-square ban-square-${side} ${empty ? "ban-square-empty" : ""}">
      <span class="ban-team">${escapeHtml(team.name)}</span>
      <strong>${escapeHtml(ban?.hero ?? "未 Ban")}</strong>
      <small>${escapeHtml(ban?.role ?? "等待选择")}</small>
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

function phaseLabel(phase: string): string {
  if (phase === "after") {
    return "地图选择完成，等待比分";
  }

  return phase;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
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
