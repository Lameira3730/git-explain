// src/services/openai.ts
import OpenAI from "openai";
import { type Config } from "../utils/config.js";
import {
  getErrorMessage,
  isAuthError,
  isQuotaError,
  type ValidationResult,
} from "./validation.js";
import { buildExplainPrompt, type PromptOptions } from "./prompt.js";

export const explainDiffWithOpenAI = async (
  diff: string,
  config: Config,
  options: PromptOptions,
): Promise<string> => {
  const openai = new OpenAI({ apiKey: config.apiKey });

  const completion = await openai.chat.completions.create({
    model: config.model || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a senior developer helping users understand Git diffs in practical human language.",
      },
      { role: "user", content: buildExplainPrompt(diff, options) },
    ],
  });

  return completion.choices[0].message.content || "";
};

export const validateOpenAIKey = async (
  apiKey: string,
  model: string,
): Promise<ValidationResult> => {
  try {
    const openai = new OpenAI({ apiKey: apiKey.trim() });
    await openai.models.retrieve(model);
    return { status: "valid" };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        status: "quota",
        message: "OpenAI accepted the key, but the project is currently rate limited or out of quota.",
      };
    }

    if (isAuthError(error)) {
      return {
        status: "invalid",
        message: "OpenAI rejected this API key.",
      };
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
};
