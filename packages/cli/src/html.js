/**
 * `pb mood --html`: a self-contained static page of one Mood for review (P1-rules §C). Plain HTML + inline CSS.
 * Font and image files are referenced relative to the page's folder (`outDir`, so the page works from disk and
 * through the review UI's static server alike); without `outDir`, by absolute file:// URLs into the brand folder.
 */
import { relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROLE_ORDER = [
  'display',
  'h1',
  'h2',
  'h3',
  'body',
  'bodySmall',
  'bullet',
  'caption',
  'eyebrow',
  'stat',
  'statLabel',
  'quote',
  'quoteAttribution',
  'tableHeader',
  'tableCell',
  'chartLabel',
  'footer',
  'button',
];
const SWATCH_KEYS = ['bg', 'text', 'textMuted', 'heading', 'accent', 'card', 'cardText', 'border'];
const CASE_CSS = { upper: 'uppercase', lower: 'lowercase', title: 'capitalize' };
const PREVIEW_SCALE = 0.5;

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** `ref` = the brand folder (absolute file:// URL) or `{ base }` (a relative URL prefix, forward slashes). */
const fileUrl = (ref, file) =>
  typeof ref === 'string'
    ? pathToFileURL(resolve(ref, file)).href
    : `${ref.base}${String(file).split(sep).join('/').replace(/^\.\//, '')}`;
/** The relative URL prefix from `outDir` to `brandDir` ('' when equal), with forward slashes. */
const relBase = (outDir, brandDir) => {
  const rel = relative(resolve(outDir), resolve(brandDir)).split(sep).join('/');
  return rel ? `${rel}/` : '';
};
const isHex = (v) => typeof v === 'string' && /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(v);
const fmt = (v) => (typeof v === 'object' ? JSON.stringify(v) : String(v));

function fontFaces(mood, brandDir) {
  const rules = [];
  for (const [key, face] of Object.entries(mood.type?.faces ?? {})) {
    for (const f of face.files ?? []) {
      const format = f.format ? ` format('${f.format}')` : '';
      const weight = f.weight ? `font-weight: ${f.weight};` : '';
      rules.push(
        `@font-face { font-family: 'pb-${esc(key)}'; src: url('${fileUrl(brandDir, f.file)}')${format}; ` +
          `${weight} font-style: ${f.style === 'italic' ? 'italic' : 'normal'}; }`,
      );
    }
  }
  return rules.join('\n');
}

function familyOf(mood, faceKey) {
  const face = mood.type?.faces?.[faceKey];
  const fallback = face?.fallback ? `, ${face.fallback}` : ', sans-serif';
  return `'pb-${faceKey}'${fallback}`;
}

/** A role colour (surface role name or literal hex) on a surface. */
function colourOn(surface, value) {
  if (isHex(value)) return value;
  return (surface && isHex(surface[value]) && surface[value]) || surface?.text || '#000000';
}

function swatches(mood) {
  return (mood.palette?.surfaces ?? [])
    .map((s) => {
      const chips = SWATCH_KEYS.filter((k) => isHex(s[k]))
        .map(
          (k) =>
            `<div class="chip"><span class="dot" style="background:${s[k]}"></span>${esc(k)} <code>${esc(s[k])}</code></div>`,
        )
        .join('');
      const contrast = Object.entries(s.contrast ?? {})
        .map(([k, v]) => `${esc(k)} ${esc(v)}:1`)
        .join(' &middot; ');
      const backgrounds = Object.keys(s.background ?? {}).length
        ? `<div class="meta muted">backgrounds: ${esc(Object.keys(s.background).join(', '))}</div>`
        : '';
      return `<div class="surface">
  <div class="tile" style="background:${s.bg};color:${s.text}">
    <div style="color:${s.heading ?? s.text};font-weight:600">${esc(s.id)}</div>
    <div>Body text on ${esc(s.id)}</div>
    <div style="color:${s.accent ?? s.text}">Accent</div>
  </div>
  <div class="meta"><b>role</b> ${esc(s.role ?? '-')} &middot; <b>tone</b> ${esc(s.tone)}${
    s.logoVariant ? ` &middot; <b>logo</b> ${esc(s.logoVariant)}` : ''
  }</div>
  <div class="meta">contrast: ${contrast || '-'}</div>
  ${backgrounds}
  <div class="chips">${chips}</div>
</div>`;
    })
    .join('\n');
}

function rhythm(mood) {
  const byId = Object.fromEntries((mood.palette?.surfaces ?? []).map((s) => [s.id, s]));
  const list = mood.palette?.rhythm ?? [];
  if (!list.length) return '<p class="muted">no rhythm</p>';
  return `<div class="rhythm">${list
    .map((id) => {
      const s = byId[id] ?? {};
      return `<div class="beat" style="background:${s.bg ?? '#ccc'};color:${s.text ?? '#000'}">${esc(id)}</div>`;
    })
    .join('')}</div>`;
}

function typeLadder(mood) {
  const surfaces = mood.palette?.surfaces ?? [];
  const surface = surfaces.find((s) => s.role === 'default') ?? surfaces[0];
  const roles = mood.type?.roles ?? {};
  const names = [
    ...ROLE_ORDER.filter((r) => roles[r]),
    ...Object.keys(roles).filter((r) => !ROLE_ORDER.includes(r)),
  ];
  const rows = names
    .map((name) => {
      const r = roles[name];
      const style = [
        `font-family:${familyOf(mood, r.face)}`,
        `font-size:${r.size * PREVIEW_SCALE}px`,
        `font-weight:${r.weight}`,
        `line-height:${r.lineHeight}`,
        r.letterSpacing !== undefined ? `letter-spacing:${r.letterSpacing}em` : '',
        CASE_CSS[r.case] ? `text-transform:${CASE_CSS[r.case]}` : '',
        `color:${colourOn(surface, r.color)}`,
      ]
        .filter(Boolean)
        .join(';');
      const spec = `${r.face} ${r.size}px / ${r.weight} / lh ${r.lineHeight}${
        r.letterSpacing !== undefined ? ` / ls ${r.letterSpacing}em` : ''
      }${r.case ? ` / ${r.case}` : ''} &middot; colour ${esc(r.color)} &middot; fit.min ${esc(r.fit?.min)}`;
      return `<div class="ladder-row"><div class="ladder-label"><b>${esc(name)}</b><br><span class="muted">${spec}</span></div>
  <div class="ladder-sample" style="${esc(style)}">The quick brown fox jumps 0123</div></div>`;
    })
    .join('\n');
  return `<div class="ladder" style="background:${surface?.bg ?? '#fff'};color:${surface?.text ?? '#000'}">${rows}</div>
<p class="muted">Set in the brand's own font files at ${PREVIEW_SCALE * 100}% of canvas px, on the default surface "${esc(surface?.id)}".</p>`;
}

function componentsTable(mood, brandDir) {
  const comps = mood.components ?? {};
  if (!Object.keys(comps).length) return '<p class="muted">no components given</p>';
  const rows = Object.keys(comps)
    .sort()
    .map((name) => {
      const c = comps[name];
      const tokens = Object.entries(c.tokens ?? {})
        .map(
          ([k, v]) =>
            `<code>${esc(k)}</code>=${isHex(v) ? `<span class="dot" style="background:${v}"></span>` : ''}${esc(v)}`,
        )
        .join('<br>');
      const items = Array.isArray(c.items)
        ? name === 'icon'
          ? `<div class="muted">${c.items.length} icon(s): see Icon set</div>`
          : `<div class="items">${c.items
              .map((it) =>
                typeof it.file === 'string'
                  ? `<img src="${fileUrl(brandDir, it.file)}" alt="${esc(it.name ?? it.file)}" title="${esc(it.name ?? it.file)}">`
                  : `<code>${esc(JSON.stringify(it))}</code>`,
              )
              .join('')}</div>`
        : '';
      return `<tr><td><b>${esc(name)}</b></td><td>${esc(c.variant)}</td><td>${tokens || '-'}${items}</td></tr>`;
    })
    .join('\n');
  return `<table><thead><tr><th>component</th><th>variant</th><th>tokens</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** E5: the brand's icon set as a thumbnail grid; a white/light variant is shown on a dark chip beside its icon. */
function iconSet(mood, brandDir) {
  const items = mood.components?.icon?.items ?? [];
  if (!items.length) return '';
  const cells = items
    .map((it) => {
      const variants = Object.entries(it.variants ?? {})
        .map(
          ([k, file]) =>
            `<span class="icon-chip${k === 'dark' ? '' : ' on-dark'}" title="${esc(k)}"><img src="${fileUrl(brandDir, file)}" alt="${esc(`${it.name} ${k}`)}"></span>`,
        )
        .join('');
      return `<figure class="icon"><div class="icon-row"><span class="icon-chip"><img src="${fileUrl(brandDir, it.file)}" alt="${esc(it.name)}"></span>${variants}</div><figcaption>${esc(it.name)}${
        Object.keys(it.variants ?? {}).length
          ? ` <span class="muted">+${esc(Object.keys(it.variants).join(', '))}</span>`
          : ''
      }</figcaption></figure>`;
    })
    .join('\n');
  return `<h3>Icon set (${items.length})</h3><div class="icons">${cells}</div>`;
}

function logos(mood, brandDir) {
  const variants = mood.logo?.variants ?? {};
  const cards = Object.entries(variants)
    .map(
      ([
        k,
        v,
      ]) => `<figure class="logo"><div class="logo-box"><img src="${fileUrl(brandDir, v.file)}" alt="${esc(k)}"></div>
  <figcaption><b>${esc(k)}</b> ${esc(v.file)}${v.width ? ` (${v.width}x${v.height})` : ''}</figcaption></figure>`,
    )
    .join('\n');
  const byId = Object.fromEntries((mood.palette?.surfaces ?? []).map((s) => [s.id, s]));
  const onSurface = Object.entries(mood.logo?.perSurface ?? {})
    .filter(([sid, v]) => byId[sid] && variants[v])
    .map(
      ([sid, v]) =>
        `<figure class="logo"><div class="logo-box" style="background:${byId[sid].bg}"><img src="${fileUrl(
          brandDir,
          variants[v].file,
        )}" alt="${esc(v)}"></div><figcaption>${esc(sid)}: ${esc(v)}</figcaption></figure>`,
    )
    .join('\n');
  const facts = ['height', 'clearSpace', 'position', 'perKind']
    .filter((k) => mood.logo?.[k] !== undefined)
    .map((k) => `<b>${k}</b> ${esc(fmt(mood.logo[k]))}`)
    .join(' &middot; ');
  return `<div class="logos">${cards}</div>${onSurface ? `<h3>Per surface</h3><div class="logos">${onSurface}</div>` : ''}<p>${facts}</p>`;
}

