// src/services/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import { type Config } from "../utils/config.js";
import {
  getErrorMessage,
  isAuthError,
  isQuotaError,
  type ValidationResult,
} from "./validation.js";
import { buildExplainPrompt, type PromptOptions } from "./prompt.js";

export const explainDiffWithGemini = async (
  diff: string,
  config: Config,
  options: PromptOptions,
): Promise<string> => {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const modelName = config.model.startsWith("models/")
    ? config.model
    : `models/${config.model}`;

  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = buildExplainPrompt(diff, options);

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new Error(
        `Gemini model "${config.model}" is not available for generateContent. Run \`git-explain config --provider gemini --model gemini-3.6-flash\` or run setup again.`,
      );
    }

    throw error;
  }
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

const isNotFoundError = (error: unknown): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 404
  );
};
