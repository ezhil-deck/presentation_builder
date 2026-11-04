#!/usr/bin/env node
// The vocabulary's generated pages (docs/PLAN-template-library.md §1.3, V0): writes docs/vocabulary.md from
// packages/vocabulary/data/vocabulary.json + maps.json (every term, its rules in words with their why, signal,
// confusables, maps-from, examples; the predicate set; the schema map; the catalogue answer key), regenerates the
// generated section of .claude/skills/slide-anatomy/references/roles.md (its heading and "Known limits" tail stay
// hand-written), and records the answer key's result in packages/vocabulary/__tests__/fixtures/answer-key.json (the
// test holds the build to it: no new miss). Reads golden/catalogue/rich-slide-catalogue.html once.
//
//   npm run vocabulary:docs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import data from '../packages/vocabulary/src/data.cjs';
import {
  PREDICATES,
  chains,
  confusables,
  maps,
  terms,
  vocabulary,
} from '../packages/vocabulary/src/index.js';
import { blockSlideRoles, rate, runAnswerKey } from '../packages/vocabulary/src/answer-key.js';

const ROOT = data.REPO_ROOT;
export const DOC_FILE = join(ROOT, 'docs', 'vocabulary.md');
export const ROLES_FILE = join(ROOT, '.claude', 'skills', 'slide-anatomy', 'references', 'roles.md');
export const KEY_FILE = join(ROOT, 'packages', 'vocabulary', '__tests__', 'fixtures', 'answer-key.json');
export const GEN_START =
  '<!-- generated from packages/vocabulary/data/vocabulary.json by scripts/vocabulary-docs.mjs: do not edit -->';
export const GEN_END = '<!-- end of generated section -->';

/** Why each kind of answer-key miss happens (by expected -> got (rule)). Written by hand; the counts are measured. */
export const MISS_REASONS = {
  'point -> E2:bullet (bullet.list-line)':
    'Two causes. L8-53 / L11-6: a bar label of 7 words or more ("US chatbot users: use it as search") fails the label test (6 words or fewer). L7-8: the chart\'s figures sit in unmarked item elements outside its marked element, so its block shows no data labels and its labels read as list lines.',
  'value -> E2:heading (heading.item)':
    'The KPI value is not a number pattern: a word figure ("No findings", "Sub-second", "Elevenfold" is caught) or a bare count with two words ("6 use cases", "4 big bets": the pattern allows one word after a bare count so that "2 key findings" stays a heading). The item then leads with it as its heading.',
  'body -> E2:description (description.under-heading)':
    'Follows from the value miss above: with no big-number in the item, its body is the description of the (mis-read) heading.',
  'heading -> E2:description (description.under-heading)':
    'Follows from the value miss above (a value + heading + body item: the value leads, the heading reads as its description).',
  'roadmap -> E3:items (items.heading-description)':
    'The roadmap is labelled 01 / 1 / a region / nothing: nothing visible marks a sequence (no period, no step word). The line joining its items is recorded by the geometry (`rules.axis`) only for containers typed roadmap / timeline, so it is not read: it would leak the hidden type. Gap for V1: measure the axis / connector for every container (scripts/catalogue-geometry.mjs), then a connector through the items is the visible sequence sign.',
  'list_with_description -> E3:compare (compare.two-sides)':
    'Two items side by side with a rule between them and no numbering: drawn exactly as the catalogue draws a comparison. No visible test separates them.',
  'multi_column_list -> E3:compare (compare.two-sides)':
    'As above: two columns side by side with a rule between.',
  'comparison -> E3:items (items.heading-description)':
    'A comparison drawn as two stacked items, or side by side without a rule between, or labelled with a period ("2022 to 2024"): no visible contrast mark.',
  'chart -> -:unknown (none)':
    'Its bar labels mix label (6 words or fewer) and bullet (7 words or more), so no block rule holds (every field a label / every field a bullet).',
  'chart -> E3:points (points.bullets)':
    "The chart's figures sit in unmarked item elements outside its marked element (the block's own text is read from the marked element), so its labels show no data labels and read as bullets.",
};

