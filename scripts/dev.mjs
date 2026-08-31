import { watch } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.PORT || 5173);
let building = false;
let queued = false;

async function build() {
  if (building) {
    queued = true;
    return;
  }
  building = true;

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build.mjs"], {
      stdio: "inherit"
    });
    child.on("exit", code => code === 0 ? resolve() : reject(new Error(`build failed: ${code}`)));
  }).catch(console.error);

  building = false;
  if (queued) {
    queued = false;
    await build();
  }
}

await build();

for (const dir of ["content", "templates", "src", "public", "plugins"]) {
  watch(dir, { recursive: true }, () => {
    clearTimeout(globalThis.__builderTimer);
    globalThis.__builderTimer = setTimeout(build, 120);
  });
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".avif": "image/avif"
};

http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const target = path.join("dist", pathname);
    const s = await stat(target);
    if (!s.isFile()) throw new Error("not file");

    res.setHeader("content-type", mime[path.extname(target)] || "application/octet-stream");
    res.end(await readFile(target));
  } catch {
    res.statusCode = 404;
    res.end("Not Found");
  }
}).listen(port, () => {
  console.log(`Dev server: http://localhost:${port}`);
});
