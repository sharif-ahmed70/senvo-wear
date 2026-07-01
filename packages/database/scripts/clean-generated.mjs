import { rmSync } from "node:fs";

rmSync("generated", { force: true, recursive: true });
