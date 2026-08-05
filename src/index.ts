#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import {
  defaultModels,
  saveConfig,
  getConfig,
  getConfigPath,
  resolveConfig,
  type Config,
} from "./utils/config.js";
import {
  getCommitDiff,
  getDiff,
  getGitContext,
  getStagedDiff,
  getUnstagedDiff,
  isGitRepository,
} from "./services/git.js";
import { explainDiffWithGemini, validateGeminiKey } from "./services/gemini.js";
import { explainDiffWithOpenAI, validateOpenAIKey } from "./services/openai.js";
import {
  clearHistory,
  getHistory,
  getHistoryEntry,
  getHistoryPath,
  saveHistoryEntry,
} from "./services/history.js";
import { formatDiffByFile, getChangedFiles, getDiffStat } from "./utils/diff.js";

const program = new Command();
marked.use(
  markedTerminal({
    showSectionPrefix: false,
    strong: chalk.bold,
    heading: chalk.cyan.bold,
    firstHeading: chalk.cyan.bold,
    hr: chalk.dim,
  }),
);

const providerModels: Record<
  "gemini" | "openai",
  { validationModel: string; models: string[] }
> = {
  gemini: {
    validationModel: "gemini-3.6-flash",
    models: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"],
  },
  openai: {
    validationModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1"],
  },
};

interface ConfigCommandOptions {
  provider?: string;
  model?: string;
  key?: string;
}

interface HistoryCommandOptions {
  limit: string;
  clear?: boolean;
}

interface DoctorCommandOptions {
  skipProvider?: boolean;
}

interface ExplainCommandOptions {
  staged?: boolean;
  unstaged?: boolean;
  commit?: string;
  emoji?: boolean;
  json?: boolean;
}

program
  .name("git-explain")
  .description("Explain Git changes in human language using AI")
  .version("1.0.0");

program
  .command("setup")
  .description("Initial setup of the CLI")
  .action(async () => {
    const { aiProvider } = await inquirer.prompt<{
      aiProvider: "gemini" | "openai";
    }>([
      {
        type: "select",
        name: "aiProvider",
        message: "Choose your AI provider:",
        choices: [
          { name: "Google Gemini", value: "gemini" },
          { name: "OpenAI", value: "openai" },
        ],
        default: "openai",
      },
    ]);

    const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
      {
        type: "input",
        name: "apiKey",
        message: `Enter your ${aiProvider === "gemini" ? "Google Gemini" : "OpenAI"} API Key:`,
      },
    ]);

    const spinner = ora("Validating API Key...").start();
    const validationModel = providerModels[aiProvider].validationModel;
    const validation =
      aiProvider === "gemini"
        ? await validateGeminiKey(apiKey.trim(), validationModel)
        : await validateOpenAIKey(apiKey.trim(), validationModel);

    if (validation.status === "invalid") {
      spinner.fail(chalk.red(validation.message || "Invalid API Key."));
      return;
    }

    if (validation.status === "quota") {
      spinner.warn(
        chalk.yellow(
          validation.message ||
            "API key looks valid, but the provider reports quota or rate limiting.",
        ),
      );
      console.log(
        chalk.dim(
          "You can still save this configuration, but explanations may fail until quota is available.",
        ),
      );
    } else if (validation.status === "error") {
      spinner.warn(
        chalk.yellow(
          `Could not fully validate the key: ${validation.message || "unknown error"}`,
        ),
      );
      console.log(
        chalk.dim(
          "The key will be saved, but you may need to check provider access if requests fail.",
        ),
      );
    } else {
      spinner.succeed(chalk.green("API Key validated!"));
    }

    const { model } = await inquirer.prompt<{ model: string }>([
      {
        type: "select",
        name: "model",
        message: "Choose the primary model:",
        choices: providerModels[aiProvider].models,
        default: providerModels[aiProvider].models[0],
      },
    ]);

    saveConfig({
      aiProvider,
      apiKey: apiKey.trim(),
      model,
    });

    console.log(chalk.green("\nSetup complete! You're ready to go. 🚀"));
  });

