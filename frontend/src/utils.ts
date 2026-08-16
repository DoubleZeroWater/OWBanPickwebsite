import type { ScoreValue, Side } from "./types";

export function formatMapScore(score: ScoreValue): string {
  if (score === null || score === "") {
    return "";
  }

  return score.toString();
}

export function getScoreClasses(leftScore: ScoreValue, rightScore: ScoreValue): Record<Side, string> {
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

export function compareScores(leftScore: ScoreValue, rightScore: ScoreValue): number | null {
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

function normalizeScore(score: ScoreValue): { type: "number" | "result"; value: number } | null {
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

  if (normalized === "L" || normalized === "FF") {
    return { type: "result", value: 0 };
  }

  const numericText = normalized.replace(/[^\d.-]/g, "");
  const value = Number.parseFloat(numericText);

  if (Number.isNaN(value)) {
    return null;
  }

  return { type: "number", value };
}

export function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

export function escapeHtml(value: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return value.replace(/[&<>"']/g, (character) => escapeMap[character]);
}
