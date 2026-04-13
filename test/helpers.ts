import fs from "node:fs/promises";
import type http from "node:http";
import os from "node:os";
import path from "node:path";

export async function listen(server: http.Server): Promise<{ server: http.Server; url: string }> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve server address");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

export async function close(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
}

export async function waitFor<T>(producer: () => Promise<T>, timeoutMs = 2000): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await producer();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function onlyEntry<T>(values: T[], label: string): T {
  const value = values[0];
  if (typeof value === "undefined") {
    throw new Error(`Expected at least one ${label}`);
  }

  return value;
}

export async function waitForEntries(
  producer: () => Promise<string[]>,
  label: string,
  timeoutMs = 2000,
): Promise<string[]> {
  return waitFor(async () => {
    const values = await producer();
    if (values.length === 0) {
      throw new Error(`Expected at least one ${label}`);
    }

    return values;
  }, timeoutMs);
}
