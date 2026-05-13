# Changelog

## 0.1.4

- Added Smith V2 coding-agent features:
  - Unified diff patches.
  - Git status awareness before and after work.
  - Patch backups and `infrctl smith --undo`.
  - Permission profiles: `safe`, `normal`, `fast`, and `danger`.
  - `--dry-run` and `--json`.
  - Repo memory from key files and package scripts.
  - Context compaction for longer sessions.
  - First-class test runner action.
  - Interactive Smith commands for status, diff, apply, reject, undo, run, test, model, and compact.
- Improved Smith safe mode so non-interactive runs can still read/search while blocking edits and commands.

## 0.1.3

- Added standalone install improvements and safer Ollama handling.
