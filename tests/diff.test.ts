import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDiffByFile,
  getChangedFiles,
  getDiffStat,
  getFileDiffs,
} from "../src/utils/diff.js";

const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
-old line
+new line
+another line
 unchanged
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-remove me
+add me`;

test("counts changed files, additions, and deletions", () => {
  assert.deepEqual(getDiffStat(diff), {
    filesChanged: 2,
    additions: 3,
    deletions: 2,
  });
});

test("splits diff by modified file", () => {
  const fileDiffs = getFileDiffs(diff);

  assert.equal(fileDiffs.length, 2);
  assert.equal(fileDiffs[0].path, "src/a.ts");
  assert.deepEqual(fileDiffs[1].stat, {
    additions: 1,
    deletions: 1,
  });
});

test("formats diff with file markers for the AI prompt", () => {
  const formatted = formatDiffByFile(diff);

  assert.match(formatted, /FILE 1: src\/a.ts/);
  assert.match(formatted, /STATS: \+2 \/ -1/);
  assert.deepEqual(getChangedFiles(diff), ["src/a.ts", "src/b.ts"]);
});
