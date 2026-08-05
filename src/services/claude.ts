import Anthropic from "@anthropic-ai/sdk";
import { type Config } from "../utils/config.js";
import { buildExplainPrompt, type PromptOptions } from "./prompt.js";
import {
  getErrorMessage,
  isAuthError,
  isQuotaError,
  type ValidationResult,
} from "./validation.js";

export const explainDiffWithClaude = async (
  diff: string,
  config: Config,
  options: PromptOptions,
): Promise<string> => {
  const anthropic = new Anthropic({ apiKey: config.apiKey });

  const message = await anthropic.messages.create({
    model: config.model,
    max_tokens: 3000,
    system:
      "You are a senior developer helping users understand Git diffs in practical human language.",
    messages: [
      {
        role: "user",
        content: buildExplainPrompt(diff, options),
      },
    ],
  });

  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
};

export const validateClaudeKey = async (
  apiKey: string,
  model: string,
): Promise<ValidationResult> => {
  try {
    const anthropic = new Anthropic({ apiKey: apiKey.trim() });
    await anthropic.models.retrieve(model);
    return { status: "valid" };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        status: "quota",
        message: "Claude accepted the key, but the workspace is currently rate limited or out of quota.",
      };
    }

    if (isAuthError(error)) {
      return {
        status: "invalid",
        message: "Claude rejected this API key.",
      };
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
};
