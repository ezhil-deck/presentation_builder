/**
 * BR-QUESTIONS: what the rules need and the brand does not give. Each question names the input pointer an answer
 * goes to (answers.json `{ "<pointer>": value }`), the rules that need it, and the options when the answer is a choice.
 */
import { slideSize } from './normalize.js';
import { escapeToken as esc } from './pointer.js';

export const REQUIRED_ROLES = ['display', 'h1', 'h2', 'h3', 'body', 'caption'];
export const REQUIRED_FACES = ['heading', 'body'];

function q(id, pointer, question, neededBy, severity = 'blocking', options) {
  const out = { id, pointer, question, neededBy, severity };
  if (options && options.length) out.options = options;
  return out;
}

/**
 * Questions for a BrandSpec (after BR-FONTFILES / BR-METRICS).
 * `fonts`: per face key `{ fromPointer, missing: [{file, pointer}] }` from resolveFaceFiles().
 * Returns `{ questions, warnings }` (optional questions come with the warning the doc asks for).
 */
export function brandQuestions(spec, { fonts = {} } = {}) {
  const questions = [];
  const warnings = [];

  if (!spec.colors?.primary) {
    questions.push(
      q('colors.primary', '/colors/primary', 'What is the brand primary colour (#RRGGBB)?', ['MD-PALETTE']),
    );
  }

  const surfaces = spec.surfaces ?? [];
  if (!surfaces.some((s) => s && s.bg && s.text)) {
    questions.push(
      q(
        'surfaces',
        '/surfaces',
        'Which background + text colour pairs (surfaces) does the brand allow text on?',
        ['MD-PALETTE'],
      ),
    );
  }

  const faces = spec.typography?.faces ?? {};
  for (const key of REQUIRED_FACES) {
    if (!faces[key]) {
      questions.push(
        q(
          `typography.faces.${key}`,
          `/typography/fonts/${esc(key)}`,
          `Which typeface (family + font files) is the ${key} face?`,
          ['BR-FONTFILES', 'BR-METRICS', 'MD-TYPE'],
        ),
      );
    }
  }
  for (const [key, face] of Object.entries(faces)) {
    const info = fonts[key] ?? {};
    if (!face.files || face.files.length === 0) {
      const missing = (info.missing ?? []).map((m) => m.file);
      questions.push(
        q(
          `typography.faces.${key}.files`,
          info.fromPointer ?? `/typography/fonts/${esc(key)}`,
          `No font file on disk for the ${key} face (${face.family}): ` +
            (missing.length ? `missing ${missing.join(', ')}. ` : 'none given. ') +
            'Add the file(s) under the brand folder or give typography.fonts.' +
            `${key}.files; the text fitter cannot measure without them.`,
          ['BR-FONTFILES', 'BR-METRICS'],
        ),
      );
    } else if (!face.metrics) {
      questions.push(
        q(
          `typography.faces.${key}.metrics`,
          info.fromPointer ?? `/typography/fonts/${esc(key)}`,
          `The ${key} face's first normal-style font file could not be measured; give a readable font file.`,
          ['BR-METRICS'],
        ),
      );
    }
  }

  const roles = spec.typography?.roles ?? {};
  const { sizeUnits, slideScale } = spec.typography ?? {};
  if (typeof slideScale !== 'number') {
    const unscaled = Object.keys(roles).filter(
      (k) => slideSize(roles[k].size, sizeUnits, slideScale).needs === true,
    );
    if (unscaled.length) {
      questions.push(
        q(
          'typography.slideScale',
          '/typography/slideScale',
          `typography.sizeUnits is ${sizeUnits ?? 'not given (legacy)'}, so text sizes ` +
            `(${unscaled.join(', ')}) are site px; by what factor do they scale to the 1920x1080 slide?`,
          ['BR-NORMALIZE', 'MD-TYPE'],
        ),
      );
    }
  }
  for (const role of REQUIRED_ROLES) {
    if (!roles[role]) {
      questions.push(
        q(
          `typography.roles.${role}`,
          `/typography/styles/${role}`,
          `What text style (font, size, weight, line height) does the brand use for ${role}?`,
          ['MD-TYPE'],
        ),
      );
    }
  }

  if (!spec.layout?.margins) {
    questions.push(
      q('layout.margins', '/layout/margins', 'What are the slide margins (top, right, bottom, left px)?', [
        'MD-GEOMETRY',
      ]),
    );
  }

  if (!spec.logos?.variants?.full) {
    const options = Object.entries(spec.logos?.variants ?? {}).map(([k, v]) => ({
      variant: k,
      file: v.file,
    }));
    questions.push(
      q(
        'logos.variants.full',
        '/brand/logos/full',
        'Which file is the full-colour logo?',
        ['MD-LOGO'],
        'blocking',
        options,
      ),
    );
  }

  if (!spec.layout?.footer) {
    questions.push(
      q(
        'layout.footer',
        '/layout/footer',
        'Does the brand show a footer (logo / text / page number), and where?',
        ['MD-FOOTER'],
        'optional',
      ),
    );
    warnings.push({
      pointer: '/layout/footer',
      message: 'no footer given: the footer rule hides the footer',
    });
  }

  if (!spec.backgrounds?.default) {
    questions.push(
      q(
        'backgrounds.default',
        '/backgrounds/default',
        'Which surface is the default slide background?',
        ['MD-PALETTE'],
        'optional',
        surfaces.map((s) => s.id).filter(Boolean),
      ),
    );
    warnings.push({
      pointer: '/backgrounds/default',
      message: 'no default background given: the palette uses surfaces[0]',
    });
  }

  return { questions, warnings };
}
