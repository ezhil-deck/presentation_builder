/**
 * C3.1 test helpers: a content/2 slide written for a catalogue layout record (its combination at the middle of each
 * band, neutral copy), and the empty share of each container box of a composed slide (how much of the box's height
 * its content leaves free), to compare with the catalogue's own (`place.empty`).
 */
const WORDS =
  'teams approve spend from one place so every request is checked against the policy before any money leaves and the month closes on time with each receipt attached'.split(
    ' ',
  );

/** Neutral copy of about `n` characters (whole words, at least one). */
export function copy(n, seed = 0) {
  const out = [];
  let len = 0;
  for (let k = seed; len < n; k += 1) {
    const w = WORDS[k % WORDS.length];
    out.push(w);
    len += w.length + 1;
  }
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1, Math.max(1, Math.min(s.length, n)));
}

const mid = (band) => {
  const [lo, hi] = band.split('-').map(Number);
  return Math.round((lo + hi) / 2);
};

/** A content/2 slide for a record (null for the title-only record). */
export function slideFor(rec) {
  const blocks = rec.combination.map((b, k) => {
    const len = (f, fallback) => (b.bands[f] ? mid(b.bands[f]) : fallback);
    const n = b.nodes;
    const nodes = Array.from({ length: n }, (_, i) => i);
    const lines = rec.containers.filter((c) => c.block)[k]?.type === 'timeline_with_list';
    switch (b.type) {
      case 'items':
        return {
          type: 'items',
          items: nodes.map((i) => ({
            heading: copy(len('heading'), i),
            body: copy(len('description'), i + 3),
          })),
        };
      case 'subpoints':
        return {
          type: 'subpoints',
          items: nodes.map((i) => {
            const d = len('description');
            return {
              heading: copy(len('heading'), i),
              lines: [copy(Math.ceil(d / 2), i + 2), copy(Math.floor(d / 2), i + 5)],
            };
          }),
        };
      case 'kpis':
        return {
          type: 'kpis',
          items: nodes.map((i) =>
            b.bands.heading
              ? {
                  value: '9'.repeat(Math.min(12, len('value'))),
                  heading: copy(len('heading'), i),
                  body: copy(len('body'), i + 4),
                }
              : { value: '9'.repeat(Math.min(12, len('value'))), heading: copy(len('body'), i + 4) },
          ),
        };
      case 'process':
        return {
          type: 'process',
          items: nodes.map((i) => ({
            heading: copy(len('heading'), i),
            body: copy(len('description'), i + 6),
          })),
        };
      case 'timeline':
        return {
          type: 'timeline',
          items: nodes.map((i) =>
            lines
              ? {
                  when: `Q${(i % 4) + 1}`,
                  heading: copy(len('heading'), i),
                  lines: [
                    copy(Math.ceil(len('description') / 2), i),
                    copy(Math.floor(len('description') / 2), i + 7),
                  ],
                }
              : {
                  when: `Q${(i % 4) + 1}`,
                  heading: copy(len('heading'), i),
                  body: copy(len('description'), i + 7),
                },
          ),
        };
      case 'compare':
        return {
          type: 'compare',
          columns: nodes.map((i) => ({
            header: copy(len('heading'), i),
            items: [{ heading: copy(len('description'), i + 2) }],
          })),
        };
      case 'points':
        return { type: 'points', items: nodes.map((i) => ({ text: copy(len('bullet'), i) })) };
      case 'paragraph':
        return { type: 'paragraph', text: copy(len('paragraph'), 1) };
      case 'chart':
        return {
          type: 'chart',
          chartType: 'column',
          categories: nodes.map((i) => `C${i + 1}`),
          series: [{ name: 'Value', values: nodes.map((i) => 10 + 5 * i) }],
        };
      case 'table':
        return {
          type: 'table',
          header: ['Item', 'Value', 'Note'],
          rows: nodes.map((i) => [`Row ${i + 1}`, `${i + 1}`, copy(20, i)]),
        };
      default:
        throw new Error(`no copy for ${b.type}`);
    }
  });
  return { title: copy(40, 2), blocks };
}

/** Top / bottom of an element's painted content (a text at its fitted height inside its frame). */
function extentOf(el) {
  if (el.type === 'text' && el.text?.fit) {
    const h = el.text.fit.height;
    const free = Math.max(0, el.frame.h - h);
    const dy = el.text.valign === 'bottom' ? free : el.text.valign === 'middle' ? free / 2 : 0;
    return [el.frame.y + dy, el.frame.y + dy + h];
  }
  return [el.frame.y, el.frame.y + el.frame.h];
}

/** {container: empty share} of a composed slide's container boxes (charts / tables left out). */
export function emptyShares(slide, layout) {
  const out = {};
  for (const box of layout.boxes) {
    if (!box.container || box.role === 'chart' || box.role === 'table') continue;
    const els = slide.elements.filter((e) => e.layoutBox === box.id);
    if (!els.length) continue;
    const ext = els.map(extentOf);
    const top = Math.max(box.frame.y, Math.min(...ext.map((x) => x[0])));
    const bottom = Math.min(box.frame.y + box.frame.h, Math.max(...ext.map((x) => x[1])));
    out[box.container] = box.frame.h > 0 ? Math.max(0, 1 - Math.max(0, bottom - top) / box.frame.h) : 0;
  }
  return out;
}
