import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });

    child.on("error", reject);
  });
}

const testDistDir = path.resolve(".test-dist");
const tscCliPath = path.resolve("node_modules/typescript/bin/tsc");

await fs.rm(testDistDir, { recursive: true, force: true });

try {
  await run(process.execPath, [tscCliPath, "-p", "tsconfig.test.json"]);
  await run(process.execPath, [path.join(testDistDir, "test/run-tests.js")]);
} finally {
  await fs.rm(testDistDir, { recursive: true, force: true });
}
