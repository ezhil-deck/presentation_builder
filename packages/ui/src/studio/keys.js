// The Studio's keyboard map (docs/P4-spec.md §2, P4.4): every shortcut of the Studio and its editor declared as data -
// the key(s), the modifiers, the scope it works in, a label and the action id the handlers switch on - and one
// matcher. The Shortcuts overlay (`?`) and the table in docs/STUDIO.md are generated from this list (a unit test
// checks the doc). ⌘ means Cmd on a Mac and Ctrl elsewhere: an entry with `meta: true` matches either key.
//
// Modifiers per entry: `true` = must be held, `false` (the default) = must not be held, `null` = either. Keys of the
// `view`, `edit` and `filmstrip` scopes never fire while the focus is in an input, a textarea, a select or a
// contenteditable; the `inline` and `grid` scopes are the keys of those fields.

/** The scopes, in the order the overlay and the doc list them. */
export const SCOPES = Object.freeze([
  { id: 'view', label: 'Studio (view and edit mode)' },
  { id: 'edit', label: 'Edit mode (the canvas)' },
  { id: 'filmstrip', label: 'Filmstrip (a slide row focused)' },
  { id: 'inline', label: 'Inline text' },
  { id: 'grid', label: 'Table cells and the data grid' },
]);

const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const ANY = null;

/**
 * Every shortcut. `keys` are KeyboardEvent.key values (letters lower case: the match ignores case); `action` is what
 * the handler does (several entries may share one action).
 */
export const SHORTCUTS = Object.freeze(
  [
    // ---- view: the Studio, in view and in edit mode ----
    { scope: 'view', action: 'edit-mode', keys: ['e'], shift: ANY, label: 'Edit mode on / off' },
    { scope: 'view', action: 'grid-view', keys: ['g'], shift: ANY, label: 'The deck as a grid on / off' },
    { scope: 'view', action: 'undo', keys: ['z'], meta: true, label: 'Undo' },
    { scope: 'view', action: 'redo', keys: ['z'], meta: true, shift: true, label: 'Redo' },
    {
      scope: 'view',
      action: 'prev-slide',
      keys: ['ArrowLeft', 'ArrowUp', 'PageUp'],
      shift: ANY,
      alt: ANY,
      label: 'Previous slide (edit mode: when nothing is selected)',
    },
    {
      scope: 'view',
      action: 'next-slide',
      keys: ['ArrowRight', 'ArrowDown', 'PageDown'],
      shift: ANY,
      alt: ANY,
      label: 'Next slide (edit mode: when nothing is selected)',
    },
    { scope: 'view', action: 'prev-slide', keys: ['['], label: 'Previous slide' },
    { scope: 'view', action: 'next-slide', keys: [']'], label: 'Next slide' },
    {
      scope: 'view',
      action: 'first-slide',
      keys: ['Home'],
      meta: ANY,
      shift: ANY,
      alt: ANY,
      label: 'First slide',
    },
    {
      scope: 'view',
      action: 'first-slide',
      keys: ['ArrowLeft', 'ArrowUp', 'PageUp'],
      meta: true,
      shift: ANY,
      alt: ANY,
      label: 'First slide',
    },
    {
      scope: 'view',
      action: 'last-slide',
      keys: ['End'],
      meta: ANY,
      shift: ANY,
      alt: ANY,
      label: 'Last slide',
    },
    {
      scope: 'view',
      action: 'last-slide',
      keys: ['ArrowRight', 'ArrowDown', 'PageDown'],
      meta: true,
      shift: ANY,
      alt: ANY,
      label: 'Last slide',
    },
    { scope: 'view', action: 'shortcuts', keys: ['?'], shift: ANY, label: 'This list of shortcuts' },
    {
      scope: 'view',
      action: 'close',
      keys: ['Escape'],
      meta: ANY,
      shift: ANY,
      alt: ANY,
      label: 'Close the drawer, the grid or this list',
    },
    // ---- edit: the canvas in edit mode ----
    {
      scope: 'edit',
      action: 'escape',
      keys: ['Escape'],
      meta: ANY,
      shift: ANY,
      alt: ANY,
      label: 'Leave focal mode or the group, else clear the selection',
    },
    {
      scope: 'edit',
      action: 'inline-edit',
      keys: ['Enter'],
      shift: ANY,
      alt: ANY,
      label: 'Edit the selected text inline (a table: its first cell)',
    },
    { scope: 'edit', action: 'next-element', keys: ['Tab'], alt: ANY, label: 'Select the next element' },
    {
      scope: 'edit',
      action: 'prev-element',
      keys: ['Tab'],
      shift: true,
      alt: ANY,
      label: 'Select the previous element',
    },
    { scope: 'edit', action: 'nudge', keys: ARROWS, alt: ANY, label: 'Nudge the selection 1 px' },
    {
      scope: 'edit',
      action: 'nudge-10',
      keys: ARROWS,
      shift: true,
      alt: ANY,
      label: 'Nudge the selection 10 px',
    },
    {
      scope: 'edit',
      action: 'select-all',
      keys: ['a'],
      meta: true,
      label: 'Select every editable element (not hidden, locked or background)',
    },
    {
      scope: 'edit',
      action: 'lock',
      keys: ['l'],
      meta: true,
      shift: true,
      label: 'Lock / unlock the selection',
    },
    {
      scope: 'edit',
      action: 'hide',
      keys: ['h'],
      meta: true,
      shift: true,
      label: 'Hide the selection (nothing selected: show the hidden ones)',
    },
    {
      scope: 'edit',
      action: 'hide-selection',
      keys: ['Delete', 'Backspace'],
      shift: ANY,
      alt: ANY,
      label: 'Hide the selection (one undo step)',
    },
    // ---- filmstrip: a slide row focused ----
    {
      scope: 'filmstrip',
      action: 'duplicate-slide',
      keys: ['d'],
      meta: true,
      shift: ANY,
      alt: ANY,
      label: 'Duplicate the slide',
    },
    {
      scope: 'filmstrip',
      action: 'delete-slide',
      keys: ['Delete', 'Backspace'],
      shift: ANY,
      alt: ANY,
      label: 'Delete the slide',
    },
    {
      scope: 'filmstrip',
      action: 'move-slide-up',
      keys: ['ArrowUp'],
      meta: true,
      shift: ANY,
      alt: ANY,
      label: 'Move the slide up',
    },
    {
      scope: 'filmstrip',
      action: 'move-slide-down',
      keys: ['ArrowDown'],
      meta: true,
      shift: ANY,
      alt: ANY,
      label: 'Move the slide down',
    },
    // ---- inline: the inline text editor ----
    {
      scope: 'inline',
      action: 'inline-commit',
      keys: ['Enter'],
      meta: true,
      shift: ANY,
      alt: ANY,
      label: 'Done (commit the text)',
    },
    {
      scope: 'inline',
      action: 'inline-cancel',
      keys: ['Escape'],
      meta: ANY,
      shift: ANY,
      alt: ANY,
      label: 'Cancel the edit',
    },
    { scope: 'inline', action: 'inline-paragraph', keys: ['Enter'], alt: ANY, label: 'New paragraph' },
    { scope: 'inline', action: 'inline-break', keys: ['Enter'], shift: true, alt: ANY, label: 'Line break' },
    { scope: 'inline', action: 'bold', keys: ['b'], meta: true, shift: ANY, alt: ANY, label: 'Bold' },
    { scope: 'inline', action: 'italic', keys: ['i'], meta: true, shift: ANY, alt: ANY, label: 'Italic' },
    { scope: 'inline', action: 'link', keys: ['k'], meta: true, shift: ANY, alt: ANY, label: 'Link' },
    // ---- grid: a table cell edited inline, a cell of the Data tab's grid ----
    { scope: 'grid', action: 'cell-next', keys: ['Tab'], meta: ANY, alt: ANY, label: 'Commit, next cell' },
    {
      scope: 'grid',
      action: 'cell-prev',
      keys: ['Tab'],
      meta: ANY,
      shift: true,
      alt: ANY,
      label: 'Commit, previous cell',
    },
    { scope: 'grid', action: 'cell-down', keys: ['Enter'], alt: ANY, label: 'Commit, the cell below' },
    {
      scope: 'grid',
      action: 'cell-cancel',
      keys: ['Escape'],
      meta: ANY,
      shift: ANY,
      alt: ANY,
      label: 'Cancel the cell edit',
    },
  ].map((e) => Object.freeze({ meta: false, shift: false, alt: false, ...e })),
);

