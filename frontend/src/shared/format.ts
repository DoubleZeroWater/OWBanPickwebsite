export function formatDurationMs(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}

export function formatCountdown(seconds: number): string {
  const wholeSeconds = Math.ceil(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${(wholeSeconds % 60).toString().padStart(2, "0")}`;
}

export function normalizeRosterValue(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}
