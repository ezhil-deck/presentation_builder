// The inline text editor (docs/P4-spec.md §2 "Inline text", P4.2): a contenteditable overlay laid exactly over a text
// element's frame, in its family / size / weight / line height / letter spacing / colour / alignment, its first
// baseline where the fitter put it (the same half-leading model as the renderer: line-height = role lineHeight). The
// browser edits; on commit (blur, ⌘Enter) the paragraphs go back as inline Markdown and the server re-composes and
// re-fits. Enter = new paragraph where the field takes paragraphs (else refused), Shift+Enter = line break, ⌘B / ⌘I
// bold / italic, ⌘K link, Esc cancels. A counter under it shows the length against the field's design range (BLOCKS):
// orange over it, red over 1.5×. Painted in canvas px inside the scaled slide (strokes counter-scaled).
import { useLayoutEffect, useRef, useState } from 'react';
import { allowsParagraphs, editedUnits, fillEditable, readEditable, textCounter } from './contentEdit.js';
import { UI_ACCENT } from './EditLayer.jsx';
import { matchKey } from './keys.js';

const CASE = { upper: 'uppercase', lower: 'lowercase', title: 'capitalize' };
const LEVEL_COLOR = { ok: '#52525b', over: '#d97706', far: '#dc2626' };

/** The deck font entry of a family (fallback stack, vertical metrics). */
function deckFont(deck, family) {
  return (deck?.fonts ?? []).find((f) => f.family === family) ?? null;
}

/** The CSS of the overlay: the element's font and the padding that puts its first baseline where the fitter did. */
export function overlayStyle(el, deck) {
  const font = el.text?.font ?? {};
  const df = deckFont(deck, font.family);
  const ascent = df?.metrics?.ascent ?? font.ascent ?? 0.9;
  const descent = df?.metrics?.descent ?? font.descent ?? -0.2;
  const size = font.size ?? 16;
  const lh = font.lineHeight ?? 1.2;
  const half = (lh * size - (ascent - descent) * size) / 2;
  const first = el.text?.lines?.[0]?.y;
  const top = typeof first === 'number' ? Math.max(0, first - (half + ascent * size)) : 0;
  const family = font.family ? `"${String(font.family).replace(/["\\]/g, '\\$&')}"` : undefined;
  const css = {
    position: 'absolute',
    left: el.frame.x,
    top: el.frame.y,
    width: el.frame.w,
    minHeight: el.frame.h,
    boxSizing: 'border-box',
    paddingTop: top,
    margin: 0,
    fontFamily: family && df?.fallback ? `${family}, ${df.fallback}` : family,
    fontSize: size,
    fontWeight: font.weight,
    lineHeight: lh,
    color: font.color,
    caretColor: font.color,
    textAlign: el.text?.align ?? 'left',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    background: 'transparent',
    cursor: 'text',
    zIndex: 5,
  };
  if (typeof font.letterSpacing === 'number' && font.letterSpacing !== 0)
    css.letterSpacing = `${font.letterSpacing}em`;
  if (CASE[font.case]) css.textTransform = CASE[font.case];
  return css;
}

const blockOf = (root, node) => {
  let n = node;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n && n.parentNode === root ? n : null;
};

function placeCaret(node, atEnd = true) {
  const sel = node.ownerDocument.defaultView.getSelection();
  const range = node.ownerDocument.createRange();
  range.selectNodeContents(node);
  range.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(range);
}

function currentRange(root) {
  const sel = root.ownerDocument.defaultView.getSelection();
  if (!sel?.rangeCount) return null;
  const range = sel.getRangeAt(0);
  return root.contains(range.startContainer) ? range : null;
}

