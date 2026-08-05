export interface DiffStat {
  filesChanged: number;
  additions: number;
  deletions: number;
}

export const getDiffStat = (diff: string): DiffStat => {
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = line.match(/^diff --git a\/(.+?) b\//);
      if (match?.[1]) files.add(match[1]);
      continue;
    }

    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }

  return {
    filesChanged: files.size,
    additions,
    deletions,
  };
};
