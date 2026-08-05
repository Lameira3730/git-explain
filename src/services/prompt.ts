export interface PromptOptions {
  includeEmoji: boolean;
}

export const buildExplainPrompt = (
  diff: string,
  options: PromptOptions,
): string => {
  const emojiInstruction = options.includeEmoji
    ? "Use emojis sparingly only when they improve scanning."
    : "Do not use emojis.";

  return `
Act as a senior developer helping an indie dev understand AI-generated code changes.
Explain the Git diff in plain human language, optimized for debugging and fast review.

Tone:
- Clear, calm, practical.
- Friendly, but not hypey.
- Avoid generic praise and PR-review filler.
- ${emojiInstruction}

The diff is grouped by file using markers like:
FILE 1: path/to/file.ts
STATS: +10 / -2
DIFF:

Format exactly these sections:

## High-Level Summary
2-4 short sentences explaining the overall change and why it matters.

## Files Changed
Create one subsection per modified file.
Use this exact subsection format:

### path/to/file.ext
- What changed: short explanation.
- Why it matters: practical impact.
- Risk: possible issue, or "Low obvious risk."
- Test: one concrete thing to verify.

## Why It Matters
Explain the overall behavioral impact across files in practical terms.

## Possible Risks
List anything that could break, regress, or surprise the user. If there are no obvious risks, say so.

## What To Test
Give a short checklist of manual checks or commands the user should run next.

Rules:
- Use Markdown headings and bullets only.
- Keep it concise.
- Do not mention pull requests unless the diff clearly comes from a PR.
- Do not end with generic compliments.
- If the diff is too large, focus on the most impactful changes.

Git Diff:
${diff}
`;
};