program
  .command("config")
  .description("Update configuration settings")
  .option("-p, --provider <provider>", "Update AI provider")
  .option("-m, --model <model>", "Update model")
  .option("-k, --key <key>", "Update API Key")
  .action((options: ConfigCommandOptions) => {
    const currentConfig = getConfig();
    const provider = getProviderOption(options.provider);

    if (options.provider && !provider) {
      console.log(chalk.red("Error: provider must be `gemini` or `openai`."));
      return;
    }

    const draftConfig: Partial<Config> = {
      ...currentConfig,
      aiProvider: provider || currentConfig?.aiProvider,
    };

    if (draftConfig.aiProvider && !draftConfig.model) {
      draftConfig.model = defaultModels[draftConfig.aiProvider];
    }
    if (options.model) draftConfig.model = options.model;
    if (options.key) draftConfig.apiKey = options.key;

    const newConfig = resolveConfig(draftConfig);

    if (!newConfig) {
      console.log(
        chalk.red(
          "Error: missing API key. Run `git-explain setup`, pass `--key`, or set OPENAI_API_KEY/GEMINI_API_KEY.",
        ),
      );
      return;
    }

    saveConfig(newConfig);
    console.log(chalk.green("Configuration updated!"));
    console.table({
      ...newConfig,
      apiKey: maskApiKey(newConfig.apiKey),
    });
  });

program
  .command("explain")
  .description("Explain current Git changes")
  .option("--staged", "Explain staged changes only")
  .option("--unstaged", "Explain unstaged changes only")
  .option("--commit <sha>", "Explain a specific commit")
  .option("--no-emoji", "Ask the AI for a cleaner explanation without emojis")
  .option("--json", "Print machine-readable JSON output")
  .argument("[files...]", "Specific files to analyze")
  .action(async (files: string[], options: ExplainCommandOptions) => {
    const config = getConfig();
    if (!config) {
      console.log(chalk.red("Error: Run `git-explain setup` first."));
      return;
    }

    const modeError = getExplainModeError(options);
    if (modeError) {
      console.log(chalk.red(modeError));
      return;
    }

    const diffMode = getExplainMode(options);

    const inRepo = await safely(isGitRepository, false);
    if (!inRepo) {
      printJsonOrText(
        options.json,
        {
          ok: false,
          error: "not_git_repository",
          message: "Run `git-explain explain` inside a Git repository.",
        },
        chalk.red("Error: Run `git-explain explain` inside a Git repository."),
      );
      return;
    }

    const spinner = ora(
      files.length
        ? `Analyzing ${diffMode.label} for files: ${files.join(", ")}...`
        : `Analyzing ${diffMode.label}...`,
    );
    if (!options.json) spinner.start();

    try {
      const diff = await diffMode.getDiff(files);

      if (!diff) {
        if (!options.json) spinner.stop();
        printJsonOrText(
          options.json,
          {
            ok: false,
            error: "empty_diff",
            mode: diffMode.historyMode,
            message: `No ${diffMode.label} found to explain.`,
          },
          chalk.yellow(`No ${diffMode.label} found to explain.`),
        );
        return;
      }

      const [gitContext, diffStat] = await Promise.all([
        getGitContext(),
        Promise.resolve(getDiffStat(diff)),
      ]);
      const changedFiles = getChangedFiles(diff);
      const formattedDiff = formatDiffByFile(diff);

      const explanation =
        config.aiProvider === "openai"
          ? await explainDiffWithOpenAI(formattedDiff, config, {
              includeEmoji: options.emoji !== false,
            })
          : await explainDiffWithGemini(formattedDiff, config, {
              includeEmoji: options.emoji !== false,
            });

      const historyEntry = saveHistoryEntry({
        provider: config.aiProvider,
        model: config.model,
        branch: gitContext.branch,
        commit: gitContext.commit,
        files: files.length ? files : changedFiles,
        mode: diffMode.historyMode,
        diffStat,
        explanation,
      });

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              id: historyEntry.id,
              provider: historyEntry.provider,
              model: historyEntry.model,
              branch: historyEntry.branch,
              commit: historyEntry.commit,
              mode: historyEntry.mode,
              files: historyEntry.files,
              diffStat: historyEntry.diffStat,
              explanation,
            },
            null,
            2,
          ),
        );
        return;
      }

      spinner.succeed(
        `Analysis complete. Saved as ${chalk.cyan(historyEntry.id)}\n`,
      );
      printDiffStat(diffStat);
      console.log(await renderMarkdown(explanation));
    } catch (error) {
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ok: false,
              error: "analysis_failed",
              message: getDisplayErrorMessage(error),
            },
            null,
            2,
          ),
        );
        return;
      }

      spinner.fail("Error analyzing changes.");
      console.error(getDisplayErrorMessage(error));
    }
  });

