import net from "node:net";
import { execa } from "execa";

export async function commandExists(command: string): Promise<boolean> {
  try {
    await execa(command, ["--version"], { reject: false });
    return true;
  } catch {
    return false;
  }
}

export async function isPortAvailable(
  host: string,
  port: number
): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}
