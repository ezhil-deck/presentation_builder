/**
 * @pb/templates - the template records (V1, docs/PLAN-template-library.md §2, docs/TEMPLATES.md): an anatomy record
 * plus intent, written in the vocabulary. `data/catalogue.json` holds the Rich Slide Catalogue's 1,646 records
 * (scripts/catalogue-records.mjs, compositions only: no needs); any other `data/*.json` (written by
 * scripts/template-records.mjs) holds hand-authored records. Read-only here: nothing in this package measures.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseCapabilityKey, termEntry } from '@pb/vocabulary';
import data from './data.cjs';
import { toTemplate } from './convert.js';

export {
  KIND_CATEGORY,
  IMAGE_KINDS,
  PHOTO_TAGS,
  STATEMENT_TAGS,
  SIGNATURE_NEEDS,
  brandVisual,
  needWeight,
  statementSample,
  templateFields,
  DEVICE_TYPES,
  candidates,
  capabilityIndex,
  categoryOf,
  contentFit,
  pickTemplate,
  resolveNeed,
  samplesOf,
  templatesFor,
  usableDevices,
} from './match.js';
export {
  toTemplate,
  canonical,
  stringifyRecords,
  cellsOf,
  zoneOf,
  anchorOf,
  breaksMargin,
  angleOf,
} from './convert.js';

let all = null;
/** Every template record: the catalogue's, then the authored files' (data/*.json). */
export function templates() {
  if (!all) all = Object.values(data.files()).flatMap((f) => f.records || []);
  return all;
}

let authored = null;
/**
 * The hand-authored records only (data/*.json except catalogue.json; V3's template library, data/authored.json),
 * read without the 14 MB catalogue file: the binding (V3) matches these.
 */
export function authoredTemplates() {
  if (!authored) authored = Object.values(data.authoredFiles()).flatMap((f) => f.records || []);
  return authored;
}

/**
 * A need key of a template: the capability-key grammar (@pb/vocabulary parseCapabilityKey) plus one template-side
 * wildcard the grammar does not have, `image:any` (any image kind the brand or the slide gives; V3, PR-6). A brand
 * capability is never `image:any`; the wildcard is only ever a need.
 */
export function parseNeedKey(key) {
  if (key === 'image:any') return { kind: 'image', arg: 'any' };
  return parseCapabilityKey(key);
}

/** The records of one E3 slide kind (`cover-slide` ...), or `unknown`. */
export const templatesOf = (category) => templates().filter((t) => t.category === category);

/** One record by id, or null. */
export const templateById = (id) => templates().find((t) => t.id === id) || null;

/** What a record needs from a brand: its needs (empty for a composition). */
export const needsOf = (record) => record.needs || [];

let validator = null;
const schemaValidator = () => {
  if (!validator) {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    validator = ajv.compile(data.schema());
  }
  return validator;
};

const isTerm = (ns, t) => t === 'unknown' || Boolean(termEntry(ns, t));

/**
 * Validates one record: the schema (schemas/template.schema.json), every role / category / treatment / primitive a
 * vocabulary term (or `unknown`), every need key in the capability-key grammar and naming an element of the record,
 * every authored intent mark a term. Returns {valid, errors: [messages]}.
 */
