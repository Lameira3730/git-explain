# git-explain

`git-explain` is a CLI that explains Git diffs in clear human language using the user's own AI API key.

It is built for indie devs and vibe coders who use AI coding tools and want to quickly understand what changed when something suddenly works, breaks, or behaves differently.

## What It Does

- Reads the current Git diff.
- Sends the diff to the configured AI provider.
- Explains the change in organized Markdown.
- Saves each explanation locally so the user can review past AI-generated changes.
- Keeps setup and configuration fully inside the terminal.

## Setup

```bash
npm install
npm run build
node dist/index.js setup
```

The setup command asks for:

- AI provider
- API key
- Preferred model

Configuration is stored locally at:

```text
~/.git-explain/config.json
```

## Commands

Explain all current changes:

```bash
git-explain explain
```

Explain specific files:

```bash
git-explain explain src/index.ts src/services/git.ts
```

Update config:

```bash
git-explain config --provider openai --model gpt-4o-mini
```

Show recent explanations:

```bash
git-explain history
```

Open a saved explanation:

```bash
git-explain show <history-id>
```

Check local setup, Git state, provider access, and history:

```bash
git-explain doctor
```

Skip provider validation when you only want local checks:

```bash
git-explain doctor --skip-provider
```

## Supported Providers

- OpenAI
- Google Gemini

The provider layer is intentionally small so more providers can be added later without changing the CLI flow.