/* ---------------------------------------------------------------------------------------- formatting */

const val = (v) => {
  if (v && typeof v === 'object' && 'ctx' in v)
    return `${v.times && v.times !== 1 ? `${v.times} x ` : ''}${v.ctx}`;
  if (v && typeof v === 'object' && 'field' in v)
    return `${v.times && v.times !== 1 ? `${v.times} x ` : ''}${v.field}`;
  return JSON.stringify(v);
};
const miss = (m) => (m === 'pass' ? ' (holds when the right side is missing)' : '');
const OPS = { gte: '>=', gt: '>', lte: '<=', lt: '<' };

/** One predicate in words. */
export function words(p) {
  const [k, a] = Object.entries(p)[0];
  if (k === 'kind') return `kind is ${a.join(' / ')}`;
  if (k === 'has') return `${a}`;
  if (k === 'lacks') return `not ${a}`;
  if (k === 'eq') return `${a[0]} = ${JSON.stringify(a[1])}`;
  if (k === 'in') return `${a[0]} in ${a[1].join(' / ')}`;
  if (OPS[k]) return `${a[0]} ${OPS[k]} ${val(a[1])}${miss(a[2])}`;
  if (k === 'near') return `|${a[0]} - ${val(a[1])}| < ${a[2]}`;
  if (k === 'text') return `text matches \`${a}\``;
  if (k === 'notText') return `text does not match \`${a}\``;
  if (k === 'match') return `${a[0]} matches \`${a[1]}\``;
  if (k === 'any') return `(${a.map((g) => g.map(words).join(' and ')).join(') or (')})`;
  if (k === 'not') return `not (${words(a)})`;
  if (k === 'rank')
    return `the largest ${a.by} among the free ${a.among.kind.join(' / ')} (topmost within ${a.tol})`;
  if (k === 'stacked')
    return `directly ${a.side} the ${a.on} (gap < ${a.gapTimesSize} x its size, same edge${a.grow ? `, the ${a.grow.join(' / ')} stack growing` : ''})`;
  if (k === 'nextTo') return `next to a text the rule \`${a.rule}\` identified`;
  if (k === 'below')
    return `directly under a ${a.kind.join(' / ')} of >= ${a.minArea} % (gap <= ${a.gap} % H)`;
  if (k === 'belowText')
    return `directly under a text matching \`${a.pattern}\` (gap <= ${a.gap} % H${a.smaller ? ', smaller than it' : ''})`;
  if (k === 'sibling') return `a field of its item is ${a}`;
  if (k === 'siblingBefore') return `a field before it in its item is ${a}`;
  if (k === 'leads') return 'it leads its item (heaviest, then first)';
  return JSON.stringify(p);
}
const when = (r) => (r.when.length ? r.when.map(words).join('; ') : 'always (the last rule of its chain)');
const tk = (ns, t) => `${ns}:${t}`;
const anchor = (ns, t) => `${ns.toLowerCase()}-${t}`.replace(/[^a-z0-9-]/g, '-');
const link = (ns, t) => `[${t}](#${anchor(ns, t)})`;

/* ---------------------------------------------------------------------------------------- docs/vocabulary.md */

