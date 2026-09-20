import { normalizeKey } from "../../utils";
import type { Side } from "../../types";

export function parseRosterMembers(line: string): string[] {
  const memberText = line.includes(":")
    ? line.split(":").slice(1).join(":")
    : line.includes("：")
      ? line.split("：").slice(1).join("：")
      : line;
  return memberText.split(/[,，、\s]+/).map((member) => member.trim()).filter(Boolean);
}

export function createRosterParser(getText: () => string, getTeamName: (side: Side) => string) {
  const matchesSide = (line: string, side: Side): boolean => {
    const teamName = getTeamName(side);
    const normalizedTeam = normalizeKey(teamName);
    const normalizedLine = normalizeKey(line);
    return line.includes(teamName)
      || Boolean(normalizedTeam && normalizedLine.includes(normalizedTeam))
      || (side === "left" ? /蓝|blue|left|teama/i.test(line) : /红|red|right|teamb/i.test(line));
  };

  const parsePresetRosters = (): Record<Side, string[]> => {
    const rosters: Record<Side, string[]> = { left: [], right: [] };
    getText().split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const members = parseRosterMembers(line);
      if (!members.length) return;
      if (matchesSide(line, "left")) rosters.left = members;
      else if (matchesSide(line, "right")) rosters.right = members;
      else if (!rosters.left.length) rosters.left = members;
      else if (!rosters.right.length) rosters.right = members;
    });
    return rosters;
  };

  return {
    parsePresetRosters,
    getRosterOptions: (side: Side): string[] => parsePresetRosters()[side],
  };
}
