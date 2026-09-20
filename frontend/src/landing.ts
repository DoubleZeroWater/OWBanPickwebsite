import type { CreatedRoomResponse } from "./types";
import { escapeHtml } from "./utils";

let landingRoot: HTMLDivElement;
let creationHash: string | null = null;
let lastCreatedRoom: CreatedRoomResponse | null = null;
let landingJoinValue = "";

export function renderLandingPage(root: HTMLDivElement, unlimitedHash: string | null, errorMessage = ""): void {
  landingRoot = root;
  creationHash = unlimitedHash;
  render(errorMessage);
}

function render(errorMessage = ""): void {
  landingRoot.innerHTML = `
    <main class="page-shell landing-page-shell">
      <header class="landing-brand" aria-label="守望先锋赛事BP房间">
        <span class="landing-brand-mark" aria-hidden="true">OW</span>
        <h1 class="landing-site-title">守望先锋赛事BP房间</h1>
      </header>
      <div class="landing-layout ${lastCreatedRoom ? "landing-layout-created" : "landing-layout-initial"}">
        <section class="landing-panel landing-join-panel" aria-labelledby="joinRoomTitle">
          <div class="landing-panel-heading">
            <h2 id="joinRoomTitle">已有房间</h2>
            <p class="landing-description">输入代码进入房间页面</p>
          </div>
          <form id="joinRoomForm" class="landing-join-form" novalidate>
            <div class="landing-join-controls">
              <input
                id="joinRoomHash"
                name="roomHash"
                type="text"
                value="${escapeHtml(landingJoinValue)}"
                inputmode="text"
                pattern="[0-9a-z]{4}"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
                placeholder="a7k2"
                aria-label="房间代码"
                aria-describedby="joinRoomStatus"
              />
              <button id="joinRoomButton" class="landing-primary-button" type="submit">进入房间</button>
            </div>
            <p id="joinRoomStatus" class="landing-status" aria-live="polite"></p>
          </form>
        </section>

        <section class="landing-panel landing-create-panel" aria-labelledby="createRoomTitle">
          <div class="landing-panel-heading">
            <h2 id="createRoomTitle">创建房间</h2>
            <p class="landing-description">生成进入房间的代码</p>
          </div>
          ${lastCreatedRoom
            ? renderCreatedRoomLinks(lastCreatedRoom)
            : `<button id="createRoomButton" class="landing-primary-button landing-create-button" type="button">创建房间</button>`}
          <p id="createRoomStatus" class="landing-status${errorMessage ? " landing-status-error" : ""}" aria-live="polite">${escapeHtml(errorMessage)}</p>
        </section>
      </div>
      ${renderLandingGuide()}
    </main>
  `;

  document.getElementById("createRoomButton")?.addEventListener("click", createRoomFromLanding);
  bindJoinRoomForm();
  bindRoomHashButtons();
}

