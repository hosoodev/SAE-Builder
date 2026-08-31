import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { resolveConfig, createLogger, BuilderError } from "../../src/core/index.js";
import { createPluginRunner } from "../../src/plugin/index.js";
import type { PluginContext } from "../../src/plugin/index.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "sae-plugin-"));
  const outputRoot = path.join(root, "dist");
  const config = resolveConfig({
    site: { name: "Plugin fixture", url: "https://example.test/" },
  }, root, path.join(root, "builder.config.mjs"));
  return { root, outputRoot, config };
}

test("plugin lifecycle uses stable pre/normal/post ordering and root-safe emit", async () => {
  const { outputRoot, config } = await fixture();
  const calls: string[] = [];
  const plugins = [
    { name: "normal", buildStart() { calls.push("normal"); } },
    { name: "post", enforce: "post" as const, buildStart() { calls.push("post"); } },
    {
      name: "pre",
      enforce: "pre" as const,
      async buildStart(context: PluginContext) {
        calls.push("pre");
        await context.emitFile("plugin/value.txt", "safe");
      },
    },
  ];
  const runner = createPluginRunner(plugins, {
    config, outputRoot, mode: "production", logger: createLogger("silent"),
  });
  await runner.buildStart();

  assert.deepEqual(calls, ["pre", "normal", "post"]);
  assert.equal(await readFile(path.join(outputRoot, "plugin", "value.txt"), "utf8"), "safe");
});

test("plugin failures identify the plugin and hook", async () => {
  const { outputRoot, config } = await fixture();
  const runner = createPluginRunner([{
    name: "broken",
    buildStart() { throw new Error("cause"); },
  }], { config, outputRoot, mode: "production", logger: createLogger("silent") });

  await assert.rejects(
    runner.buildStart(),
    (error: unknown) => error instanceof BuilderError
      && error.code === "PLUGIN_FAILED"
      && error.details?.plugin === "broken"
      && error.details?.hook === "buildStart",
  );
});

test("plugin output cannot escape the staging root", async () => {
  const { outputRoot, config } = await fixture();
  const runner = createPluginRunner([{
    name: "escape",
    async buildStart(context) { await context.emitFile("../escape.txt", "no"); },
  }], { config, outputRoot, mode: "production", logger: createLogger("silent") });
  await assert.rejects(runner.buildStart(), /Plugin 'escape' failed in buildStart/);
});
