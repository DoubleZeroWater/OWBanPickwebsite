export type BaseboardView = {
  matchName: string;
  matchFormat: string;
  phaseLabel: string;
  portalRole: string;
  portalLabel: string;
  leftTeam: string;
  rightTeam: string;
  mapRows: string;
  presence: string;
  startGate: string;
  settings: string;
  popWindows: string;
};

export function renderBaseboard(view: BaseboardView): string {
  return `
    <main class="page-shell">
      <header class="match-header">
        ${view.leftTeam}
        <div class="match-title">
          <h1>${view.matchName}</h1>
          <span>${view.matchFormat}</span>
          ${view.phaseLabel ? `<em class="match-phase-label">${view.phaseLabel}</em>` : ""}
          ${view.portalLabel ? `<b class="portal-badge portal-badge-${view.portalRole}">${view.portalLabel}</b>` : ""}
        </div>
        ${view.rightTeam}
      </header>
      <section class="map-stack" aria-label="地图列表">
        ${view.mapRows}
      </section>
      ${view.presence}
      ${view.startGate}
      ${view.settings}
      ${view.popWindows}
    </main>
  `;
}