function renderLandingGuide(): string {
  return `
    <section class="landing-guide" aria-labelledby="landingGuideTitle">
      <header class="landing-guide-header">
        <h2 id="landingGuideTitle">使用指南</h2>
      </header>
      <ol class="landing-guide-steps">
        <li class="landing-guide-step">
          <div class="landing-guide-step-heading">
            <span class="landing-guide-step-number">01</span>
            <h3>创建房间</h3>
          </div>
          <p class="landing-guide-description">点击上方“创建房间”，一次获得四种身份的专属入口。</p>
          <div class="landing-guide-illustration landing-guide-create" role="img" aria-label="创建一个比赛房间，生成四种身份入口">
            <svg viewBox="0 0 240 130" aria-hidden="true">
              <path d="M120 66v20M30 104V86h180v18M90 86v18M150 86v18" fill="none" stroke="#566071" stroke-width="2"/>
              <rect x="69" y="9" width="102" height="57" rx="10" fill="#26252a" stroke="#ffb15f"/>
              <path d="M120 22v16m-8-8h16" stroke="#ffb15f" stroke-width="2" stroke-linecap="round"/>
              <text x="120" y="54" text-anchor="middle" fill="#f5f7fb">比赛房间</text>
              <circle cx="30" cy="109" r="7" fill="#ef4a57"/>
              <circle cx="90" cy="109" r="7" fill="#45a7ff"/>
              <circle cx="150" cy="109" r="7" fill="#ffb15f"/>
              <circle cx="210" cy="109" r="7" fill="#b8c0cc"/>
            </svg>
            <span>一个房间，四种入口</span>
          </div>
          <p class="landing-guide-note">已收到代码？直接在上方“已有房间”输入即可。</p>
        </li>
        <li class="landing-guide-step">
          <div class="landing-guide-step-heading">
            <span class="landing-guide-step-number">02</span>
            <h3>分发入口</h3>
          </div>
          <p class="landing-guide-description">把对应的 4 位代码发给队伍、裁判和导播，各自进入同一场比赛。</p>
          <div class="landing-guide-illustration landing-guide-roles" aria-label="四种入口的用途">
            <div><i class="landing-guide-dot-a" aria-hidden="true"></i><strong>队伍1</strong><span>本队选择与禁用</span></div>
            <div><i class="landing-guide-dot-b" aria-hidden="true"></i><strong>队伍2</strong><span>本队选择与禁用</span></div>
            <div><i class="landing-guide-dot-c" aria-hidden="true"></i><strong>管理员</strong><span>配置规则、控制流程</span></div>
            <div><i class="landing-guide-dot-d" aria-hidden="true"></i><strong>直播</strong><span>展示比赛公共画面</span></div>
          </div>
          <p class="landing-guide-note">管理员入口仅供裁判或房主使用。</p>
        </li>
        <li class="landing-guide-step">
          <div class="landing-guide-step-heading">
            <span class="landing-guide-step-number">03</span>
            <h3>开始比赛</h3>
          </div>
          <p class="landing-guide-description">管理员配置并启动比赛，双方按页面提示完成选图、阵容与英雄禁用。</p>
          <div class="landing-guide-illustration landing-guide-ban-scene" aria-label="双方英雄禁用示意">
            <span class="landing-guide-example">英雄禁用示意</span>
            <div class="landing-guide-team-bans">
              ${renderLandingGuideBan("/static/heroes/ana-dabc96ec9d14.png", "安娜", "队伍1禁用")}
              ${renderLandingGuideBan("/static/heroes/reinhardt-642eb6b0e6df.png", "莱因哈特", "队伍2禁用")}
            </div>
          </div>
          <p class="landing-guide-note">轮到本队时，按提示完成当前操作。</p>
        </li>
      </ol>
    </section>
  `;
}

function renderLandingGuideBan(imageUrl: string, heroName: string, label: string): string {
  return `
    <div class="landing-guide-team-ban">
      <div class="landing-guide-ban-avatar">
        <img src="${imageUrl}" alt="${heroName}英雄头像" />
        <span class="landing-guide-ban-symbol" aria-hidden="true"></span>
      </div>
      <span>${label}</span>
    </div>
  `;
}

