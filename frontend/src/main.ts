import "./styles.css";

type Side = "left" | "right";
type MapStatus = "completed" | "after" | "tbd";
type ScoreValue = number | string | null;

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
  score: Record<Side, ScoreValue>;
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
          <h1>${escapeHtml(state.matchName)}</h1>
          <span>FT3</span>
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
  const score = `<b>${team.seriesScore}</b>`;
  const name = `<strong>${escapeHtml(team.name)}</strong>`;

  return `
    <div class="team-header team-header-${side}">
      ${side === "left" ? `${name}${score}` : `${score}${name}`}
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
  const scoreClasses = getScoreClasses(map.score.left, map.score.right);
  const mapTitle = map.nameZh ?? "";

  return `
    <article class="map-row map-row-${map.status}">
      ${renderBanSlot("left", teams.left, map.bans.left)}
      ${renderBanPointer("left", firstBanSide)}
      <div class="map-card">
        <div class="map-image-wrap">
          ${isTbd ? "" : `<img src="${map.imageUrl}" alt="${map.nameZh ?? "待定地图"}" class="map-image" />`}
          <div class="map-score map-score-left ${scoreClasses.left}">${formatMapScore(map.score.left)}</div>
          <div class="map-score map-score-right ${scoreClasses.right}">${formatMapScore(map.score.right)}</div>
          <div class="map-meta">
            <div class="map-title-block">
              <span class="map-index">MAP ${index}</span>
              ${mapTitle ? `
                <h2>
                  ${renderModeIcon(map)}
                  <span>${escapeHtml(mapTitle)}</span>
                </h2>
              ` : ""}
            </div>
          </div>
        </div>
      </div>
      ${renderBanPointer("right", firstBanSide)}
      ${renderBanSlot("right", teams.right, map.bans.right)}
    </article>
  `;
}

function renderModeIcon(map: MatchMap): string {
  if (!map.modeIconUrl) {
    return "";
  }

  return `<img class="mode-icon" src="${map.modeIconUrl}" alt="${escapeHtml(map.mode ?? "地图模式")}" />`;
}

function renderBanSlot(side: Side, team: TeamState, ban: HeroBan | null): string {
  const empty = !ban;

  return `
    <aside class="ban-column ban-column-${side}" aria-label="${escapeHtml(team.name)} 禁用英雄">
      <div class="ban-slot ${empty ? "ban-slot-empty" : ""}">
        ${ban ? `<img src="${ban.imageUrl}" alt="${escapeHtml(ban.hero)}" class="ban-hero-image" />` : ""}
        ${ban ? '<span class="ban-forbidden-icon" aria-hidden="true"></span>' : ""}
      </div>
    </aside>
  `;
}

function renderBanPointer(side: Side, firstBanSide: Side | null): string {
  const active = firstBanSide === side;
  const arrow = side === "left" ? "◀" : "▶";

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

function formatMapScore(score: ScoreValue): string {
  if (score === null || score === "") {
    return "";
  }

  return score.toString();
}

function getScoreClasses(
  leftScore: ScoreValue,
  rightScore: ScoreValue,
): Record<Side, string> {
  const comparison = compareScores(leftScore, rightScore);

  if (comparison === null) {
    return { left: "", right: "" };
  }

  if (comparison === 0) {
    return { left: "map-score-even", right: "map-score-even" };
  }

  return comparison > 0
    ? { left: "map-score-leading", right: "map-score-trailing" }
    : { left: "map-score-trailing", right: "map-score-leading" };
}

function compareScores(leftScore: ScoreValue, rightScore: ScoreValue): number | null {
  const left = normalizeScore(leftScore);
  const right = normalizeScore(rightScore);

  if (left === null || right === null) {
    return null;
  }

  if (left.type === "result" || right.type === "result") {
    if (left.type !== "result" || right.type !== "result") {
      return null;
    }

    return left.value - right.value;
  }

  return left.value - right.value;
}

function normalizeScore(
  score: ScoreValue,
): { type: "number" | "result"; value: number } | null {
  if (score === null || score === "") {
    return null;
  }

  if (typeof score === "number") {
    return { type: "number", value: score };
  }

  const normalized = score.trim().toUpperCase();

  if (normalized === "W") {
    return { type: "result", value: 1 };
  }

  if (normalized === "L") {
    return { type: "result", value: 0 };
  }

  const numericText = normalized.replace(/[^\d.-]/g, "");
  const value = Number.parseFloat(numericText);

  if (Number.isNaN(value)) {
    return null;
  }

  return { type: "number", value };
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
