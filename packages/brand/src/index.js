/**
 * @pb/brand: brand folder -> BrandSpec (schemas/brand-spec.schema.json), by the rules of docs/P1-rules.md §A:
 * BR-READ, BR-NORMALIZE, BR-TONE, BR-FONTFILES, BR-METRICS, BR-ASSET, BR-QUESTIONS, BR-CLAIMS, BR-CAPABILITIES.
 */
import { basename } from 'node:path';
import { iconSet, inspectAsset, unreferencedAssets } from './assets.js';
import { deriveCapabilities } from './capabilities.js';
import { deriveClaims } from './claims.js';
import { measureContext } from './measure.js';
import { faceMetrics, resolveFaceFiles } from './fonts.js';
import { normalize } from './normalize.js';
import { escapeToken as esc } from './pointer.js';
import { brandQuestions } from './questions.js';
import { BrandInputError, readInput, requiredQuestion } from './read.js';
import { brandSpecViolations } from './validate.js';

export { BrandInputError, readInput } from './read.js';
export { normalize, BRANDSPEC_SCHEMA_ID } from './normalize.js';
export { relativeLuminance, contrastRatio, toneOf, parseHex } from './tone.js';
export { resolveFaceFiles, fontMetrics, faceMetrics, pickInstance } from './fonts.js';
export {
  inspectAsset,
  imageSize,
  svgSize,
  mimeOf,
  iconSet,
  listFiles,
  unreferencedAssets,
  isFontFile,
  ICON_VARIANTS,
} from './assets.js';
export { brandQuestions, REQUIRED_ROLES, REQUIRED_FACES } from './questions.js';
export { validateInput, validateBrandSpec, brandSpecViolations, splitInputErrors } from './validate.js';
export { requiredQuestion } from './read.js';
export {
  deriveCapabilities,
  unverifiedFields,
  isOffered,
  familyOf,
  termOf,
  FAMILIES,
  IMAGE_KINDS,
} from './capabilities.js';
export { deriveClaims, claimQuestion, brandColours, TOL as CLAIM_TOLERANCES } from './claims.js';
export { measureContext, inputPointer } from './measure.js';

export const CANVAS = { width: 1920, height: 1080 };

/** BR-FONTFILES + BR-METRICS onto spec.typography.faces. Returns per-face file info for BR-QUESTIONS. */
function addFonts(dir, input, spec, provenance, warnings, options) {
  const info = {};
  const faces = spec.typography?.faces ?? {};
  for (const [key, face] of Object.entries(faces)) {
    const font = input.typography.fonts[key];
    const out = `/typography/faces/${esc(key)}`;
    const resolved = resolveFaceFiles(dir, key, font);
    info[key] = resolved;
    face.files = resolved.files;
    provenance[`${out}/files`] = { source: 'derived', from: 'BR-FONTFILES', signal: resolved.fromPointer };
    face.variable = resolved.variable;
    provenance[`${out}/variable`] = { source: 'derived', from: 'BR-FONTFILES', signal: `${out}/files` };
    if (resolved.files.length && resolved.missing.length) {
      for (const m of resolved.missing)
        warnings.push({ pointer: m.pointer, message: `font file not found: ${m.file}` });
    }
    const { metrics, warnings: w } = faceMetrics(dir, face, options);
    for (const message of w) warnings.push({ pointer: `${out}/metrics`, message });
    if (metrics) {
      face.metrics = metrics;
      provenance[`${out}/metrics`] = { source: 'derived', from: 'BR-METRICS', signal: metrics.file };
    }
  }
  for (const [key, role] of Object.entries(spec.typography?.roles ?? {})) {
    if (role.face !== undefined && !faces[role.face]) {
      warnings.push({
        pointer: `/typography/styles/${esc(key)}/font`,
        message: `names "${role.face}", not a typography.fonts key`,
      });
    }
  }
  return info;
}

