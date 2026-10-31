import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readBrand, validateBrandSpec } from '../src/index.js';
import { GOLDEN } from './helpers.js';

/**
 * Golden brands that read into a valid BrandSpec but still carry blocking questions, each with its reason
 * (2026-10-30, after the P1 reconciliation D1-D13). The rules are not weakened for them: the test checks that the
 * blocking questions are EXACTLY the recorded ones, so a new question is caught and an answered one must leave the list.
 *
 *   hdfc-2: faces `data` (Lato) and `tagline` (PT Serif) are `source: google` with no prefetched file under
 *           assets/fonts/google/ (only Montserrat + Roboto are there); BR-FONTFILES / D6: a face without a font file
 *           is a blocking question (the fitter cannot measure it). Answer: add the files, then re-read.
 */
const KNOWN_BLOCKING = {
  'hdfc-2': ['typography.faces.data.files', 'typography.faces.tagline.files'],
};

const brands = existsSync(GOLDEN)
  ? readdirSync(GOLDEN)
      .filter((id) => statSync(join(GOLDEN, id)).isDirectory() && existsSync(join(GOLDEN, id, `${id}.json`)))
      .sort()
  : [];

describe('golden brands -> BrandSpec', () => {
  if (brands.length === 0) {
    it.skip('no golden brand inputs present (golden/brands is git-ignored)', () => {});
    return;
  }

  it.each(brands)(
    '%s reads into a schema-valid BrandSpec with only its recorded blocking questions',
    (id) => {
      const spec = readBrand(join(GOLDEN, id));
      expect(validateBrandSpec(spec)).toEqual([]);
      expect(spec.id).toBe(id);
      const blocking = spec.questions
        .filter((q) => q.severity === 'blocking')
        .map((q) => q.id)
        .sort();
      expect(blocking).toEqual([...(KNOWN_BLOCKING[id] ?? [])].sort());
    },
  );
});
