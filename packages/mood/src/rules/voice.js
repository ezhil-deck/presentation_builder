// MD-VOICE: titleCase, language (voice), rtl (locale).
import { collector, has, ptr } from '../util.js';

export const RULE = 'MD-VOICE';

export function rule(brandSpec) {
  const c = collector(RULE);
  const voice = {};
  for (const k of ['titleCase', 'language']) {
    if (has(brandSpec.voice, k)) {
      voice[k] = brandSpec.voice[k];
      c.prov(ptr('voice', k), [ptr('voice', k)]);
    }
  }
  if (typeof brandSpec.locale?.rtl === 'boolean') {
    voice.rtl = brandSpec.locale.rtl;
    c.prov(ptr('voice', 'rtl'), [ptr('locale', 'rtl')]);
  }
  c.res.patch = Object.keys(voice).length ? { voice } : {};
  return c.res;
}