/**
 * BR-ASSET: check every referenced file; add mime/width/height to logos, decor elements and imagery samples.
 * BR-ICONS (E5): an icons.customPath folder becomes components.icons.files (the icon set).
 */
function addAssets(dir, input, spec, provenance) {
  const errors = [];
  const check = (pointer, file, { target, outPtr, allowDir } = {}) => {
    const result = inspectAsset(dir, file, { allowDir });
    if (!result.ok) {
      errors.push({ pointer, file: String(file), message: result.message });
      return result;
    }
    if (target && !result.isDir) {
      for (const k of ['mime', 'width', 'height']) {
        if (result.asset[k] !== undefined) {
          target[k] = result.asset[k];
          provenance[`${outPtr}/${k}`] = { source: 'derived', from: 'BR-ASSET', signal: file };
        }
      }
    }
    return result;
  };

  for (const [key, file] of Object.entries(input.brand?.logos ?? {})) {
    check(`/brand/logos/${esc(key)}`, file, {
      target: spec.logos.variants[key],
      outPtr: `/logos/variants/${esc(key)}`,
    });
  }
  (input.assets?.elements ?? []).forEach((el, i) => {
    if (el.file !== undefined) {
      check(`/assets/elements/${i}/file`, el.file, {
        target: spec.decor.elements[i],
        outPtr: `/decor/elements/${i}`,
      });
    }
    // E3: the animated / video versions of an element are files like `file` (kept on the element as given).
    for (const key of ['animated', 'video']) {
      if (el[key] !== undefined) check(`/assets/elements/${i}/${key}`, el[key]);
    }
  });
  (input.imagery?.samples ?? []).forEach((s, i) => {
    check(`/imagery/samples/${i}/file`, s.file, {
      target: spec.imagery.samples[i],
      outPtr: `/imagery/samples/${i}`,
    });
  });
  const bg = input.backgrounds ?? {};
  if (bg.default?.image !== undefined) check('/backgrounds/default/image', bg.default.image);
  for (const [key, v] of Object.entries(bg.variants ?? {})) {
    if (v.image !== undefined) check(`/backgrounds/variants/${esc(key)}/image`, v.image);
  }
  if (input.icons?.customPath !== undefined) {
    const folder = check('/icons/customPath', input.icons.customPath, { allowDir: true });
    if (folder.ok && folder.isDir) {
      spec.components.icons.files = iconSet(dir, input.icons.customPath);
      provenance['/components/icons/files'] = {
        source: 'derived',
        from: 'BR-ICONS',
        signal: '/icons/customPath',
      };
    }
  }
  for (const [key, list] of Object.entries(input.cards?.icon ?? {})) {
    if (/^files/.test(key) && Array.isArray(list)) {
      list.forEach((file, i) => {
        if (typeof file === 'string') check(`/cards/icon/${esc(key)}/${i}`, file);
      });
    }
  }
  for (const [key, mask] of Object.entries(input.masks?.options ?? {})) {
    if (mask?.file !== undefined) check(`/masks/options/${esc(key)}/file`, mask.file);
  }
  (input.layouts ?? []).forEach((layout, i) => {
    if (layout.template?.file !== undefined) check(`/layouts/${i}/template/file`, layout.template.file);
  });
  return errors;
}

/** The canvas must be 1920x1080 (input layout.width / layout.height). */
function canvasErrors(input) {
  const errors = [];
  for (const [key, want] of Object.entries(CANVAS)) {
    const got = input.layout?.[key];
    if (got !== want) {
      errors.push({
        pointer: `/layout/${key}`,
        message:
          got === undefined
            ? `is required and must be ${want}`
            : `must be ${want} (the canvas is 1920x1080), is ${got}`,
        keyword: got === undefined ? 'required' : 'const',
      });
    }
  }
  return errors;
}

/**
 * Read a brand folder `<dir>/<id>.json` (+ `answers.json` + assets) into a schema-valid BrandSpec.
 * Throws BrandInputError (`errors: [{pointer, message, file?}]`, plus `questions` once they are known) when the input,
 * its files or the resulting BrandSpec are invalid. Blocking questions do not throw: they are in `spec.questions`.
 * `options.cacheDir`: font metrics cache folder (default `.cache/fontmetrics/`; null = no cache).
 */
