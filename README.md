# infrctl

Five local AI model families. One CLI.

`infrctl` is a local-first command-line tool for running AI models from your terminal through Ollama. It keeps the user-facing model surface intentionally small: Qwen, DeepSeek, Llama, Gemma, and Phi.

## Install

Standalone install, no Node.js required:

```bash
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh | sh
```

The installer downloads the right binary from GitHub Releases into `~/.local/bin`, verifies the release checksum, and installs Ollama automatically if it is missing on Linux or macOS.

npm install, for Node.js users:

```bash
npm install -g infrctl
```

To inspect the installer first:

```bash
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh -o install.sh
sh install.sh
```

Requirements:

- Linux or macOS for the curl installer.
- `curl` or `wget`.

Node.js 18+ is required only for npm installs or local development.

If you already manage Ollama yourself, skip the bundled Ollama install:

```bash
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh \
  | INFRCTL_SKIP_OLLAMA=1 sh
```

## Quickstart

```bash
infrctl setup --starter
infrctl
infrctl -p "say hello from infrctl"
```

The starter setup installs Ollama if needed, starts it when possible, and pulls a lighter first-run model set: Phi and Qwen. Add more models later:

```bash
infrctl pull deepseek
infrctl pull llama
infrctl pull gemma
```

## Session-First CLI

`infrctl` is designed to feel like a modern interactive terminal assistant:

```bash
infrctl                         # start interactive chat
infrctl qwen                    # start chat with Qwen
infrctl -p "explain this log"   # print a one-shot answer
infrctl -p "continue" --continue
infrctl --resume <session-id>
infrctl sessions
```

Use JSON output for scripts:

```bash
infrctl -p "say hello" --output-format json
```

Pipe stdin into one-shot mode:

```bash
cat README.md | infrctl -p "summarize this"
```

Interactive chat sessions autosave locally:

```text
~/.infrctl/sessions/
~/.infrctl/chats/
```

Inside chat:

```text
/help
/status
/transcript
/switch qwen
/system <prompt>
/temp 0.4
/clear
/exit
```

## Commands

```bash
infrctl setup
infrctl setup --starter
infrctl models
infrctl pull qwen
infrctl pull all
infrctl chat qwen
infrctl ask qwen "hello"
infrctl serve qwen
infrctl serve qwen --auto-port
infrctl status
infrctl doctor
infrctl config show
infrctl sessions
infrctl resume
infrctl completion zsh
infrctl update
```

If a selected model is missing, `ask`, `chat`, and `serve` offer to pull it. Use `--yes` to skip the prompt:

```bash
infrctl -p "hello" --yes
```

## Supported Models

V1 exposes exactly five model families:

- Qwen
- DeepSeek
- Llama
- Gemma
- Phi

The real Ollama tags are selected through a local registry and hardware-aware recommendations.

## Local API

Start the local API server:

```bash
infrctl serve qwen
```

If the default port is busy:

```bash
infrctl serve qwen --auto-port
```

Chat completions:

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      { "role": "user", "content": "Hello" }
    ]
  }'
```

Health check:

```bash
curl http://127.0.0.1:8787/health
```

## Shell Completions

```bash
infrctl completion bash
infrctl completion zsh
infrctl completion fish
```

## Troubleshooting

Check your environment:

```bash
infrctl doctor
infrctl status
```

If Ollama is missing:

```bash
infrctl setup
```

If Ollama is installed but not running:

```bash
ollama serve
```

If a server port is busy:

```bash
infrctl serve phi --auto-port
```

If a model is missing:

```bash
infrctl pull phi
```

## Update

Standalone users can rerun the installer:

```bash
curl -fsSL https://raw.githubusercontent.com/infrctl/infrctl-cli/main/install.sh | sh
```

Node.js users can update with npm:

```bash
npm install -g infrctl@latest
```

From inside the CLI:

```bash
infrctl update
```

## Privacy

`infrctl` runs locally through Ollama. It does not send prompts to cloud APIs. It does not collect telemetry.

## Development

```bash
cd infrctl
npm ci
npm run check
npm run build:binary
```

Release checklist:

```text
docs/release-checklist.md
```

## License

MIT