program
  .command("history")
  .description("Show recent explanations")
  .option("-l, --limit <number>", "Number of entries to show", "10")
  .option("--clear", "Delete all saved explanations")
  .action(async (options: HistoryCommandOptions) => {
    if (options.clear) {
      const history = getHistory();

      if (!history.length) {
        console.log(chalk.yellow("History is already empty."));
        return;
      }

      const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
        {
          type: "confirm",
          name: "confirmed",
          message: `Delete ${history.length} saved explanation${history.length === 1 ? "" : "s"}?`,
          default: false,
        },
      ]);

      if (!confirmed) {
        console.log(chalk.yellow("History was not changed."));
        return;
      }

      clearHistory();
      console.log(chalk.green("History cleared."));
      return;
    }

    const limit = Number.parseInt(options.limit, 10);
    const history = getHistory().slice(0, Number.isNaN(limit) ? 10 : limit);

    if (!history.length) {
      console.log(chalk.yellow("No explanations saved yet."));
      console.log(chalk.dim(`History will be stored at ${getHistoryPath()}`));
      return;
    }

    console.table(
      history.map((entry) => ({
        id: entry.id,
        date: new Date(entry.createdAt).toLocaleString(),
        provider: entry.provider,
        model: entry.model,
        branch: entry.branch,
        commit: entry.commit,
        mode: entry.mode || "working tree",
        files: entry.diffStat.filesChanged,
        changes: `+${entry.diffStat.additions} / -${entry.diffStat.deletions}`,
      })),
    );
  });

program
  .command("show")
  .description("Show a saved explanation")
  .argument("<id>", "History entry id")
  .action(async (id: string) => {
    const entry = getHistoryEntry(id);

    if (!entry) {
      console.log(chalk.red(`No history entry found for id: ${id}`));
      console.log(chalk.dim("Run `git-explain history` and then `git-explain show 0` for the latest entry."));
      return;
    }

    console.log(chalk.bold(`\n${entry.provider} / ${entry.model}`));
    console.log(
      chalk.dim(
        `${new Date(entry.createdAt).toLocaleString()} | ${entry.branch}@${entry.commit}`,
      ),
    );
    printDiffStat(entry.diffStat);
    console.log(await renderMarkdown(entry.explanation));
  });

program
  .command("doctor")
  .description("Check git-explain setup, Git state, provider access, and history")
  .option("--skip-provider", "Skip provider validation")
  .action(async (options: DoctorCommandOptions) => {
    console.log(chalk.bold("\ngit-explain doctor\n"));

    const config = getConfig();
    printCheck(
      Boolean(config),
      "Configuration",
      config
        ? `${config.aiProvider} / ${config.model} (${maskApiKey(config.apiKey)})`
        : "Run `git-explain setup` or set OPENAI_API_KEY/GEMINI_API_KEY.",
    );

    console.log(chalk.dim(`Config path: ${getConfigPath()}`));
    console.log(chalk.dim(`History path: ${getHistoryPath()}\n`));

    const inRepo = await safely(isGitRepository, false);
    printCheck(
      inRepo,
      "Git repository",
      inRepo ? "Current directory is a Git repo." : "Run this inside a Git repo.",
    );

    if (inRepo) {
      const gitContext = await safely(getGitContext, null);
      printCheck(
        Boolean(gitContext),
        "Git context",
        gitContext
          ? `${gitContext.branch}@${gitContext.commit}`
          : "Could not read branch/commit.",
      );

      const diff = await safely(() => getDiff(), "");
      const diffStat = getDiffStat(diff);
      printCheck(
        true,
        "Current diff",
        diff
          ? `${diffStat.filesChanged} files changed | +${diffStat.additions} / -${diffStat.deletions}`
          : "No unstaged/uncommitted diff found.",
        "warn",
      );
    }

    const history = getHistory();
    printCheck(
      true,
      "History",
      history.length
        ? `${history.length} saved explanation${history.length === 1 ? "" : "s"}.`
        : "No explanations saved yet.",
      history.length ? "pass" : "warn",
    );

    if (!config || options.skipProvider) return;

    const spinner = ora("Checking provider access...").start();
    const validationModel = providerModels[config.aiProvider].validationModel;
    const validation =
      config.aiProvider === "gemini"
        ? await validateGeminiKey(config.apiKey, validationModel)
        : await validateOpenAIKey(config.apiKey, validationModel);

    if (validation.status === "valid") {
      spinner.succeed("Provider access looks good.");
      return;
    }

    if (validation.status === "quota") {
      spinner.warn(validation.message || "Provider reports quota/rate limiting.");
      return;
    }

    spinner.fail(validation.message || "Provider validation failed.");
  });

