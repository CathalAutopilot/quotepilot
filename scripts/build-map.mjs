// Generates public/map-data.js: a dot-matrix map of Europe plus projected hubs and lanes.
// Run with `npm run map` after changing hubs or lanes. The output is committed.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { geoConicConformal, geoContains } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const W = 1000;
const H = 820;
const STEP = 9;

const topo = JSON.parse(await readFile(require.resolve("world-atlas/land-50m.json"), "utf8"));
const land = feature(topo, topo.objects.land);

const projection = geoConicConformal()
  .rotate([-10, 0])
  .parallels([40, 62])
  .fitExtent(
    [
      [0, 0],
      [W, H],
    ],
    {
      type: "MultiPoint",
      coordinates: [
        [-11, 35.5],
        [31, 35.5],
        [-11, 63],
        [31, 63],
      ],
    },
  );

const round = (n) => Math.round(n * 10) / 10;
const project = ([lon, lat]) => projection([lon, lat]).map(round);

// Dot matrix, stored as one SVG path of zero-length segments drawn with round caps.
let dots = "";
let count = 0;
for (let y = STEP / 2; y < H; y += STEP) {
  const offset = (Math.round(y / STEP) % 2) * (STEP / 2);
  for (let x = STEP / 2 + offset; x < W; x += STEP) {
    const ll = projection.invert([x, y]);
    if (ll && geoContains(land, ll)) {
      dots += `M${round(x)} ${round(y)}h0`;
      count += 1;
    }
  }
}

const hubs = {
  HAM: { name: "Hamburg", at: [9.99, 53.55], port: true, home: true },
  RTM: { name: "Rotterdam", at: [4.48, 51.92], port: true },
  ANR: { name: "Antwerp", at: [4.4, 51.22], port: true },
  FXT: { name: "Felixstowe", at: [1.35, 51.96], port: true },
  LEH: { name: "Le Havre", at: [0.11, 49.49], port: true },
  DUB: { name: "Dublin", at: [-6.26, 53.35], port: true },
  GOT: { name: "Gothenburg", at: [11.97, 57.71], port: true },
  GDN: { name: "Gdansk", at: [18.65, 54.35], port: true },
  WAW: { name: "Warsaw", at: [21.01, 52.23] },
  PRG: { name: "Prague", at: [14.42, 50.08] },
  MUC: { name: "Munich", at: [11.58, 48.14] },
  FRA: { name: "Frankfurt", at: [8.68, 50.11] },
  LYS: { name: "Lyon", at: [4.84, 45.76] },
  MIL: { name: "Milan", at: [9.19, 45.46] },
  GOA: { name: "Genoa", at: [8.93, 44.41], port: true },
  BCN: { name: "Barcelona", at: [2.17, 41.38], port: true },
  MAD: { name: "Madrid", at: [-3.7, 40.42] },
  VLC: { name: "Valencia", at: [-0.38, 39.47], port: true },
  VIE: { name: "Vienna", at: [16.37, 48.21] },
  BUD: { name: "Budapest", at: [19.04, 47.5] },
  CPH: { name: "Copenhagen", at: [12.57, 55.68] },
  PAR: { name: "Paris", at: [2.35, 48.86] },
  ATH: { name: "Athens", at: [23.73, 37.98] },
};