export function renderVocabularyDoc({ key, blockRoles, anatomyRoles }) {
  const v = vocabulary();
  const m = maps();
  const L = [];
  const p = (s = '') => L.push(s);
  p('# The element / component vocabulary');
  p();
  p(GEN_START);
  p();
  p(
    'Generated by `npm run vocabulary:docs` (scripts/vocabulary-docs.mjs) from `packages/vocabulary/data/vocabulary.json` and',
  );
  p(
    '`maps.json`. One term per thing, in four namespaces, each with an ordered identification rule set that a script runs',
  );
  p(
    '(`identify()` in JS, `vocabulary_rules.py` for the slide-anatomy skill), never a judgment. When no rule decides, the',
  );
  p('answer is `unknown` - returned, never a guess, and counted. Plan: docs/PLAN-template-library.md §1.');
  p();
  p('| namespace | question | terms |');
  p('|---|---|---|');
  const NS = {
    E1: 'primitive: what is drawn',
    E2: 'role: what a thing is for on the slide',
    E3: 'structure: what things form together',
    E4: 'treatment: how a thing is finished',
  };
  for (const [ns, q] of Object.entries(NS)) p(`| ${ns} | ${q} | ${terms(ns).length} |`);
  p();
  p('## How a term is identified: the chains');
  p();
  p(
    'A chain is one question asked of one kind of subject. Its rules run in order; each rule runs over every subject still',
  );
  p(
    'unassigned, and the first rule that holds decides (so "the largest free text" is the largest text no earlier rule took).',
  );
  p();
  for (const [scope, c] of Object.entries(chains())) {
    p(`### Chain \`${scope}\` (${c.namespace})`);
    p();
    p(`Subject: ${c.subject}. ${c.doc}`);
    if (c.none) p(`\nNone: when ${c.none.when.map(words).join('; ')} - ${c.none.why}.`);
    p();
    p('| order | rule | term | when | why |');
    p('|---|---|---|---|---|');
    for (const r of c.rules)
      p(
        `| ${r.order} | \`${r.id}\` | ${link(r.namespace, r.term)} | ${when(r).replace(/\|/g, '\\|')} | ${r.why.replace(/\|/g, '\\|')} |`,
      );
    p();
  }
  p('## The predicate set');
  p();
  p(
    'A rule is `{id, order, when: [predicate, ...], why}`; every predicate must hold. A predicate is an object with one key.',
  );
  p(
    'Geometry is in % of the slide (`bbox` = [x0, y0, x1, y1]); `sizePctH` is the text size in % of the slide height.',
  );
  p();
  p('| predicate | argument | holds when |');
  p('|---|---|---|');
  for (const [name, d] of Object.entries(PREDICATES))
    p(`| \`${name}\` | \`${d.args}\` | ${d.doc.replace(/\|/g, '\\|')} |`);
  p();
  p(
    'Derived fields (computed by `prepare()` when the measurement does not give them): `words`, `commas`, `hasDigit`,',
  );
  p(
    '`capitalShare` (share of words starting upper-case), `x0` `y0` `x1` `y1` `w` `h`, `areaPct`, `aspect` (w / h in slide',
  );
  p(
    'units), `inCorner` (top / bottom 22 % and left / right 30 %), `thin` (h < 0.8 % H or w < 0.5 % W), `length` (the longer',
  );
  p(
    'side), `spansSide` (w > 95 and h <= 30, or h > 95 and w <= 40), `bleedCount`, `holdsText` / `heldTexts` (non-furniture)',
  );
  p(
    '/ `heldWords` / `heldText` (texts inside a non-text box), `sidesWithContent` (0-2: content along a thin line on each side,',
  );
  p(
    'the line at least half as long as the wider side), `inBlock`, `itemFields`, `blockItems`. Measured fields a rule may',
  );
  p(
    "read: `furniture` (repeated at the same spot on >= 40 % of the deck's pages), `pieces`, `transparent`, `angles`,",
  );
  p(
    '`opacity`, `tilt`, `mask`, `pill`, `onEdge`, `pointer`, `stroke`, `fill`, `framesContent`, `itemHead`, `joinsItems`,',
  );
  p(
    '`peerMarks`, `numberLabelsInside`, `textsInside`, `series`, `rowPeers`, `activePeer`, `cells`, `subTexts`,',
  );
  p(
    '`blockCover`, `blockDataLabels`, and the brand context `inLogos` (true / false: its file is / is not a brand logo), `named`',
  );
  p('(the brand names it as its device), `signature` (the L4 signature of a reference record).');
  p();
  p('## Text patterns');
  p();
  p('| name | regex (case-insensitive; `\\w` = letters, digits, underscore) |');
  p('|---|---|');
  for (const [n, src] of Object.entries(v.patterns))
    p(`| \`${n}\` | \`${src.replace(/\|/g, '\\|').replace(/`/g, "'")}\` |`);
  p();
  for (const ns of ['E1', 'E2', 'E3', 'E4']) {
    p(`## ${ns} - ${NS[ns]}`);
    p();
    for (const e of terms(ns)) {
      p(`<a id="${anchor(ns, e.term)}"></a>`);
      p(`### ${e.term}${e.group ? ` (${e.group})` : ''}`);
      p();
      p(e.definition);
      p();
      if (e.identify.length) {
        p('Identified when (in chain order):');
        for (const r of e.identify)
          p(`- \`${r.id}\` (chain \`${r.scope}\`, order ${r.order}): ${when(r)}. Why: ${r.why}.`);
      } else p('Identified when: no rule holds (it is the answer of no rule).');
      if (e.signal) p(`\nSignal: ${e.signal}.`);
      const cf = confusables(e.term, e.namespace);
      if (cf.length) {
        p('\nNot to be confused with:');
        for (const c of cf)
          p(`- ${link(c.namespace, c.term)}${c.namespace !== ns ? ` (${c.namespace})` : ''}: ${c.test}`);
      }
      const mf = Object.entries(e.mapsFrom).filter(([, list]) => list.length);
      if (mf.length) {
        p('\nMaps from:');
        for (const [sys, list] of mf) p(`- ${sys}: ${list.map((x) => `\`${x}\``).join(', ')}`);
      }
      p(`\nExamples: yes - ${e.examples.positive}; no - ${e.examples.negative}.`);
      p();
    }
  }
  p('## The schema map (maps.json)');
  p();
  p(
    'Every enum value and string const of the five schemas + the input format, by path, maps to one term or the path is',
  );
  p(
    'excluded with its reason (`__tests__/maps.test.js` collects the paths from the schema files, so a new name without a',
  );
  p('map fails).');
  p();
  p('| source | paths | values -> term |');
  p('|---|---|---|');
  for (const [name, s] of Object.entries({ ...m.sources, ...m.keys })) {
    const vals = Object.entries(s.values)
      .map(([k, t]) => `${k} -> ${tk(t.namespace, t.term)}`)
      .join('; ');
    const ex = s.excludedValues
      ? `; excluded: ${Object.entries(s.excludedValues)
          .map(([k, w]) => `${k} (${w})`)
          .join('; ')}`
      : '';
    p(
      `| \`${name}\` | ${s.at.map((a) => `\`${a}\``).join('<br>')} | ${vals}${ex}${s.note ? `. ${s.note}` : ''} |`,
    );
  }
  p();
  p('Excluded paths (they name no kind of thing):');
  p();
  const byWhy = {};
  for (const [path, why] of Object.entries(m.excluded)) (byWhy[why] ??= []).push(path);
  for (const [why, paths] of Object.entries(byWhy)) p(`- ${why}: ${paths.map((x) => `\`${x}\``).join(', ')}`);
  p();
  if (key) {
    p('## The catalogue answer key');
    p();
    p(
      '`identify()` over every plan slide of golden/catalogue/geometry.json with `containers[].type` and `fields[].f` hidden',
    );
    p(
      '(boxes, sizes, weights, lines, item grouping, classes, rules, numeral and the text read from the catalogue HTML are',
    );
    p(
      'visible), compared with the map of the hidden mark (maps.json `catalogue`). `unknown` counts as a miss. Target 100 %.',
    );
    p();
    for (const [sec, label] of [
      ['blocks', 'E3 block type, per catalogue container type'],
      ['fields', 'E2 field role, per catalogue field'],
      ['header', 'Header parts'],
    ]) {
      const rows = Object.entries(key[sec]);
      const n = rows.reduce((a, [, r]) => a + r.n, 0);
      const hit = rows.reduce((a, [, r]) => a + r.hit, 0);
      p(`### ${label}: ${hit} / ${n} (${rate({ n, hit })} %)`);
      p();
      p('| mark | expected | hit / n | % | hits resolved to |');
      p('|---|---|---|---|---|');
      for (const [mk, r] of rows)
        p(
          `| \`${mk}\` | ${r.expect} | ${r.hit} / ${r.n} | ${rate(r)} | ${Object.entries(r.resolved || {})
            .map(([t, c]) => `${t} ${c}`)
            .join(', ')} |`,
        );
      p();
      for (const [mk, byTerm] of Object.entries(sec === 'blocks' ? key.resolved || {} : {})) {
        p(`\`${mk}\` accepts ${key[sec][mk].expect}; each record resolved to:`);
        p();
        for (const [t, list] of Object.entries(byTerm)) p(`- ${t} (${list.length}): ${list.join(', ')}`);
        p();
      }
      const groups = {};
      for (const x of key.misses[sec]) {
        const g = `${x.mark} -> ${x.got} (${x.rule ?? 'none'})`;
        (groups[g] ??= []).push(x.slide);
      }
      if (Object.keys(groups).length) {
        p('Misses:');
        p();
        for (const [g, slides] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
          const uniq = [...new Set(slides)];
          p(
            `- **${g}**: ${slides.length} (${uniq.slice(0, 12).join(', ')}${uniq.length > 12 ? `, ... ${uniq.length} slides` : ''}). ${MISS_REASONS[g] ?? 'Reason not yet written.'}`,
          );
        }
        p();
      }
    }
  }
  if (blockRoles) {
    p('### The 258 block slides (no answer key: the roles identified)');
    p();
    p('| part | roles |');
    p('|---|---|');
    for (const [part, t] of Object.entries(blockRoles))
      p(
        `| \`${part}\` | ${Object.entries(t)
          .map(([r, c]) => `${r} ${c}`)
          .join(', ')} |`,
      );
    p();
  }
  if (anatomyRoles) {
    p('### The two anatomy examples (roles identified by anatomy.py through the vocabulary)');
    p();
    p('| example | roles |');
    p('|---|---|');
    for (const [ex, t] of Object.entries(anatomyRoles)) p(`| ${ex} | ${t} |`);
    p();
  }
  p(GEN_END);
  return `${L.join('\n')}\n`;
}