function footer(mood) {
  const f = mood.footer ?? {};
  return `<ul class="facts">${Object.keys(f)
    .sort()
    .map((k) => `<li><b>${esc(k)}</b> ${esc(fmt(f[k]))}</li>`)
    .join('')}</ul>`;
}

function decor(mood, brandDir) {
  const els = mood.decor?.elements ?? [];
  const figures = (list) =>
    list
      .map((e) => {
        const visual = e.file
          ? `<img src="${fileUrl(brandDir, e.file)}" alt="${esc(e.id)}">`
          : `<div class="drawn">drawn: ${esc(e.type ?? '?')}</div>`;
        const keys = Object.keys(e)
          .filter((k) => !['id', 'file'].includes(k))
          .sort()
          .map((k) => `${esc(k)}=${esc(fmt(e[k]))}`)
          .join('<br>');
        // E3: an element with an animated version (shown by the HTML renderer / present mode) gets a badge.
        const badge = e.animated ? ' <span class="badge">animated</span>' : '';
        return `<figure class="decor"><div class="decor-box">${visual}</div><figcaption><b>${esc(e.id)}</b>${badge}<br><span class="muted">${keys}</span></figcaption></figure>`;
      })
      .join('\n');
  // E2: elements with no allowed layouts are listed apart; the composer never places them.
  const thumbs = figures(els.filter((e) => !e.unused));
  const unused = figures(els.filter((e) => e.unused));
  const extra = ['maxPerSlide', 'imagery']
    .filter((k) => mood.decor?.[k] !== undefined)
    .map((k) => `<b>${k}</b> ${esc(fmt(mood.decor[k]))}`)
    .join(' &middot; ');
  const unusedBlock = unused ? `<h3>Unused (no allowed layouts)</h3><div class="decors">${unused}</div>` : '';
  const empty = unused ? 'no placeable decor elements' : 'no decor elements';
  return `${thumbs ? `<div class="decors">${thumbs}</div>` : `<p class="muted">${empty}</p>`}${unusedBlock}<p>${extra}</p>`;
}

