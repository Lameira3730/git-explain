import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("history can be read by index and cleared", async () => {
  const historyPath = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "git-explain-history-")),
    "history.json",
  );

  process.env.GIT_EXPLAIN_HISTORY_PATH = historyPath;
  const history = await import("../src/services/history.js");

  history.saveHistoryEntry({
    provider: "gemini",
    model: "gemini-3.6-flash",
    branch: "main",
    commit: "abc123",
    files: ["src/index.ts"],
    mode: "working-tree",
    diffStat: {
      filesChanged: 1,
      additions: 2,
      deletions: 1,
    },
    explanation: "Example",
  });

  assert.equal(history.getHistoryEntry("0")?.explanation, "Example");

  history.clearHistory();
  assert.deepEqual(history.getHistory(), []);
});
