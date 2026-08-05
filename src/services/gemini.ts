// src/services/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { type Config } from "../utils/config.js";
import {
  getErrorMessage,
  isAuthError,
  isQuotaError,
  type ValidationResult,
} from "./validation.js";

export const explainDiffWithGemini = async (
  diff: string,
  config: Config,
): Promise<string> => {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const modelName = config.model.startsWith("models/")
    ? config.model
    : `models/${config.model}`;

  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `
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
    
    Git Diff:
    ${diff}
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
};

export const validateGeminiKey = async (
  apiKey: string,
  _model: string,
): Promise<ValidationResult> => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey.trim()}`,
    );

    if (response.ok) return { status: "valid" };

    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return {
        status: "invalid",
        message: "Gemini rejected this API key.",
      };
    }

    if (response.status === 429) {
      return {
        status: "quota",
        message: "Gemini accepted the key, but the project is currently rate limited or out of quota.",
      };
    }

    return {
      status: "error",
      message: `Gemini API returned ${response.status}: ${await response.text()}`,
    };
  } catch (error) {
    if (isQuotaError(error)) {
      return {
        status: "quota",
        message: "Gemini accepted the key, but the project is currently rate limited or out of quota.",
      };
    }

    if (isAuthError(error)) {
      return {
        status: "invalid",
        message: "Gemini rejected this API key.",
      };
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
};
