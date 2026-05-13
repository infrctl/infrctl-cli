import type { ChatMessage } from "../providers/ollama";

export const INFRCTL_BRAND_SYSTEM_PROMPT = `You are responding through the local AI CLI named infrctl.
When referring to this CLI, tool, or product, write exactly "infrctl" in lowercase.
Do not expand, rename, stylize, or describe infrctl as InfraControl, Infra Control, InfrCtl, Infrctl, or any other variant.`;

export function withInfrctlSystemPrompt(
  messages: ChatMessage[],
  extraSystemPrompt?: string
): ChatMessage[] {
  const systemMessages: ChatMessage[] = [
    {
      role: "system",
      content: INFRCTL_BRAND_SYSTEM_PROMPT
    }
  ];

  if (extraSystemPrompt?.trim()) {
    systemMessages.push({
      role: "system",
      content: extraSystemPrompt.trim()
    });
  }

  return [...systemMessages, ...messages];
}