/** True when a key event comes from a field the user is typing in (an input, a textarea, a select, contenteditable). */
export function typingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return Boolean(target.closest?.('input, textarea, select, [contenteditable="true"]'));
}

const TYPING_SCOPES = new Set(['inline', 'grid']);
const norm = (k) => (typeof k === 'string' && k.length === 1 ? k.toLowerCase() : k);
const held = (want, on) => want === null || want === Boolean(on);

/** Does the event match this entry? ⌘ = Cmd (metaKey) or Ctrl (ctrlKey). */
export function matchesEntry(e, entry) {
  if (!e || !entry.keys.some((k) => norm(k) === norm(e.key))) return false;
  return (
    held(entry.meta, e.metaKey || e.ctrlKey) && held(entry.shift, e.shiftKey) && held(entry.alt, e.altKey)
  );
}

/**
 * The action of a key event in `scope` (the first entry of that scope it matches), or null. In the `view`, `edit`
 * and `filmstrip` scopes a key typed into a field is never an action.
 */
export function matchKey(e, scope) {
  if (!e) return null;
  if (!TYPING_SCOPES.has(scope) && typingTarget(e.target)) return null;
  for (const entry of SHORTCUTS) if (entry.scope === scope && matchesEntry(e, entry)) return entry.action;
  return null;
}

/** The arrow of a key event as a direction {dx, dy} (unit steps), or null. */
export function arrowOf(e) {
  return (
    {
      ArrowLeft: { dx: -1, dy: 0 },
      ArrowRight: { dx: 1, dy: 0 },
      ArrowUp: { dx: 0, dy: -1 },
      ArrowDown: { dx: 0, dy: 1 },
    }[e?.key] ?? null
  );
}

const KEY_LABEL = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Enter: '↵',
  Backspace: '⌫',
  Delete: 'Del',
};

/** How an entry's keys are written (the overlay, the doc): e.g. "⌘Z", "⇧⌘Z", "← / ↑ / PageUp". */
export function formatKeys(entry) {
  const mods = `${entry.alt ? '⌥' : ''}${entry.shift ? '⇧' : ''}${entry.meta ? '⌘' : ''}`;
  return entry.keys
    .map((k) => `${mods}${KEY_LABEL[k] ?? (k.length === 1 ? k.toUpperCase() : k)}`)
    .join(' / ');
}

/** The keyboard map as Markdown tables, one per scope (the source of the table in docs/STUDIO.md). */
export function shortcutsMarkdown() {
  return SCOPES.map((s) => {
    const rows = SHORTCUTS.filter((e) => e.scope === s.id).map(
      (e) => `| \`${formatKeys(e)}\` | ${e.label} | \`${e.action}\` |`,
    );
    return [
      `**${s.label}** (\`${s.id}\`)`,
      '',
      '| Keys | Action | Id |',
      '| --- | --- | --- |',
      ...rows,
    ].join('\n');
  }).join('\n\n');
}