program
  .command("guide")
  .alias("commands")
  .description("Show a friendly guide to the main commands")
  .action(() => {
    console.log(chalk.bold("\ngit-explain command guide\n"));
    console.log(`${chalk.cyan("setup")}      Configure provider, API key, and model.`);
    console.log(chalk.dim("           npm run dev -- setup\n"));
    console.log(`${chalk.cyan("doctor")}     Check config, Git state, provider access, and history.`);
    console.log(chalk.dim("           npm run dev -- doctor"));
    console.log(chalk.dim("           npm run dev -- doctor --skip-provider\n"));
    console.log(`${chalk.cyan("explain")}    Explain a diff in human language.`);
    console.log(chalk.dim("           npm run dev -- explain"));
    console.log(chalk.dim("           npm run dev -- explain --staged"));
    console.log(chalk.dim("           npm run dev -- explain --unstaged"));
    console.log(chalk.dim("           npm run dev -- explain --commit abc123"));
    console.log(chalk.dim("           npm run dev -- explain --json"));
    console.log(chalk.dim("           npm run dev -- explain --no-emoji src/index.ts\n"));
    console.log(`${chalk.cyan("history")}    List saved explanations.`);
    console.log(chalk.dim("           npm run dev -- history"));
    console.log(chalk.dim("           npm run dev -- history --limit 20"));
    console.log(chalk.dim("           npm run dev -- history --clear\n"));
    console.log(`${chalk.cyan("show")}       Open a saved explanation by id or index.`);
    console.log(chalk.dim("           npm run dev -- show 0"));
    console.log(chalk.dim("           npm run dev -- show msg9ljxt-3tr5nl\n"));
    console.log(`${chalk.cyan("config")}     Update provider, model, or API key without rerunning setup.`);
    console.log(chalk.dim("           npm run dev -- config --provider gemini --model gemini-3.6-flash"));
    console.log(chalk.dim("           npm run dev -- config --provider openai --key sk-...\n"));
  });

program.parse(process.argv);

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function getProviderOption(provider: unknown): Config["aiProvider"] | null {
  return provider === "gemini" || provider === "openai" ? provider : null;
}

function getExplainMode(options: ExplainCommandOptions): {
  label: string;
  historyMode: string;
  getDiff: (files: string[]) => Promise<string>;
} {
  if (options.staged) {
    return {
      label: "staged changes",
      historyMode: "staged",
      getDiff: getStagedDiff,
    };
  }

  if (options.unstaged) {
    return {
      label: "unstaged changes",
      historyMode: "unstaged",
      getDiff: getUnstagedDiff,
    };
  }

  if (options.commit) {
    return {
      label: `commit ${options.commit}`,
      historyMode: `commit:${options.commit}`,
      getDiff: (files) => getCommitDiff(options.commit as string, files),
    };
  }

  return {
    label: "working tree changes",
    historyMode: "working-tree",
    getDiff,
  };
}

function getExplainModeError(options: ExplainCommandOptions): string | null {
  const selectedModes = [options.staged, options.unstaged, Boolean(options.commit)]
    .filter(Boolean)
    .length;

  if (selectedModes > 1) {
    return "Choose only one diff mode: --staged, --unstaged, or --commit <sha>.";
  }

  return null;
}

function printCheck(
  passed: boolean,
  label: string,
  message: string,
  level: "pass" | "warn" = "pass",
) {
  const icon = passed
    ? level === "warn"
      ? chalk.yellow("!")
      : chalk.green("✓")
    : chalk.red("x");

  console.log(`${icon} ${chalk.bold(label)} ${chalk.dim(message)}`);
}

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function printDiffStat(diffStat: {
  filesChanged: number;
  additions: number;
  deletions: number;
}) {
  console.log(
    chalk.dim(
      `${diffStat.filesChanged} files changed | +${diffStat.additions} / -${diffStat.deletions}\n`,
    ),
  );
}

function printJsonOrText(
  json: boolean | undefined,
  jsonValue: unknown,
  text: string,
) {
  if (json) {
    console.log(JSON.stringify(jsonValue, null, 2));
    return;
  }

  console.log(text);
}

function getDisplayErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function renderMarkdown(markdown: string): Promise<string> {
  const rendered = await marked.parse(markdown);

  return rendered
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .trim();
}
