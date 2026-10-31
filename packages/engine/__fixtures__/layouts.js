/**
 * A tiny stand-in for packages/layouts (P2-spec §2 API: list / forKind / get) so the engine can be tested before the
 * real catalogue exists. Geometry follows §2: content = canvas inset by margins; title box at titleZone (else
 * margins.top, 2 × h1 line box); body from title bottom + spacing.lg; grid columns / gutter for splits. The engine
 * code only ever uses the catalogue API, so the real catalogue replaces this file at integration.
 */
const W = 1920;
const H = 1080;

function frames({ mood, geometry }) {
  const m = geometry.margins;
  const content = { x: m.left, y: m.top, w: W - m.left - m.right, h: H - m.top - m.bottom };
  const h1 = mood.type.roles.h1;
  const tz = geometry.titleZone ?? {};
  const title = {
    x: content.x,
    y: tz.y ?? m.top,
    w: content.w,
    h: tz.height ?? 2 * h1.size * h1.lineHeight,
  };
  const lg = geometry.spacing?.lg ?? 0;
  const bodyY = title.y + title.h + lg;
  const body = { x: content.x, y: bodyY, w: content.w, h: content.y + content.h - bodyY };
  const cols = geometry.grid?.columns ?? 12;
  const gutter = geometry.grid?.gutter ?? 0;
  const colW = (content.w - gutter * (cols - 1)) / cols;
  const span = (start, n) => ({ x: content.x + start * (colW + gutter), w: n * colW + (n - 1) * gutter });
  return { content, title, body, span };
}

const titleRole = (mood, kind, fallback = 'h1') => {
  const r = mood.composition?.layoutHints?.[kind]?.titleRole;
  return r && mood.type.roles[r] ? r : fallback;
};
const lineBox = (mood, role, n = 1) => n * mood.type.roles[role].size * mood.type.roles[role].lineHeight;

const titleSlot = (role) => ({ id: 'title', type: 'text', box: 'title', role, required: true });

