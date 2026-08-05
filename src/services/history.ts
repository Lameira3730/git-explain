import fs from "fs";
import path from "path";
import { ensureAppDir, getAppDir } from "../utils/config.js";

const HISTORY_PATH = path.join(getAppDir(), "history.json");
const MAX_HISTORY_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  createdAt: string;
  provider: "gemini" | "openai";
  model: string;
  branch: string;
  commit: string;
  files: string[];
  diffStat: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  explanation: string;
}

export const saveHistoryEntry = (
  entry: Omit<HistoryEntry, "id" | "createdAt">,
): HistoryEntry => {
  ensureAppDir();
  const entries = getHistory();
  const savedEntry: HistoryEntry = {
    id: createHistoryId(),
    createdAt: new Date().toISOString(),
    ...entry,
  };

  const nextEntries = [savedEntry, ...entries].slice(0, MAX_HISTORY_ENTRIES);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(nextEntries, null, 2));

  return savedEntry;
};

export const getHistory = (): HistoryEntry[] => {
  if (!fs.existsSync(HISTORY_PATH)) return [];

  const history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
  return Array.isArray(history) ? (history as HistoryEntry[]) : [];
};

export const getHistoryEntry = (id: string): HistoryEntry | null => {
  return getHistory().find((entry) => entry.id === id) || null;
};

export const getHistoryPath = (): string => HISTORY_PATH;

const createHistoryId = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};
