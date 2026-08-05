# git-explain

`git-explain` is a CLI that explains Git diffs in clear human language using the user's own AI API key.

It is built for indie devs and vibe coders who use AI coding tools and want to quickly understand what changed when something suddenly works, breaks, or behaves differently.

## What It Does

- Reads the current Git diff.
- Sends the diff to the configured AI provider.
- Explains the change in organized Markdown, grouped by modified file.
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

Show the command guide:

```bash
git-explain guide
```

Explain all current changes:

```bash
git-explain explain
```

The explanation is grouped by file, with a short note about what changed, why it matters, risk, and what to test.

Explain staged or unstaged changes:

```bash
git-explain explain --staged
git-explain explain --unstaged
```

Explain a specific commit:

```bash
git-explain explain --commit <sha>
```

Ask for a cleaner no-emoji explanation:

```bash
git-explain explain --no-emoji
```

Print machine-readable JSON:

```bash
git-explain explain --json
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

Clear saved explanations:

```bash
git-explain history --clear
```

Open a saved explanation:

```bash
git-explain show <history-id>
```

Open the latest saved explanation:

```bash
git-explain show 0
```

Check local setup, Git state, provider access, and history:

```bash
git-explain doctor
```

Skip provider validation when you only want local checks:

```bash
git-explain doctor --skip-provider
```

## Example Output

```text
High-Level Summary

The CLI now explains diffs file by file, making AI-generated changes easier to review and debug.

Files Changed

src/index.ts
- What changed: Added new explain options and improved command output.
- Why it matters: Users can inspect staged, unstaged, or commit-specific changes.
- Risk: Medium, because command option combinations need to be handled carefully.
- Test: Run `git-explain explain --staged` and `git-explain explain --unstaged`.

src/utils/diff.ts
- What changed: Added helpers to split diffs into modified files.
- Why it matters: The AI can now produce clearer per-file explanations.
- Risk: Low obvious risk.
- Test: Run `npm test`.

What To Test

- Run `git-explain doctor`.
- Run `git-explain explain --no-emoji`.
- Run `git-explain history` and `git-explain show 0`.
```

## Supported Providers

- OpenAI
- Google Gemini
- Claude

The provider layer is intentionally small so more providers can be added later without changing the CLI flow.

## Development

```bash
npm run build
npm test
```
