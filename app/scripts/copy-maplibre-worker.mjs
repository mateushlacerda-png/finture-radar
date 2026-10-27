// MapLibre 6 carrega o worker por URL; o bundler do Next não copia esse arquivo. Servimos de /public.
import fs from "node:fs";
import path from "node:path";
const src = path.resolve("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const dst = path.resolve("public/maplibre/maplibre-gl-worker.mjs");
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log("maplibre worker ->", path.relative(process.cwd(), dst));