function renderCreatedRoomLinks(room: CreatedRoomResponse): string {
  return `
    <div class="created-room-panel">
      <div class="created-room-header">
        <span>房间已创建</span>
      </div>
      <div class="room-link-grid">
        ${Object.entries(room.links).map(([code, link]) => {
          const landingLabel = getLandingPortalLabel(code);
          return `
            <article class="room-link-card room-link-card-${escapeHtml(code.toLowerCase())}">
              <div class="room-link-role">
                <span class="room-role-dot" aria-hidden="true"></span>
                <span>${escapeHtml(landingLabel)}</span>
              </div>
              <div class="room-link-actions">
                <button
                  class="copy-room-hash-button"
                  data-copy-hash="${escapeHtml(link.hash)}"
                  data-copy-label="${escapeHtml(landingLabel)}"
                  type="button"
                  aria-label="复制${escapeHtml(landingLabel)}哈希 ${escapeHtml(link.hash)}"
                >${escapeHtml(link.hash)}</button>
                <a class="enter-room-link" href="${escapeHtml(link.url)}">进入</a>
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <p id="copyRoomHashStatus" class="landing-status landing-copy-status" aria-live="polite"></p>
    </div>
  `;
}

export function getLandingPortalLabel(code: string): string {
  const labels: Record<string, string> = {
    A: "队伍1入口",
    B: "队伍2入口",
    C: "管理员入口",
    D: "直播入口",
  };

  return labels[code] ?? "房间入口";
}

function bindJoinRoomForm(): void {
  const form = document.getElementById("joinRoomForm") as HTMLFormElement | null;
  const input = document.getElementById("joinRoomHash") as HTMLInputElement | null;

  if (!form || !input) {
    return;
  }

  input.addEventListener("input", () => {
    const normalizedValue = normalizeRoomHash(input.value);
    input.value = normalizedValue;
    landingJoinValue = normalizedValue;
    setLandingJoinStatus("");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void enterRoomFromLanding();
  });
}

function normalizeRoomHash(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z]/g, "").slice(0, 4);
}

async function enterRoomFromLanding(): Promise<void> {
  const input = document.getElementById("joinRoomHash") as HTMLInputElement | null;
  const button = document.getElementById("joinRoomButton") as HTMLButtonElement | null;

  if (!input || !button) {
    return;
  }

  const roomHash = normalizeRoomHash(input.value);
  input.value = roomHash;
  landingJoinValue = roomHash;

  if (!/^[0-9a-z]{4}$/.test(roomHash)) {
    setLandingJoinStatus("请输入完整的 4 位数字或小写字母哈希。", true);
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "验证中...";
  setLandingJoinStatus("正在验证房间入口...");

  try {
    const response = await fetch(`/api/rooms/token/${encodeURIComponent(roomHash)}`, {
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      window.location.assign(`/r/${encodeURIComponent(roomHash)}`);
      return;
    }

    if (response.status === 404) {
      setLandingJoinStatus("房间入口不存在，请检查哈希。", true);
      return;
    }

    if (response.status === 410) {
      setLandingJoinStatus("房间已经关闭或因不活跃而过期。", true);
      return;
    }

    setLandingJoinStatus("暂时无法验证房间，请稍后重试。", true);
  } catch {
    setLandingJoinStatus("网络连接失败，请稍后重试。", true);
  } finally {
    if (document.body.contains(button)) {
      button.disabled = false;
      button.textContent = "进入房间";
    }
  }
}

function setLandingJoinStatus(message: string, isError = false): void {
  const status = document.getElementById("joinRoomStatus");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("landing-status-error", isError);
}

async function createRoomFromLanding(): Promise<void> {
  const button = document.getElementById("createRoomButton") as HTMLButtonElement | null;

  if (button) {
    button.disabled = true;
    button.textContent = "创建中...";
  }

  try {
    const endpoint = creationHash
      ? `/api/rooms/unlimited/${encodeURIComponent(creationHash)}`
      : "/api/rooms";
    const response = await fetch(endpoint, { method: "POST", headers: { Accept: "application/json" } });

    if (response.status === 429) {
      render("创建过于频繁，请稍后再试。");
      return;
    }

    if (!response.ok) {
      render("创建房间失败，请稍后重试。");
      return;
    }

    lastCreatedRoom = await response.json() as CreatedRoomResponse;
    render();
  } catch {
    render("网络连接失败，请稍后重试。");
  }
}

function bindRoomHashButtons(): void {
  landingRoot.querySelectorAll<HTMLButtonElement>(".copy-room-hash-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const roomHash = button.dataset.copyHash;
      const label = button.dataset.copyLabel;
      const status = document.getElementById("copyRoomHashStatus");

      if (!roomHash || !label || !status) {
        return;
      }

      try {
        if (!navigator.clipboard) {
          throw new Error("Clipboard API unavailable");
        }

        await navigator.clipboard.writeText(roomHash);
        status.textContent = `${label} ${roomHash} 已复制。`;
        status.classList.remove("landing-status-error");
        button.classList.add("is-copied");
        window.setTimeout(() => button.classList.remove("is-copied"), 1200);
      } catch {
        status.textContent = "复制失败，请手动选择哈希。";
        status.classList.add("landing-status-error");
      }
    });
  });
}

export function bindCopyLinkButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>(".copy-link-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copyValue;

      if (!value || !navigator.clipboard) {
        button.textContent = "复制失败";
        return;
      }

      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "已复制";
      } catch {
        button.textContent = "复制失败";
      }
    });
  });
}
