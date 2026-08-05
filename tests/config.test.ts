import assert from "node:assert/strict";
import test from "node:test";
import { resolveConfig } from "../src/utils/config.js";

test("migrates legacy Gemini models to the default current model", () => {
  const config = resolveConfig({
    aiProvider: "gemini",
    apiKey: " test-key ",
    model: "models/gemini-1.5-pro",
  });

  assert.equal(config?.model, "gemini-3.6-flash");
  assert.equal(config?.apiKey, "test-key");
});

test("keeps supported custom OpenAI models", () => {
  const config = resolveConfig({
    aiProvider: "openai",
    apiKey: "sk-test",
    model: "gpt-4.1",
  });

  assert.equal(config?.model, "gpt-4.1");
});

test("supports Claude configuration", () => {
  const config = resolveConfig({
    aiProvider: "claude",
    apiKey: "sk-ant-test",
  });

  assert.equal(config?.model, "claude-sonnet-4-5");
  assert.equal(config?.aiProvider, "claude");
});
