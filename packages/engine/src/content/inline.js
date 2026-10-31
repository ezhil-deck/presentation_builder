/**
 * Inline markdown -> runs: `**bold**`, `*italic*` (also `_italic_`), `[text](url)`. Unclosed markers stay literal.
 * Returns [{text, bold?, italic?, link?}], adjacent runs with the same style merged; never empty for non-empty text.
 */
export function parseInline(text) {
  const runs = [];
  const push = (t, style) => {
    if (!t) return;
    const last = runs[runs.length - 1];
    if (
      last &&
      !!last.bold === !!style.bold &&
      !!last.italic === !!style.italic &&
      last.link === style.link
    ) {
      last.text += t;
      return;
    }
    const run = { text: t };
    if (style.bold) run.bold = true;
    if (style.italic) run.italic = true;
    if (style.link) run.link = style.link;
    runs.push(run);
  };

  const walk = (src, style) => {
    let i = 0;
    let buf = '';
    const flush = () => {
      push(buf, style);
      buf = '';
    };
    while (i < src.length) {
      if (src.startsWith('**', i)) {
        const end = src.indexOf('**', i + 2);
        if (end > i + 2) {
          flush();
          walk(src.slice(i + 2, end), { ...style, bold: true });
          i = end + 2;
          continue;
        }
      }
      const ch = src[i];
      if ((ch === '*' || ch === '_') && src[i + 1] !== ch && src[i + 1] !== ' ') {
        const end = src.indexOf(ch, i + 1);
        if (end > i + 1 && src[end - 1] !== ' ') {
          flush();
          walk(src.slice(i + 1, end), { ...style, italic: true });
          i = end + 1;
          continue;
        }
      }
      if (ch === '[') {
        const m = /^\[([^\]]*)\]\(([^)\s]+)\)/.exec(src.slice(i));
        if (m) {
          flush();
          walk(m[1], { ...style, link: m[2] });
          i += m[0].length;
          continue;
        }
      }
      buf += ch;
      i += 1;
    }
    flush();
  };

  walk(String(text ?? ''), {});
  return runs.length ? runs : [{ text: '' }];
}

/** Plain text of inline markdown (markers removed). */
export const plainText = (text) =>
  parseInline(text)
    .map((r) => r.text)
    .join('');
