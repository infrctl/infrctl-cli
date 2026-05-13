import { isPortAvailable } from "./shell";

export async function findAvailablePort(
  host: string,
  startPort: number
): Promise<number> {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortAvailable(host, port)) {
      return port;
    }
  }

  throw new Error(`No available port found starting at ${startPort}.`);
}