/** E6: files under assets/ the brand JSON does not reference (BrandSpec.unreferencedAssets). */
function unreferenced(assets) {
  if (!assets.length)
    return '<p class="muted">none: every asset file is referenced (font files not counted)</p>';
  const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
  return `<p class="muted">${assets.length} file(s) under assets/ that no value of the brand JSON names. Never used for design.</p>
<ul class="list">${assets.map((a) => `<li><code>${esc(a.file)}</code> <span class="muted">${esc(kb(a.size))}</span></li>`).join('')}</ul>`;
}

function list(items, render) {
  return items.length ? `<ul class="list">${items.map(render).join('')}</ul>` : '<p class="muted">none</p>';
}

/**
 * HTML for one Mood. `questions` / `warnings` = what pb mood writes beside it; `unreferencedAssets` = the BrandSpec's
 * (E6).
 */
export function moodHtml({ mood, brandDir, outDir, questions = [], warnings = [], unreferencedAssets = [] }) {
  const ref = outDir ? { base: relBase(outDir, brandDir) } : brandDir;
  const g = mood.geometry ?? {};
  const motion = mood.motion
    ? `<b>family</b> ${esc(mood.motion.family ?? '-')} &middot; ${[
        'transition',
        'build',
        'duration',
        'easing',
        'stagger',
      ]
        .filter((k) => mood.motion[k] !== undefined)
        .map((k) => `<b>${k}</b> ${esc(mood.motion[k])}`)
        .join(' &middot; ')}`
    : 'no motion block';
  const shape = mood.shape ?? {};
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mood ${esc(mood.name ?? mood.id)}</title>
<style>
${fontFaces(mood, ref)}
:root { --ink: #1b1d22; --muted: #6b7280; --line: #e5e7eb; --paper: #ffffff; --wash: #f6f7f9; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--wash); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, Segoe UI, sans-serif; }
main { max-width: 1200px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 32px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 14px; margin: 16px 0 8px; }
.muted { color: var(--muted); } code { font: 12px ui-monospace, Menlo, monospace; }
.surfaces { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.surface { background: var(--paper); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.tile { padding: 16px; min-height: 96px; display: grid; gap: 4px; }
.meta { padding: 4px 12px; font-size: 12px; }
.chips { padding: 4px 12px 12px; display: grid; gap: 2px; font-size: 12px; }
.chip { display: flex; align-items: center; gap: 6px; }
.dot { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(0,0,0,.15); vertical-align: middle; margin-right: 4px; }
.rhythm { display: flex; flex-wrap: wrap; gap: 4px; }
.beat { padding: 10px 14px; border-radius: 6px; font-size: 12px; border: 1px solid rgba(0,0,0,.08); }
.ladder { border: 1px solid var(--line); border-radius: 8px; padding: 8px 16px; overflow-x: auto; }
.ladder-row { display: grid; grid-template-columns: 240px 1fr; gap: 16px; align-items: baseline; padding: 8px 0; border-bottom: 1px dashed rgba(127,127,127,.25); }
.ladder-label { font-size: 12px; } .ladder-label .muted { font-size: 11px; color: inherit; opacity: 0.7; }
.ladder-sample { white-space: nowrap; }
table { width: 100%; border-collapse: collapse; background: var(--paper); border: 1px solid var(--line); }
th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid var(--line); font-size: 12px; }
.items { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; } .items img { height: 20px; }
.icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.icon { margin: 0; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
.icon-row { display: flex; gap: 6px; }
.icon-chip { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: var(--wash); }
.icon-chip.on-dark { background: #1b1d22; }
.icon-chip img { max-width: 32px; max-height: 32px; }
.badge { display: inline-block; font-size: 10px; line-height: 1; padding: 3px 6px; border-radius: 999px; background: #1b1d22; color: #fff; vertical-align: middle; }
.logos, .decors { display: flex; flex-wrap: wrap; gap: 16px; }
.logo, .decor { margin: 0; background: var(--paper); border: 1px solid var(--line); border-radius: 8px; padding: 8px; width: 220px; }
.logo-box, .decor-box { height: 96px; display: flex; align-items: center; justify-content: center; background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 16px 16px; border-radius: 4px; padding: 8px; }
.logo-box img, .decor-box img { max-width: 100%; max-height: 100%; }
.drawn { font-size: 12px; color: var(--muted); }
figcaption { font-size: 12px; margin-top: 6px; word-break: break-word; }
.facts, .list { margin: 0; padding-left: 18px; } .list li { margin: 2px 0; }
.sev-blocking { color: #b91c1c; font-weight: 600; } .sev-optional { color: var(--muted); }
@media (max-width: 640px) { .ladder-row { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
<h1>${esc(mood.name ?? mood.id)} <span class="muted">mood</span></h1>
<p class="muted">${esc(mood.id)} &middot; engine ${esc(mood.engineVersion)} &middot; brand ${esc(String(mood.brandHash).slice(0, 12))}</p>

<h2>Surfaces</h2>
<div class="surfaces">${swatches(mood)}</div>
<h3>Rhythm</h3>
${rhythm(mood)}
${mood.palette?.perKind ? `<p><b>perKind</b> ${esc(fmt(mood.palette.perKind))}</p>` : ''}

<h2>Type ladder</h2>
${typeLadder(mood)}

<h2>Geometry and shape</h2>
<ul class="facts">
${['margins', 'safeArea', 'grid', 'titleZone', 'spacing', 'density']
  .filter((k) => g[k] !== undefined)
  .map((k) => `<li><b>${k}</b> ${esc(fmt(g[k]))}</li>`)
  .join('')}
${['radius', 'language', 'borderWidth', 'shadow', 'divider']
  .filter((k) => shape[k] !== undefined)
  .map((k) => `<li><b>${k}</b> ${esc(fmt(shape[k]))}</li>`)
  .join('')}
</ul>

<h2>Components</h2>
${componentsTable(mood, ref)}
${iconSet(mood, ref)}

<h2>Logos</h2>
${logos(mood, ref)}

<h2>Footer</h2>
${footer(mood)}

<h2>Decor</h2>
${decor(mood, ref)}

<h2>Unreferenced assets (${unreferencedAssets.length})</h2>
${unreferenced(unreferencedAssets)}

<h2>Motion</h2>
<p>${motion}</p>

<h2>Questions (${questions.length})</h2>
${list(
  questions,
  (q) =>
    `<li><span class="sev-${esc(q.severity)}">${esc(q.severity)}</span> <code>${esc(q.pointer)}</code> ${esc(q.question)} <span class="muted">(${esc((q.neededBy ?? []).join(', '))})</span></li>`,
)}

<h2>Warnings (${warnings.length})</h2>
${list(
  warnings,
  (w) =>
    `<li><span class="muted">${esc(w.source)}${w.rule ? ` ${esc(w.rule)}` : ''}</span> <code>${esc(w.pointer)}</code> ${esc(w.message)}</li>`,
)}
</main>
</body>
</html>
`;
}