// Example lanes. `via` waypoints keep sea lanes on water.
const lanes = [
  { id: "ham-mil", mode: "road", from: "HAM", to: "MIL", via: [[10.2, 50.6], [10.4, 47.6]], load: "FTL, 33 pallets", basis: "Loading metre tariff" },
  { id: "ham-waw", mode: "road", from: "HAM", to: "WAW", via: [[15.2, 52.9]], load: "LTL, 6 pallets", basis: "Pallet tariff + fuel" },
  { id: "rtm-lys", mode: "road", from: "RTM", to: "LYS", via: [[4.2, 49.0]], load: "Groupage, 4.2 ldm", basis: "Weight band + zone" },
  { id: "anr-muc", mode: "road", from: "ANR", to: "MUC", via: [[8.4, 49.9]], load: "FTL, tail lift", basis: "Per km + tolls" },
  { id: "prg-ham", mode: "road", from: "PRG", to: "HAM", via: [[12.4, 51.9]], load: "LTL, 2,400 kg", basis: "Weight band" },
  { id: "bcn-mad", mode: "road", from: "BCN", to: "MAD", via: [[-0.9, 41.5]], load: "FTL, urgent", basis: "Lane rate + urgency" },
  { id: "vie-bud", mode: "road", from: "VIE", to: "BUD", via: [], load: "LTL, 3 pallets", basis: "Pallet tariff" },
  { id: "par-lys", mode: "road", from: "PAR", to: "LYS", via: [[3.6, 47.4]], load: "Groupage, extra stop", basis: "Zone tariff" },
  { id: "rtm-fxt", mode: "sea", from: "RTM", to: "FXT", via: [[3.4, 52.05], [2.2, 51.98]], load: "LCL, 8 cbm", basis: "W/M + BAF" },
  { id: "ham-got", mode: "sea", from: "HAM", to: "GOT", via: [[8.6, 53.95], [7.6, 54.6], [7.4, 56.6], [9.4, 57.75], [10.9, 58.0]], load: "FCL, 1 x 40HC", basis: "Per container + ETS" },
  { id: "anr-vlc", mode: "sea", from: "ANR", to: "VLC", via: [[3.2, 51.45], [1.6, 50.9], [-2.0, 49.9], [-5.6, 48.6], [-9.2, 45.8], [-10.0, 42.8], [-9.6, 38.6], [-8.6, 36.9], [-5.6, 35.95], [-3.0, 36.4], [-0.6, 37.5], [0.2, 38.8]], load: "FCL, 2 x 20DV", basis: "Per container + BAF, CAF" },
  { id: "leh-dub", mode: "sea", from: "LEH", to: "DUB", via: [[-1.2, 50.0], [-5.2, 49.9], [-6.3, 51.4], [-5.8, 52.9]], load: "LCL, 3.5 cbm", basis: "W/M + ETS" },
  { id: "goa-bcn", mode: "sea", from: "GOA", to: "BCN", via: [[8.2, 43.6], [5.4, 42.6], [3.4, 41.6]], load: "LCL, 12 cbm", basis: "W/M + BAF" },
  { id: "gdn-cph", mode: "sea", from: "GDN", to: "CPH", via: [[18.8, 54.9], [15.0, 55.0], [13.0, 55.2]], load: "FCL, 1 x 20DV", basis: "Per container" },
  { id: "fra-mad", mode: "air", from: "FRA", to: "MAD", arc: -0.22, load: "180 kg chargeable", basis: "Chargeable weight" },
  { id: "ham-ath", mode: "air", from: "HAM", to: "ATH", arc: 0.18, load: "420 kg chargeable", basis: "Chargeable weight" },
  { id: "dub-muc", mode: "air", from: "DUB", to: "MUC", arc: -0.2, load: "95 kg chargeable", basis: "Chargeable weight" },
  { id: "cph-mil", mode: "air", from: "CPH", to: "MIL", arc: 0.2, load: "260 kg chargeable", basis: "Chargeable weight" },
];

const outHubs = Object.fromEntries(
  Object.entries(hubs).map(([code, h]) => [code, { name: h.name, xy: project(h.at), port: !!h.port, home: !!h.home }]),
);
const outLanes = lanes.map((l) => ({
  id: l.id,
  mode: l.mode,
  from: l.from,
  to: l.to,
  load: l.load,
  basis: l.basis,
  arc: l.arc ?? null,
  points: [hubs[l.from].at, ...(l.via || []), hubs[l.to].at].map(project),
}));

const data = { width: W, height: H, step: STEP, dots, hubs: outHubs, lanes: outLanes };
await writeFile(
  new URL("../public/map-data.js", import.meta.url),
  `// Generated by scripts/build-map.mjs. Do not edit by hand.\nwindow.QP_MAP = ${JSON.stringify(data)};\n`,
);
console.log(`Wrote public/map-data.js with ${count} land dots, ${outLanes.length} lanes.`);
