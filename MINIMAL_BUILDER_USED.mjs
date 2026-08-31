/**
 * MINIMAL_BUILDER_USED.mjs
 *
 * 이전 샘플에서 사용한 개념을 재구성한 최소 Static Builder 예제.
 * 목표: HTML + TypeScript + Tailwind CSS를 dist/에 출력.
 *
 * 정식 v1 빌더가 아니라 "왜 별도 프레임워크 없이도 빌드할 수 있는가"를
 * 보여주는 reference code다.
 */

import path from "node:path";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { compile } from "tailwindcss";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");

async function compileTypeScript() {
  const input = path.join(ROOT, "src/main.ts");
  const source = await readFile(input, "utf8");

  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
      sourceMap: false
    },
    fileName: "main.ts"
  });

  await mkdir(path.join(DIST, "assets"), { recursive: true });
  await writeFile(path.join(DIST, "assets/main.js"), result.outputText);
}

async function compileTailwind() {
  const input = path.join(ROOT, "src/styles.css");
  const css = await readFile(input, "utf8");

  // Tailwind CSS v4 compile API.
  // @import "tailwindcss" 및 @apply가 포함된 프로젝트 CSS를 빌드한다.
  const compiler = await compile(css, {
    base: ROOT
  });

  // v4 compile API는 utility candidate 목록을 build()에 전달하는 구조다.
  // 실제 프로젝트에서는 content scan 결과를 candidate로 수집해 넘긴다.
  // 이 최소 예제는 @apply 중심의 CSS를 설명하기 위한 reference다.
  const output = compiler.build([]);

  await mkdir(path.join(DIST, "assets"), { recursive: true });
  await writeFile(path.join(DIST, "assets/styles.css"), output);
}

async function copyStaticFiles() {
  await cp(path.join(ROOT, "index.html"), path.join(DIST, "index.html"));

  try {
    await cp(path.join(ROOT, "public"), DIST, { recursive: true });
  } catch {
    // public 폴더는 선택 사항
  }
}

async function createStandalone() {
  let html = await readFile(path.join(DIST, "index.html"), "utf8");
  const css = await readFile(path.join(DIST, "assets/styles.css"), "utf8");
  const js = await readFile(path.join(DIST, "assets/main.js"), "utf8");

  html = html
    .replace(
      /<link[^>]+href=["'][^"']*styles\.css["'][^>]*>/i,
      `<style>\n${css}\n</style>`
    )
    .replace(
      /<script[^>]+src=["'][^"']*main\.js["'][^>]*><\/script>/i,
      `<script type="module">\n${js}\n</script>`
    );

  await writeFile(path.join(DIST, "standalone.html"), html);
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await Promise.all([
    compileTypeScript(),
    compileTailwind()
  ]);

  await copyStaticFiles();
  await createStandalone();

  console.log("Static build complete.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
