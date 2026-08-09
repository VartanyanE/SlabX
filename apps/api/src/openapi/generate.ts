import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { openApiDocument } from "./document.js";

const outputPath = resolve(process.cwd(), "../../docs/openapi.json");
await mkdir(resolve(outputPath, ".."), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(openApiDocument, null, 2)}\n`,
  "utf8",
);
