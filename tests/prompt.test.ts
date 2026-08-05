import assert from "node:assert/strict";
import test from "node:test";
import { buildExplainPrompt } from "../src/services/prompt.js";

test("builds a debugging-focused prompt without emojis when requested", () => {
  const prompt = buildExplainPrompt("diff --git a/a b/a", {
    includeEmoji: false,
  });

  assert.match(prompt, /What To Test/);
  assert.match(prompt, /Files Changed/);
  assert.match(prompt, /Create one subsection per modified file/);
  assert.match(prompt, /Do not use emojis/);
  assert.match(prompt, /diff --git a\/a b\/a/);
});
