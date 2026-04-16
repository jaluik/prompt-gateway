import fs from "node:fs/promises";
import path from "node:path";

const cliPath = path.resolve("dist/cli.js");
const cliContents = await fs.readFile(cliPath, "utf8");

if (!cliContents.startsWith("#!/usr/bin/env node\n")) {
  await fs.writeFile(cliPath, `#!/usr/bin/env node\n${cliContents}`, "utf8");
}

await fs.chmod(cliPath, 0o755);
