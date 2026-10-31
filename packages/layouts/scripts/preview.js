#!/usr/bin/env node
/**
 * Wireframe preview: every kind's layout for one Mood, as SVG (boxes outlined with role · slot · type role labels,
 * flow items stamped from their item layout, content frame, safe area and decor zones drawn).
 *
 *   node packages/layouts/scripts/preview.js out/stripe/mood.json [--out out/_layouts]
 *
 * Writes <out>/<mood.id>/<kind>.svg (default out: <repo>/out/_layouts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, buildLayout, contentFrame, itemLayout, safe } from '../src/index.js';
import { flowCells } from '../src/common.js';
import { space } from '../src/geometry.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Representative content summaries (the showcase deck's counts). */
export const SAMPLE = {
  cover: {},
  section: {},
  agenda: { items: 5 },
  bullets: { items: 5 },
  text: {},
  'two-column': { columns: 2 },
  cards: { items: 4 },
  steps: { items: 3 },
  timeline: { items: 4 },
  kpi: { items: 4 },
  chart: { hasChart: true },
  table: { hasTable: true },
  image: { hasImage: true },
  'image-text': { hasImage: true },
  quote: {},
  team: { items: 3 },
  logos: { items: 6 },
  cta: {},
};

const COLORS = {
  title: '#1f6feb',
  subtitle: '#3b82f6',
  body: '#16a34a',
  list: '#16a34a',
  image: '#a855f7',
  chart: '#ea580c',
  table: '#ea580c',
  kpis: '#db2777',
  group: '#db2777',
  quote: '#0891b2',
  attribution: '#0e7490',
  logo: '#111827',
  footer: '#6b7280',
  number: '#b45309',
  shape: '#9ca3af',
  divider: '#9ca3af',
  eyebrow: '#2563eb',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const r1 = (n) => Math.round(n * 10) / 10;

function rect(f, { stroke, dash = '', fill = 'none', width = 2 }) {
  return `<rect x="${r1(f.x)}" y="${r1(f.y)}" width="${r1(f.w)}" height="${r1(f.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
function label(f, text, color, size = 18) {
  return `<text x="${r1(f.x + 6)}" y="${r1(f.y + size + 2)}" font-family="Menlo, monospace" font-size="${size}" fill="${color}">${esc(text)}</text>`;
}

export function layoutSvg(layout, mood, opts = {}) {
  const slotRole = Object.fromEntries(layout.slots.map((s) => [s.box, s]));
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">`);
  out.push(
    `<defs><pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="16" stroke="#f59e0b" stroke-width="3" stroke-opacity="0.35"/></pattern></defs>`,
  );
  out.push(`<rect width="1920" height="1080" fill="#ffffff"/>`);
  for (const z of layout.decor?.zones ?? []) {
    out.push(rect(z, { stroke: '#f59e0b', fill: 'url(#hatch)', dash: '4 6', width: 1 }));
  }
  out.push(rect(safe(mood), { stroke: '#d1d5db', dash: '2 6', width: 1 }));
  out.push(rect(contentFrame(mood.geometry), { stroke: '#93c5fd', dash: '10 6', width: 1 }));
  for (const box of layout.boxes) {
    const color = COLORS[box.role] ?? '#374151';
    const s = slotRole[box.id];
    out.push(rect(box.frame, { stroke: color, width: box.role === 'divider' ? 3 : 2 }));
    if (box.flow) {
      const n = box.flow.direction === 'column' ? (opts.n ?? 1) : box.flow.columns;
      const cells = flowCells(box.frame, n, space(mood, box.flow.gap), box.flow.direction);
      for (const c of cells) {
        out.push(rect(c, { stroke: color, dash: '6 4', width: 1 }));
        const item = itemLayout(box.flow.itemLayout, { mood, w: c.w, h: c.h });
        for (const ib of item.boxes) {
          const f = { x: c.x + ib.frame.x, y: c.y + ib.frame.y, w: ib.frame.w, h: ib.frame.h };
          const ic = COLORS[ib.role] ?? '#374151';
          out.push(rect(f, { stroke: ic, dash: '3 3', width: 1 }));
          const is = item.slots.find((x) => x.box === ib.id);
          out.push(label(f, `${ib.id}${is?.role ? ` · ${is.role}` : ''}`, ic, 13));
        }
      }
    }
    const text = `${box.role ?? 'box'}${s ? ` · ${s.id}${s.role ? ` (${s.role})` : ''}${s.required ? ' *' : ''}` : ''}${box.flow ? ` · flow ${box.flow.direction}×${box.flow.columns} ${box.flow.itemLayout}` : ''}`;
    out.push(label(box.frame, text, color));
  }
  const meta = `${mood.id} · ${layout.id} · footer:${layout.footer} logo:${layout.logo}${layout.surface ? ` surface:${JSON.stringify(layout.surface)}` : ''}`;
  out.push(
    `<text x="8" y="1072" font-family="Menlo, monospace" font-size="14" fill="#6b7280">${esc(meta)}</text>`,
  );
  out.push(`</svg>`);
  return out.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const moodPath = args.find((a) => !a.startsWith('--'));
  if (!moodPath) {
    console.error('usage: preview.js <mood.json> [--out <dir>]');
    process.exit(2);
  }
  const oi = args.indexOf('--out');
  const outRoot = oi >= 0 ? resolve(args[oi + 1]) : join(REPO, 'out', '_layouts');
  const mood = JSON.parse(readFileSync(resolve(moodPath), 'utf8'));
  const dir = join(outRoot, mood.id);
  mkdirSync(dir, { recursive: true });
  for (const kind of KINDS) {
    const summary = { kind, ...SAMPLE[kind] };
    const layout = buildLayout(kind, mood, summary);

    const file = join(dir, `${kind}.svg`);
    writeFileSync(file, layoutSvg(layout, mood, { n: Math.max(1, Math.min(summary.items || 1, 5)) }));
    console.log(file);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv);
