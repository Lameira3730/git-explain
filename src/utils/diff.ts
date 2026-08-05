export interface DiffStat {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface FileDiff {
  path: string;
  diff: string;
  stat: {
    additions: number;
    deletions: number;
  };
}

export const getDiffStat = (diff: string): DiffStat => {
  const fileDiffs = getFileDiffs(diff);

  return {
    filesChanged: fileDiffs.length,
    additions: fileDiffs.reduce((total, file) => total + file.stat.additions, 0),
    deletions: fileDiffs.reduce((total, file) => total + file.stat.deletions, 0),
  };
};

export const getFileDiffs = (diff: string): FileDiff[] => {
  const fileDiffs: FileDiff[] = [];
  let currentPath: string | null = null;
  let currentLines: string[] = [];

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (currentPath && currentLines.length) {
        fileDiffs.push(createFileDiff(currentPath, currentLines));
      }

      currentPath = getPathFromDiffHeader(line);
      currentLines = [line];
      continue;
    }

    if (currentPath) currentLines.push(line);
  }

  if (currentPath && currentLines.length) {
    fileDiffs.push(createFileDiff(currentPath, currentLines));
  }

  return fileDiffs;
};

export const formatDiffByFile = (diff: string): string => {
  const fileDiffs = getFileDiffs(diff);
  if (!fileDiffs.length) return diff;

  return fileDiffs
    .map((file, index) => {
      return [
        `FILE ${index + 1}: ${file.path}`,
        `STATS: +${file.stat.additions} / -${file.stat.deletions}`,
        "DIFF:",
        file.diff,
      ].join("\n");
    })
    .join("\n\n");
};

export const getChangedFiles = (diff: string): string[] => {
  return getFileDiffs(diff).map((file) => file.path);
};

const createFileDiff = (path: string, lines: string[]): FileDiff => {
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return {
    path,
    diff: lines.join("\n"),
    stat: {
      additions,
      deletions,
    },
  };
};

const getPathFromDiffHeader = (line: string): string => {
  const renameMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!renameMatch) return "unknown";

  return renameMatch[2] || renameMatch[1] || "unknown";
};