export function validateTemplate(record) {
  const errors = [];
  const v = schemaValidator();
  if (!v(record)) for (const e of v.errors) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
  const els = Array.isArray(record?.elements) ? record.elements : [];
  const ids = new Set(els.map((e) => e.id));
  if (record?.category && record.category !== 'unknown') {
    const t = termEntry('E3', record.category);
    if (!t || t.group !== 'kind') errors.push(`category "${record.category}" is not an E3 slide kind term`);
  }
  for (const e of els) {
    if (!isTerm('E2', e.role)) errors.push(`element ${e.id}: role "${e.role}" is not an E2 term`);
    if (e.primitive && !isTerm('E1', e.primitive))
      errors.push(`element ${e.id}: primitive "${e.primitive}" is not an E1 term`);
    if (e.treatment && !isTerm('E4', e.treatment))
      errors.push(`element ${e.id}: treatment "${e.treatment}" is not an E4 term`);
    if (e.authored?.role && !termEntry('E2', e.authored.role))
      errors.push(
        `element ${e.id}: authored data-role "${e.authored.role}" is not an E2 term (an unknown term)`,
      );
    if (e.authored?.treatment && !termEntry('E4', e.authored.treatment))
      errors.push(
        `element ${e.id}: authored data-treatment "${e.authored.treatment}" is not an E4 term (an unknown term)`,
      );
  }
  for (const n of record?.needs || []) {
    const p = parseNeedKey(n.key);
    if (p.error) errors.push(`need: ${p.error}`);
    if (!n.element || !ids.has(n.element))
      errors.push(`need "${n.key}" names no element of the record (${n.element ?? 'none'})`);
    if (n.role && !isTerm('E2', n.role)) errors.push(`need "${n.key}": role "${n.role}" is not an E2 term`);
  }
  // a question names an element, or `slide` (the authored category the kind chain identifies differently)
  for (const q of record?.questions || [])
    if (!ids.has(q.element) && q.element !== 'slide') errors.push(`question names no element (${q.element})`);
  if (record?.authoredCategory) {
    const t = termEntry('E3', record.authoredCategory);
    if (!t || t.group !== 'kind')
      errors.push(`authoredCategory "${record.authoredCategory}" is not an E3 slide kind term`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * A hand-authored template record (scripts/template-records.mjs): the measured record (toTemplate) plus what the
 * intent marks say. The marks never decide a role: an authored role or treatment that differs from the identified
 * one is a question (the element keeps the identified value until the owner verifies the record, D13); a need
 * becomes a need of the record, naming its element. Returns {template, errors}: errors = unknown terms, needs outside
 * the grammar (the record is still built so every error is listed at once).
 */
export function authoredTemplate({
  id,
  record,
  raw,
  file,
  options = [],
  measuredAt,
  author,
  category,
  basis,
}) {
  const errors = [];
  const t = toTemplate({
    id,
    record,
    raw,
    source: { kind: 'authored', ref: file },
    composition: false,
    provenance: {
      source: 'authored',
      file,
      measuredAt,
      exact: true,
      verifiedAt: null,
      ...(author ? { author } : {}),
      ...(basis ? { basis } : {}),
    },
    options,
  });
  const questions = [];
  // the kind the template was written for (data-category): the binding reads it; the kind chain's answer stays in
  // `category`, and a difference is a question on the slide
  if (category) {
    const ct = termEntry('E3', category);
    if (!ct || ct.group !== 'kind')
      errors.push(`data-category "${category}" is not an E3 slide kind term (an unknown term)`);
    else {
      t.authoredCategory = category;
      if (category !== t.category)
        questions.push({
          element: 'slide',
          authored: category,
          identified: t.category,
          why: `authored as ${category}, identified as ${t.category} (${t.categoryWhy ?? 'kind chain'}): the kind chain reads deck position, which a template does not have; the binding reads the authored category, the identified one stays in the record until the owner verifies it (D13)`,
        });
    }
  }
  const needs = [];
  for (const e of t.elements) {
    const a = e.authored;
    if (!a) continue;
    if (a.role) {
      if (!termEntry('E2', a.role))
        errors.push(`element ${e.id}: data-role "${a.role}" is not an E2 term (an unknown term)`);
      else if (a.role !== e.role)
        questions.push({
          element: e.id,
          authored: a.role,
          identified: e.role,
          why: `authored as ${a.role}, identified as ${e.role} (${e.why}): the identified role is kept until the owner verifies the record (verifiedAt, D13)`,
        });
    }
    if (a.treatment) {
      if (!termEntry('E4', a.treatment))
        errors.push(`element ${e.id}: data-treatment "${a.treatment}" is not an E4 term (an unknown term)`);
      else if (a.treatment !== (e.treatment ?? null))
        questions.push({
          element: e.id,
          authored: a.treatment,
          identified: e.treatment ?? 'none',
          why: `treatment authored as ${a.treatment}, measured as ${e.treatment ?? 'none'}: the measured treatment is kept until the owner verifies the record`,
        });
    }
    if (a.need) {
      const p = parseNeedKey(a.need);
      if (p.error) errors.push(`element ${e.id}: data-need ${p.error}`);
      needs.push({
        key: a.need,
        role: a.role && termEntry('E2', a.role) ? a.role : e.role,
        optional: Boolean(a.needOptional),
        why: `data-need on ${e.id}${a.needOptional ? ' (data-need-optional)' : ''}`,
        element: e.id,
      });
    }
  }
  t.needs = needs;
  if (!needs.length) t.composition = true;
  if (questions.length) t.questions = questions;
  return { template: t, errors };
}
