# Smith Coding Agent

Smith is the local coding agent built into `infrctl`.

It uses the same local Ollama-backed model families as chat and ask. It scans your repo, builds a small repo map, reads key files, proposes unified diff patches, asks for approval by default, and can run project checks through a guarded shell policy.

## Start Smith

```bash
infrctl smith "explain this repo"
infrctl smith "fix the failing config test"
infrctl smith --model qwen "add a CLI option"
```

Open interactive mode:

```bash
infrctl smith
```

Use another workspace:

```bash
infrctl smith --cwd /path/to/repo "find the test command"
```

## Safety Model

Smith defaults to `--profile normal`.

That means:

- Reads and searches are automatic.
- File edits are proposed as unified diffs.
- You approve patches before Smith applies them.
- Shell commands ask first.
- Destructive, deploy, publish, private-key, and shell-wrapper commands are blocked.

Profiles:

```bash
infrctl smith --profile safe "review this repo"
infrctl smith --profile normal "fix the bug"
infrctl smith --profile fast "fix and run tests"
infrctl smith --profile danger "move fast"
```

`safe` is the best mode for first-time use and demos. It allows repo scanning,
file reads, and searches, but it will not edit files or run commands.

`danger` is still not truly dangerous in V1. It keeps the hard command blocklist.

## Dry Run

Use dry run when you want to see the work without changing files:

```bash
infrctl smith --dry-run "add docs for the serve command"
```

Dry run captures the patch and skips file edits and shell commands.

## JSON Output

Use JSON for scripts:

```bash
infrctl smith --json "summarize this repo"
```

The JSON output includes the session id, plan, events, patches, git state, and final message.

## Undo

Smith saves a backup before applying unified diff patches.

```bash
infrctl smith --undo
```

Patch backups live in:

```text
~/.infrctl/agent-patches/
```

## Interactive Commands

```text
/status               Show model, profile, approval, shell, and session info
/diff                 Show the latest pending patch or current git diff
/apply                Apply the latest dry-run unified diff patch
/reject               Clear the pending patch
/undo                 Restore the latest Smith patch backup
/run npm test         Run a command through Smith's shell policy
/test small           Run the smallest detected package check
/test full            Run all detected package checks
/model qwen           Switch model family
/compact              Refresh repo memory
/exit                 Quit
```

## Examples

Fix a failing test:

```bash
infrctl smith --model qwen "run the smallest test, fix the failure, then run it again"
```

Explain a repo:

```bash
infrctl smith --profile safe "explain the architecture of this repo"
```

Add a CLI option:

```bash
infrctl smith "add --json to the status command and cover it with tests"
```

Write docs:

```bash
infrctl smith "write docs for the serve command"
```

## Local Files

Smith stores local state under `~/.infrctl`:

```text
agent-sessions/       Smith session logs
agent-patches/        Undo backups
repo-memory/          Per-repo summaries
```

No prompts or repo contents are sent to cloud APIs by `infrctl`.
