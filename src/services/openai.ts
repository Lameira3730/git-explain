// src/services/openai.ts
import OpenAI from "openai";
import { type Config } from "../utils/config.js";
import {
  getErrorMessage,
  isAuthError,
  isQuotaError,
  type ValidationResult,
} from "./validation.js";

export const explainDiffWithOpenAI = async (
  diff: string,
  config: Config,
): Promise<string> => {
  const openai = new OpenAI({ apiKey: config.apiKey });

  const completion = await openai.chat.completions.create({
    model: config.model || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
          Act as a senior developer and mentor.
          Analyze the following git diff and explain in a clear, friendly, and organized way what has changed.
          The target audience is indie devs and vibe coders who want to quickly understand the impact of the changes.
          
          Format requirements:
          - Use Markdown for readability (bolding, lists).
          - Start with a very concise "High-Level Summary".
          - Use a "Key Changes" section with bullet points.
          - If there are breaking changes or risks, create a "⚠️ Risks & Warnings" section.
          - Keep tone encouraging and professional.
          
          If the diff is too large, focus on the most impactful changes.
        `,
      },
      { role: "user", content: `Git Diff:\n${diff}` },
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
