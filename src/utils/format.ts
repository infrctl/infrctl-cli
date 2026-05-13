export function formatGb(value?: number): string {
  if (value === undefined || Number.isNaN(value)) {
    return "unknown";
  }

  return `${Math.round(value)} GB`;
}

export function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function sentenceList(values: string[]): string {
  return values.join(", ");
}

export function nowUnixSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
