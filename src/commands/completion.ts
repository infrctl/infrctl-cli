import type { Command } from "commander";
import { ValidationError } from "../utils/errors";

const COMMANDS = [
  "setup",
  "models",
  "pull",
  "chat",
  "ask",
  "serve",
  "doctor",
  "status",
  "sessions",
  "resume",
  "config",
  "completion",
  "update",
  "version"
];

const FAMILIES = ["qwen", "deepseek", "llama", "gemma", "phi", "all"];

function bashCompletion(): string {
  return `_infrctl_completion() {
  local cur prev
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    infrctl)
      COMPREPLY=( $(compgen -W "${COMMANDS.join(" ")}" -- "$cur") )
      return 0
      ;;
    pull|chat|ask|serve)
      COMPREPLY=( $(compgen -W "${FAMILIES.join(" ")}" -- "$cur") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
      return 0
      ;;
  esac
}
complete -F _infrctl_completion infrctl`;
}

function zshCompletion(): string {
  return `#compdef infrctl

_infrctl() {
  local -a commands families shells
  commands=(${COMMANDS.map((command) => `${command}:'infrctl ${command}'`).join(" ")})
  families=(${FAMILIES.join(" ")})
  shells=(bash zsh fish)

  if (( CURRENT == 2 )); then
    _describe 'command' commands
    return
  fi

  case "$words[2]" in
    pull|chat|ask|serve)
      _describe 'family' families
      ;;
    completion)
      _describe 'shell' shells
      ;;
  esac
}

_infrctl "$@"`;
}

function fishCompletion(): string {
  return [
    `complete -c infrctl -f -n '__fish_use_subcommand' -a '${COMMANDS.join(" ")}'`,
    `complete -c infrctl -f -n '__fish_seen_subcommand_from pull chat ask serve' -a '${FAMILIES.join(" ")}'`,
    `complete -c infrctl -f -n '__fish_seen_subcommand_from completion' -a 'bash zsh fish'`
  ].join("\n");
}

export function registerCompletionCommand(program: Command): void {
  program
    .command("completion")
    .description("Print shell completion script")
    .argument("<shell>", "bash, zsh, or fish")
    .action((shell: string) => {
      if (shell === "bash") {
        console.log(bashCompletion());
        return;
      }

      if (shell === "zsh") {
        console.log(zshCompletion());
        return;
      }

      if (shell === "fish") {
        console.log(fishCompletion());
        return;
      }

      throw new ValidationError("Unknown shell. Supported shells: bash, zsh, fish");
    });
}
