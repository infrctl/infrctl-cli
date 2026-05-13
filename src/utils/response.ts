export function stripThinkingBlocks(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
}