/* ---------------------------------------------------------------------------------------- roles.md */

/** The generated section of the skill's roles.md: the element chain's rules as the anatomy pass runs them. */
export function renderRolesSection() {
  const L = [];
  const p = (s = '') => L.push(s);
  p(GEN_START);
  p();
  p('anatomy.py decides every role with the vocabulary (packages/vocabulary/data/vocabulary.json, run by');
  p(
    'scripts/vocabulary_rules.py; the human page is docs/vocabulary.md). Rules run in this order; the first rule that holds',
  );
  p(
    'wins, and its reason is stored in `why` (its id in `rule`). Rules that read fields anatomy does not measure (block',
  );
  p(
    'items, brand context, opacity, tilt ...) never fire on a reference; they are listed so the order is whole. An object no',
  );
  p(
    'rule decides is `unknown` (before V0: small-text). Painted-over objects keep the QA role `hidden` and are not identified.',
  );
  p();
  p(
    'The **body size** is the size carrying the most words once the largest size is left out (one size only: that size). On',
  );
  p('covers the title carries most words, so leaving the largest size out stops the title becoming "body".');
  p();
  const rules = chains().element.rules;
  p('| order | role | rule | when | why |');
  p('|---|---|---|---|---|');
  for (const r of rules)
    p(
      `| ${r.order} | ${r.term} | \`${r.id}\` | ${when(r).replace(/\|/g, '\\|')} | ${r.why.replace(/\|/g, '\\|')} |`,
    );
  p();
  p(
    'Slide categories run the `kind` chain the same way (references/categories.md describes them; the vocabulary names them',
  );
  p('E3 `<kind>-slide`, and each rule keeps the category name the library uses):');
  p();
  p('| order | category | kind | when |');
  p('|---|---|---|---|');
  for (const r of chains().kind.rules)
    p(`| ${r.order} | ${r.label?.anatomy ?? '-'} | ${r.term} | ${when(r).replace(/\|/g, '\\|')} |`);
  p();
  p(GEN_END);
  return L.join('\n');
}