/** Insert a node at the caret (the selection replaced) and put the caret after it. */
function insertAtCaret(root, node) {
  const range = currentRange(root);
  if (!range) return;
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  const sel = root.ownerDocument.defaultView.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Shift+Enter: a <br> at the caret (a second one at a block's end, so the new line shows). */
function lineBreak(root) {
  const doc = root.ownerDocument;
  const br = doc.createElement('br');
  insertAtCaret(root, br);
  if (!br.nextSibling) {
    const end = doc.createElement('br');
    br.parentNode.appendChild(end);
    const range = doc.createRange();
    range.setStartBefore(end);
    range.collapse(true);
    const sel = doc.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/** Enter: the block split at the caret; the caret at the start of the new block. */
function splitBlock(root) {
  const doc = root.ownerDocument;
  const range = currentRange(root);
  if (!range) return;
  range.deleteContents();
  let block = blockOf(root, range.startContainer);
  if (!block) {
    block = doc.createElement('div');
    block.setAttribute('data-p', '');
    while (root.firstChild) block.appendChild(root.firstChild);
    root.appendChild(block);
  }
  const tail = doc.createRange();
  tail.setStart(range.startContainer, range.startOffset);
  tail.setEnd(block, block.childNodes.length);
  const frag = tail.extractContents();
  const next = doc.createElement('div');
  next.setAttribute('data-p', '');
  if (block.getAttribute('style')) next.setAttribute('style', block.getAttribute('style'));
  next.appendChild(frag);
  const empty = (b) => !b.textContent && !b.querySelector('br');
  if (empty(block)) block.appendChild(doc.createElement('br'));
  if (empty(next) || !next.textContent) {
    next.textContent = '';
    next.appendChild(doc.createElement('br'));
  }
  block.parentNode.insertBefore(next, block.nextSibling);
  placeCaret(next, false);
}

/** ⌘B / ⌘I / ⌘K: the browser's command when it has one; otherwise the selection wrapped in (or out of) the tag. */
function toggleTag(root, tag, attrs = {}) {
  const doc = root.ownerDocument;
  const cmd = tag === 'b' ? 'bold' : tag === 'i' ? 'italic' : 'createLink';
  try {
    if (typeof doc.execCommand === 'function' && doc.execCommand(cmd, false, attrs.href)) return;
  } catch {
    /* fall back to wrapping the selection */
  }
  const range = currentRange(root);
  if (!range || range.collapsed) return;
  let anc = range.commonAncestorContainer;
  while (anc && anc !== root && anc.nodeName?.toLowerCase() !== tag) anc = anc.parentNode;
  if (anc && anc !== root) {
    while (anc.firstChild) anc.parentNode.insertBefore(anc.firstChild, anc);
    anc.remove();
    return;
  }
  const wrap = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) wrap.setAttribute(k, v);
  wrap.appendChild(range.extractContents());
  range.insertNode(wrap);
  const sel = doc.defaultView.getSelection();
  const r = doc.createRange();
  r.selectNodeContents(wrap);
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * `el` = the deck text element (with `source`), `deck` = for the fonts, `scale` = the canvas scale, `slide` = the
 * content slide (the counter's ranges). `onCommit(paragraphs, move?)` / `onCancel()`. `navigate` (a table cell, P4.3):
 * Tab / Shift+Tab / Enter commit and ask for the next / previous / lower cell (`move` = 'next' | 'prev' | 'down');
 * `hide` = the CSS selector of the painted box whose lines step aside (default: the element's own).
 */
export default function InlineEditor({
  el,
  deck,
  scale,
  slide,
  onCommit,
  onCancel,
  navigate = false,
  hide = null,
}) {
  const ref = useRef(null);
  const done = useRef(false);
  const [count, setCount] = useState(null);
  const [refused, setRefused] = useState(false);
  const source = el.source;
  const paragraphs = el.text?.paragraphs ?? [];
  const paraOk = allowsParagraphs(source);
  const k = 1 / (scale || 1);

  const measure = () => {
    if (!ref.current) return;
    setCount(textCounter(slide, source, editedUnits(readEditable(ref.current), source)));
  };

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    fillEditable(root, paragraphs);
    // list paragraphs keep their indent; paragraphs keep the fitter's spacing
    [...root.childNodes].forEach((block, i) => {
      const p = paragraphs[i];
      if (!p || block.nodeType !== 1) return;
      const first = el.text?.lines?.find((l) => l.paragraph === i);
      if ((p.level ?? 0) > 0 && first && (el.text.align ?? 'left') === 'left')
        block.style.paddingLeft = `${first.x}px`;
      if (i < paragraphs.length - 1 && p.spaceAfter) block.style.marginBottom = `${p.spaceAfter}px`;
    });
    root.focus();
    placeCaret(root, true);
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (move) => {
    if (done.current) return;
    done.current = true;
    onCommit(readEditable(ref.current), move);
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  // keys from the keyboard map (keys.js): a table cell's (scope `grid`) first, then the inline text's (`inline`)
  const onKeyDown = (e) => {
    const cellKey = navigate ? matchKey(e, 'grid') : null;
    if (cellKey === 'cell-cancel') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if (cellKey === 'cell-next' || cellKey === 'cell-prev' || cellKey === 'cell-down') {
      e.preventDefault();
      e.stopPropagation();
      commit({ 'cell-next': 'next', 'cell-prev': 'prev', 'cell-down': 'down' }[cellKey]);
      return;
    }
    const action = matchKey(e, 'inline');
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (action === 'inline-cancel') {
      cancel();
      return;
    }
    if (action === 'inline-commit') {
      commit();
      return;
    }
    if (action === 'inline-paragraph' || action === 'inline-break') {
      if (action === 'inline-break') lineBreak(ref.current);
      else if (paraOk && source?.join !== 'line') splitBlock(ref.current);
      else if (paraOk) lineBreak(ref.current);
      else {
        setRefused(true);
        return;
      }
      setRefused(false);
      measure();
      return;
    }
    if (action === 'bold' || action === 'italic') {
      toggleTag(ref.current, action === 'bold' ? 'b' : 'i');
      return;
    }
    if (action === 'link') {
      const url = typeof window.prompt === 'function' ? window.prompt('Link URL') : null;
      if (url) toggleTag(ref.current, 'a', { href: url.trim() });
    }
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData('text/plain');
    if (typeof text !== 'string') return;
    e.preventDefault();
    const doc = ref.current.ownerDocument;
    text.split(/\r?\n/).forEach((line, i) => {
      if (i > 0) insertAtCaret(ref.current, doc.createElement('br'));
      if (line) insertAtCaret(ref.current, doc.createTextNode(line));
    });
    measure();
  };

  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
  return (
    <>
      {/* the painted lines step aside while the overlay holds the text (bullets stay) */}
      <style>{`${hide ?? `.slide [data-element-id="${id}"]`} .pb-line{visibility:hidden}`}</style>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={`Edit ${el.id}`}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-testid="inline-editor"
        data-element={el.id}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        onInput={() => {
          setRefused(false);
          measure();
        }}
        onPaste={onPaste}
        onBlur={() => commit()}
        style={{
          ...overlayStyle(el, deck),
          outline: `${1.5 * k}px solid ${UI_ACCENT}`,
          outlineOffset: 2 * k,
        }}
      />
      <div
        data-testid="inline-counter"
        data-level={count?.level ?? 'none'}
        style={{
          position: 'absolute',
          left: el.frame.x,
          top: el.frame.y + Math.max(el.frame.h, 0) + 6 * k,
          fontSize: 11 * k,
          lineHeight: 1.4,
          padding: `${2 * k}px ${6 * k}px`,
          borderRadius: 4 * k,
          background: '#ffffff',
          boxShadow: `0 0 0 ${k}px rgba(0,0,0,0.12)`,
          color: LEVEL_COLOR[count?.level] ?? LEVEL_COLOR.ok,
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 6,
        }}
      >
        {count ? (
          <>
            <span data-testid="inline-count" className="tabular-nums">
              {count.n} / {count.max}
            </span>
            {count.level === 'far'
              ? ' · far over the design range'
              : count.level === 'over'
                ? ' · over the design range'
                : ''}
          </>
        ) : (
          'no range for this field'
        )}
        {refused ? ' · this field takes one paragraph (Shift+Enter: line break)' : ''}
        {navigate ? ' · Tab next cell · ↵ cell below · Esc cancel' : ' · ⌘↵ done · Esc cancel'}
      </div>
    </>
  );
}
