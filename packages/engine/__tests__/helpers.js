import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(__dirname, '..', '..', '..');
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

/** The stripe golden snapshot (in git; per-codepoint widths stripped, so measuring falls back to avgCharWidth). */
export const stripeMood = () => readJson('golden/expected/stripe/mood.json');
export const stripeBrandSpec = () => readJson('golden/expected/stripe/brand-spec.json');
export const showcaseMd = () => readFileSync(join(ROOT, 'golden/showcase/showcase.md'), 'utf8');

/** Synthetic metrics: every glyph 0.5 em, space 0.25 em, 'W' 1 em; ascent 0.9, descent -0.3. */
export const METRICS = { ascent: 0.9, descent: -0.3, avgCharWidth: 0.5, widths: { 32: 0.25, 87: 1 } };
export const font = (over = {}) => ({
  role: 'body',
  family: 'Test',
  size: 10,
  weight: 400,
  lineHeight: 1.5,
  letterSpacing: 0,
  case: 'none',
  color: '#000000',
  metrics: METRICS,
  ...over,
});

/** A minimal Mood around the synthetic metrics (enough for resolve / fitText). */
export function miniMood() {
  return {
    schema: 'mood/1',
    id: 'mini',
    brandId: 'mini',
    engineVersion: '0.0.0',
    palette: {
      surfaces: [
        {
          id: 'page',
          role: 'default',
          tone: 'light',
          bg: '#FFFFFF',
          text: '#111111',
          heading: '#000000',
          accent: '#FF0000',
        },
      ],
      rhythm: ['page'],
      semantic: { success: '#00AA00' },
      chart: { categorical: ['#111111', '#222222', '#333333'], muted: '#CCCCCC', highlight: '#FF0000' },
    },
    type: {
      faces: { body: { family: 'Test', metrics: METRICS } },
      roles: {
        body: {
          face: 'body',
          size: 20,
          weight: 400,
          lineHeight: 1.5,
          color: 'text',
          fit: { min: 14, step: 2 },
        },
        chartLabel: { face: 'body', size: 10, weight: 400, lineHeight: 1.5, color: 'text' },
        tableHeader: {
          face: 'body',
          size: 10,
          weight: 700,
          lineHeight: 1.5,
          color: 'heading',
          fit: { min: 8, step: 1 },
        },
        tableCell: {
          face: 'body',
          size: 10,
          weight: 400,
          lineHeight: 1.5,
          color: 'text',
          fit: { min: 8, step: 1 },
        },
      },
    },
    geometry: {
      canvas: { width: 1920, height: 1080 },
      margins: { top: 80, right: 100, bottom: 80, left: 100 },
      spacing: { sm: 4, md: 8, lg: 16 },
    },
    shape: { radius: { none: 0, sm: 4 } },
    logo: { variants: {} },
    footer: { show: false },
    provenance: {},
  };
}