/** roles.md with its generated section replaced (the heading before it and the "Known limits" tail kept). */
export function renderRolesMd(current) {
  const head = current.includes(GEN_START)
    ? current.slice(0, current.indexOf(GEN_START))
    : current.slice(0, current.indexOf('\n') + 1) + '\n';
  const tailAt = current.indexOf('## Known limits');
  if (tailAt < 0) throw new Error('roles.md: no "## Known limits" section to keep');
  return `${head.trimEnd()}\n\n${renderRolesSection()}\n\n${current.slice(tailAt)}`;
}

/** The answer key as recorded for the test: hits per mark and the misses grouped. */
export function recordKey(key) {
  const out = {};
  for (const sec of ['blocks', 'fields', 'header']) {
    out[sec] = {};
    for (const [mk, r] of Object.entries(key[sec]))
      out[sec][mk] = { n: r.n, hit: r.hit, expect: r.expect, resolved: r.resolved };
    out[`${sec}Misses`] = {};
    for (const x of key.misses[sec]) {
      const g = `${x.mark} -> ${x.got} (${x.rule ?? 'none'})`;
      (out[`${sec}Misses`][g] ??= []).push(
        `${x.slide}${x.c !== undefined ? `/c${x.c}` : ''}${x.i !== undefined && x.i !== null ? `/i${x.i}` : ''}`,
      );
    }
  }
  out.resolved = key.resolved;
  return out;
}

