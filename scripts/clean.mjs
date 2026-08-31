import { rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await rm(".builder-cache", { recursive: true, force: true });
console.log("Clean complete");
