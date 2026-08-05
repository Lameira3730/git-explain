#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { Marked } from "marked";
import TerminalRenderer from "marked-terminal";
import {
  defaultModels,
  saveConfig,
  getConfig,
  getConfigPath,
  resolveConfig,
  type Config,
} from "./utils/config.js";
import { getDiff, getGitContext, isGitRepository } from "./services/git.js";
import { explainDiffWithGemini, validateGeminiKey } from "./services/gemini.js";
import { explainDiffWithOpenAI, validateOpenAIKey } from "./services/openai.js";
import {
  getHistory,
  getHistoryEntry,
  getHistoryPath,
  saveHistoryEntry,
} from "./services/history.js";
import { getDiffStat } from "./utils/diff.js";

const program = new Command();
const marked = new Marked(new TerminalRenderer());

const providerModels: Record<
  "gemini" | "openai",
  { validationModel: string; models: string[] }
> = {
  gemini: {
    validationModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-pro"],
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
}

interface DoctorCommandOptions {
  skipProvider?: boolean;
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
  .argument("[files...]", "Specific files to analyze")
  .action(async (files: string[]) => {
    const config = getConfig();
    if (!config) {
      console.log(chalk.red("Error: Run `git-explain setup` first."));
      return;
    }

    const spinner = ora(
      files.length
        ? `Analyzing files: ${files.join(", ")}...`
        : "Analyzing all changes...",
    ).start();

    try {
      const diff = await getDiff(files);

      if (!diff) {
        spinner.stop();
        console.log(chalk.yellow("No changes found to explain."));
        return;
      }

      const [gitContext, diffStat] = await Promise.all([
        getGitContext(),
        Promise.resolve(getDiffStat(diff)),
      ]);

      const explanation =
        config.aiProvider === "openai"
          ? await explainDiffWithOpenAI(diff, config)
          : await explainDiffWithGemini(diff, config);

      const historyEntry = saveHistoryEntry({
        provider: config.aiProvider,
        model: config.model,
        branch: gitContext.branch,
        commit: gitContext.commit,
        files,
        diffStat,
        explanation,
      });

      spinner.succeed(
        `Analysis complete. Saved as ${chalk.cyan(historyEntry.id)}\n`,
      );
      printDiffStat(diffStat);
      console.log(await marked.parse(explanation));
    } catch (error) {
      spinner.fail("Error analyzing changes.");
      console.error(error);
    }
  });

program
  .command("history")
  .description("Show recent explanations")
  .option("-l, --limit <number>", "Number of entries to show", "10")
  .action((options: HistoryCommandOptions) => {
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
      return;
    }

    console.log(chalk.bold(`\n${entry.provider} / ${entry.model}`));
    console.log(
      chalk.dim(
        `${new Date(entry.createdAt).toLocaleString()} | ${entry.branch}@${entry.commit}`,
      ),
    );
    printDiffStat(entry.diffStat);
    console.log(await marked.parse(entry.explanation));
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

program.parse(process.argv);

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function getProviderOption(provider: unknown): Config["aiProvider"] | null {
  return provider === "gemini" || provider === "openai" ? provider : null;
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