function main() {
  const geometry = JSON.parse(readFileSync(join(ROOT, 'golden/catalogue/geometry.json'), 'utf8'));
  const html = readFileSync(join(ROOT, 'golden/catalogue/rich-slide-catalogue.html'), 'utf8');
  const key = runAnswerKey(geometry, html);
  const blockRoles = blockSlideRoles(geometry, html);
  const anatomyRoles = {};
  for (const f of ['cover-panel-diagonal', 'cover-serif-cutout']) {
    const rec = JSON.parse(
      readFileSync(join(ROOT, '.claude/skills/slide-anatomy/examples', `${f}.record.json`), 'utf8'),
    );
    anatomyRoles[f] = rec.L1_elements.map((e) => `${e.id} ${e.role}`).join(', ');
  }
  writeFileSync(DOC_FILE, renderVocabularyDoc({ key, blockRoles, anatomyRoles }));
  writeFileSync(ROLES_FILE, renderRolesMd(readFileSync(ROLES_FILE, 'utf8')));
  writeFileSync(KEY_FILE, `${JSON.stringify(recordKey(key), null, 1)}\n`);
  for (const sec of ['blocks', 'fields', 'header']) {
    const rows = Object.values(key[sec]);
    const n = rows.reduce((a, r) => a + r.n, 0);
    const hit = rows.reduce((a, r) => a + r.hit, 0);
    console.log(`${sec}: ${hit}/${n} (${rate({ n, hit })} %)`);
  }
  console.log(`wrote ${DOC_FILE}, ${ROLES_FILE}, ${KEY_FILE}`);
}

if (process.argv[1] && process.argv[1].endsWith('vocabulary-docs.mjs')) main();
