#!/usr/bin/env node
// Serve the anatomy library (out/anatomy) on localhost for the browser pane: node serve.mjs <dir> [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] || "out/anatomy");
const port = +(process.env.PORT || process.argv[3] || 8111);
const types = { ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".md": "text/markdown" };
http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "library.html";
  const file = path.resolve(root, rel);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(file, (err, buf) => {
    if (err) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }).end(buf);
  });
}).listen(port, "127.0.0.1", () => console.log(`anatomy library: http://127.0.0.1:${port}/ (${root})`));