const defs = [
  {
    id: 'cover-basic',
    kind: 'cover',
    build(ctx) {
      const { mood } = ctx;
      const { content } = frames(ctx);
      const role = titleRole(mood, 'cover', 'display');
      const th = lineBox(mood, role, 2);
      const lower = mood.composition?.layoutHints?.cover?.titleRole === 'display';
      const y = lower ? H / 2 : content.y;
      const sh = lineBox(mood, 'h2', 2);
      return {
        schema: 'layout/1',
        id: 'cover-basic',
        kind: 'cover',
        version: 1,
        footer: mood.composition?.layoutHints?.cover?.footer === false ? 'hide' : 'mood',
        boxes: [
          { id: 'title', role: 'title', frame: { x: content.x, y, w: content.w * (2 / 3), h: th } },
          {
            id: 'subtitle',
            role: 'subtitle',
            frame: {
              x: content.x,
              y: y + th + (ctx.geometry.spacing?.md ?? 0),
              w: content.w * (2 / 3),
              h: sh,
            },
          },
        ],
        slots: [
          titleSlot(role),
          { id: 'subtitle', type: 'text', box: 'subtitle', role: 'h2', required: false },
        ],
        decor: { allow: true, zones: [{ x: W * (2 / 3), y: 0, w: W / 3, h: H }] },
      };
    },
  },
  {
    id: 'section-basic',
    kind: 'section',
    build(ctx) {
      const { mood } = ctx;
      const { content } = frames(ctx);
      const role = titleRole(mood, 'section', 'display');
      const th = lineBox(mood, role, 2);
      const y = (H - th) / 2;
      return {
        schema: 'layout/1',
        id: 'section-basic',
        kind: 'section',
        version: 1,
        surface: { prefer: mood.palette?.perKind?.section ? 'any' : 'dark' },
        boxes: [
          {
            id: 'title',
            role: 'title',
            frame: { x: content.x, y, w: content.w, h: th },
            align: { v: 'middle' },
          },
          {
            id: 'subtitle',
            role: 'subtitle',
            frame: { x: content.x, y: y + th, w: content.w, h: lineBox(mood, 'h3', 2) },
          },
        ],
        slots: [
          titleSlot(role),
          { id: 'subtitle', type: 'text', box: 'subtitle', role: 'h3', required: false },
        ],
        decor: { allow: true, zones: [{ x: 0, y: H * (2 / 3), w: W, h: H / 3 }] },
      };
    },
  },
  {
    id: 'text-basic',
    kind: 'text',
    build(ctx) {
      const { title, body } = frames(ctx);
      return {
        schema: 'layout/1',
        id: 'text-basic',
        kind: 'text',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'body', role: 'body', frame: body },
        ],
        slots: [
          titleSlot('h1'),
          { id: 'body', type: 'richtext', box: 'body', role: 'body', required: false },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'bullets-basic',
    kind: 'bullets',
    build(ctx) {
      const { title, body } = frames(ctx);
      return {
        schema: 'layout/1',
        id: 'bullets-basic',
        kind: 'bullets',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'body', role: 'list', frame: body },
        ],
        slots: [
          titleSlot(titleRole(ctx.mood, 'bullets')),
          {
            id: 'body',
            type: 'richtext',
            box: 'body',
            role: 'bullet',
            required: false,
            capacity: { maxItems: 6, maxLevels: 2 },
          },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'two-column-basic',
    kind: 'two-column',
    build(ctx) {
      const { mood } = ctx;
      const { title, body, span } = frames(ctx);
      const left = span(0, 6);
      const right = span(6, 6);
      const hh = lineBox(mood, 'h3', 2);
      const md = ctx.geometry.spacing?.md ?? 0;
      const col = (n, s) => [
        { id: `col${n}-title`, role: 'subtitle', frame: { x: s.x, y: body.y, w: s.w, h: hh } },
        {
          id: `col${n}-body`,
          role: 'body',
          frame: { x: s.x, y: body.y + hh + md, w: s.w, h: body.h - hh - md },
        },
      ];
      return {
        schema: 'layout/1',
        id: 'two-column-basic',
        kind: 'two-column',
        version: 1,
        boxes: [{ id: 'title', role: 'title', frame: title }, ...col(1, left), ...col(2, right)],
        slots: [
          titleSlot(titleRole(mood, 'two-column')),
          { id: 'col1-title', type: 'text', box: 'col1-title', role: 'h3', required: false },
          { id: 'col1-body', type: 'richtext', box: 'col1-body', role: 'body', required: false },
          { id: 'col2-title', type: 'text', box: 'col2-title', role: 'h3', required: false },
          { id: 'col2-body', type: 'richtext', box: 'col2-body', role: 'body', required: false },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'kpi-row',
    kind: 'kpi',
    build(ctx) {
      const { title, body } = frames(ctx);
      const n = Math.max(1, Math.min(4, ctx.summary?.items ?? 1));
      return {
        schema: 'layout/1',
        id: 'kpi-row',
        kind: 'kpi',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'kpis', role: 'kpis', frame: body, flow: { direction: 'row', gap: 'md', columns: n } },
        ],
        slots: [
          titleSlot(titleRole(ctx.mood, 'kpi')),
          { id: 'kpis', type: 'kpis', box: 'kpis', required: false, capacity: { minItems: 1, maxItems: 4 } },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'chart-full',
    kind: 'chart',
    build(ctx) {
      const { title, body } = frames(ctx);
      return {
        schema: 'layout/1',
        id: 'chart-full',
        kind: 'chart',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'chart', role: 'chart', frame: body },
        ],
        slots: [
          titleSlot(titleRole(ctx.mood, 'chart')),
          { id: 'chart', type: 'chart', box: 'chart', required: false },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'table-full',
    kind: 'table',
    build(ctx) {
      const { title, body } = frames(ctx);
      return {
        schema: 'layout/1',
        id: 'table-full',
        kind: 'table',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'table', role: 'table', frame: body },
        ],
        slots: [titleSlot('h1'), { id: 'table', type: 'table', box: 'table', required: false }],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'quote-centered',
    kind: 'quote',
    build(ctx) {
      const { mood } = ctx;
      const { title, body } = frames(ctx);
      const align = mood.components?.quote?.tokens?.align ?? 'center';
      const qh = lineBox(mood, 'quote', 4);
      const ah = lineBox(mood, 'quoteAttribution', 2);
      const y = body.y + (body.h - qh - ah) / 2;
      return {
        schema: 'layout/1',
        id: 'quote-centered',
        kind: 'quote',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'quote', role: 'quote', frame: { x: body.x, y, w: body.w, h: qh }, align: { h: align } },
          {
            id: 'attribution',
            role: 'attribution',
            frame: { x: body.x, y: y + qh, w: body.w, h: ah },
            align: { h: align },
          },
        ],
        slots: [
          titleSlot('h1'),
          { id: 'quote', type: 'quote', box: 'quote', role: 'quote', required: false },
          { id: 'attribution', type: 'text', box: 'attribution', role: 'quoteAttribution', required: false },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'image-text-left',
    kind: 'image-text',
    build(ctx) {
      const { title, body, span } = frames(ctx);
      const img = span(0, 5);
      const txt = span(5, 7);
      return {
        schema: 'layout/1',
        id: 'image-text-left',
        kind: 'image-text',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: title },
          { id: 'image', role: 'image', frame: { x: img.x, y: body.y, w: img.w, h: body.h } },
          { id: 'body', role: 'body', frame: { x: txt.x, y: body.y, w: txt.w, h: body.h } },
        ],
        slots: [
          titleSlot(titleRole(ctx.mood, 'image-text')),
          { id: 'image', type: 'image', box: 'image', required: false, capacity: { aspect: '5:7' } },
          { id: 'body', type: 'richtext', box: 'body', role: 'body', required: false },
        ],
        decor: { allow: true, zones: [] },
      };
    },
  },
  {
    id: 'cta-basic',
    kind: 'cta',
    build(ctx) {
      const { mood } = ctx;
      const { content } = frames(ctx);
      const role = titleRole(mood, 'cta', 'display');
      const th = lineBox(mood, role, 2);
      const sh = lineBox(mood, 'h2', 2);
      const y = content.y + content.h / 4;
      return {
        schema: 'layout/1',
        id: 'cta-basic',
        kind: 'cta',
        version: 1,
        boxes: [
          { id: 'title', role: 'title', frame: { x: content.x, y, w: content.w, h: th } },
          { id: 'subtitle', role: 'subtitle', frame: { x: content.x, y: y + th, w: content.w, h: sh } },
          {
            id: 'body',
            role: 'body',
            frame: { x: content.x, y: y + th + sh, w: content.w, h: lineBox(mood, 'body', 3) },
          },
        ],
        slots: [
          titleSlot(role),
          { id: 'subtitle', type: 'text', box: 'subtitle', role: 'h2', required: false },
          { id: 'body', type: 'richtext', box: 'body', role: 'body', required: false },
        ],
        decor: { allow: true, zones: [{ x: 0, y: H * (2 / 3), w: W, h: H / 3 }] },
      };
    },
  },
];

export const fixtureCatalogue = {
  list: () => defs.slice(),
  forKind: (kind) => defs.filter((d) => d.kind === kind),
  get: (id) => defs.find((d) => d.id === id),
};
export default fixtureCatalogue;