export function readBrand(dir, options = {}) {
  const read = readInput(dir);
  const { input } = read;
  const { spec: data, provenance, warnings: normalizeWarnings } = normalize(input, { answers: read.answers });
  const warnings = [...read.ignored, ...normalizeWarnings];

  const errors = [...canvasErrors(input)];
  const fonts = addFonts(read.dir, input, data, provenance, warnings, options);
  errors.push(...addAssets(read.dir, input, data, provenance));
  // E6: files under assets/ the BrandSpec does not name (font files excluded): listed, never used for design.
  data.unreferencedAssets = unreferencedAssets(read.dir, data);
  provenance['/unreferencedAssets'] = { source: 'derived', from: 'BR-ASSET', signal: 'assets/' };
  if (data.unreferencedAssets.length) {
    const n = data.unreferencedAssets.length;
    const first = data.unreferencedAssets.slice(0, 5).map((a) => a.file);
    warnings.push({
      pointer: '/unreferencedAssets',
      message:
        `${n} asset file${n === 1 ? ' is' : 's are'} not referenced by the brand JSON: ` +
        `${first.join(', ')}${n > 5 ? ', …' : ''}`,
    });
  }
  const { questions, warnings: questionWarnings } = brandQuestions(data, { fonts });
  warnings.push(...questionWarnings);

  if (errors.length) {
    throw failure(`brand ${read.id}: ${errors.length} input error(s)`, errors, questions);
  }

  // BR-CLAIMS then BR-CAPABILITIES: every file exists now; one measuring context (decoded images stay in it)
  const measure = measureContext(read.dir);
  const { claims, questions: claimQuestions } = deriveClaims(data, measure);
  data.claims = claims;
  claims.forEach((c, i) => {
    provenance[`/claims/${i}`] = {
      source: 'derived',
      from: 'BR-CLAIMS',
      signal: c.file ? `${c.pointer} + ${c.file}` : c.pointer,
    };
  });
  questions.push(...claimQuestions);
  data.capabilities = deriveCapabilities(data, provenance, measure);
  data.capabilities.forEach((c, i) => {
    provenance[`/capabilities/${i}`] = {
      source: 'derived',
      from: 'BR-CAPABILITIES',
      signal: c.from.join(' + '),
    };
  });

  const spec = {
    schema: data.schema,
    id: data.id,
    name: data.name,
    ...(data.tagline !== undefined ? { tagline: data.tagline } : {}),
    input: { file: basename(read.file), version: read.version, sha256: read.sha256 },
  };
  for (const [key, value] of Object.entries(data)) if (!(key in spec)) spec[key] = value;
  spec.provenance = provenance;
  spec.questions = questions;
  spec.warnings = warnings;

  const invalid = brandSpecViolations(spec);
  if (invalid.length) {
    throw failure(
      `brand ${read.id}: the BrandSpec is invalid (${invalid.length} error(s))`,
      invalid,
      questions,
      {
        spec,
      },
    );
  }
  return spec;
}

/**
 * D7: the BrandInputError readBrand throws. Every `required` error becomes a blocking question (unless a question
 * already covers its pointer); `needsAnswers` when nothing but required values is missing.
 */
function failure(message, errors, questions, extra = {}) {
  const all = [...questions];
  for (const e of errors) {
    if (e.keyword !== 'required' || all.some((q) => q.pointer === e.pointer)) continue;
    all.push(requiredQuestion(e.pointer, 'BR-NORMALIZE'));
  }
  const needsAnswers = errors.every((e) => e.keyword === 'required');
  const list = errors.map(({ keyword, ...rest }) => rest); // eslint-disable-line no-unused-vars
  return new BrandInputError(message, list, { ...extra, questions: all, needsAnswers });
}
