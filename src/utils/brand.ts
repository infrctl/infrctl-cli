export const BRAND_TITLE = "infrctl";
export const BRAND_TAGLINE = "Five local AI model families. One CLI.";
export const BRAND_PROMISE = "Local by default through Ollama.";

export function brandHeader(): string {
  return `${BRAND_TITLE}
${BRAND_TAGLINE}
${BRAND_PROMISE}`;
}
