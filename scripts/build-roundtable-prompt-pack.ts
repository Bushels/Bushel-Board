import { readFileSync } from "node:fs";

import { buildRoundtableRolePromptPack } from "../lib/thesis/roundtable/build-role-prompt-pack";

function main(argv: string[]): void {
  const inputPath = argv[0];
  if (!inputPath) {
    process.stderr.write("Usage: tsx scripts/build-roundtable-prompt-pack.ts <input.json>\n");
    process.exit(1);
  }

  const raw = readFileSync(inputPath, "utf8");
  const payload = JSON.parse(raw) as Parameters<typeof buildRoundtableRolePromptPack>[0];
  const pack = buildRoundtableRolePromptPack(payload);
  process.stdout.write(`${JSON.stringify(pack, null, 2)}\n`);
}

main(process.argv.slice(2));
