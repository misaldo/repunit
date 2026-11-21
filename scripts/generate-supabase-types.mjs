import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectId = process.env.SUPABASE_PROJECT_ID || "kqezgcwfqfntazucbbzt";
const executable = process.platform === "win32" ? "npx.cmd" : "npx";

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("Set SUPABASE_ACCESS_TOKEN in your local shell first. Never commit it or paste it into chat.");
  process.exit(1);
}

const result = spawnSync(
  executable,
  ["--yes", "supabase@latest", "gen", "types", "typescript", "--project-id", projectId, "--schema", "public"],
  { encoding: "utf8", env: process.env, shell: process.platform === "win32" },
);

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

const generated = (result.stdout ?? "").trim();
if (!generated.includes("export type Database")) {
  console.error("Supabase CLI returned no Database type. The existing file was not changed.");
  process.exit(1);
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(currentDirectory, "../src/integrations/supabase/types.ts");
writeFileSync(outputPath, generated + "\n", "utf8");
console.log("Updated src/integrations/supabase/types.ts from Supabase project " + projectId + ".");
