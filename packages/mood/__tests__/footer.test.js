import { rule } from '../src/rules/footer.js';
import { load, messages } from './fixtures.js';

describe('MD-FOOTER', () => {
  it('stripe: show, items in order, format, position, role, hideOn kinds', () => {
    const res = rule(load('stripe'));
    expect(res.patch.footer).toEqual({
      show: true,
      items: ['logo', 'pageNumber'],
      pageNumberFormat: '{n}',
      text: '',
      position: 'bottom-right',
      role: 'caption',
      hideOn: ['cover', 'cta', 'section'],
    });
    expect(res.warnings).toEqual([]);
  });

  it('text item when the text is non-empty; date when true; band copied', () => {
    const b = load('stripe');
    Object.assign(b.layout.footer, {
      text: 'Confidential',
      date: true,
      band: { show: true, height: 48, bg: 'card' },
    });
    const f = rule(b).patch.footer;
    expect(f.items).toEqual(['logo', 'text', 'pageNumber', 'date']);
    expect(f.band).toEqual({ show: true, height: 48, bg: 'card' });
  });

  it('no footer block -> show:false + warning', () => {
    const res = rule(load('minimal'));
    expect(res.patch.footer).toEqual({ show: false });
    expect(messages(res)).toEqual(['layout.footer not given: footer hidden']);
  });

  it('unknown hideOn id kept verbatim + warned', () => {
    const b = load('stripe');
    b.layout.footer.hideOn = ['title', 'bigPicture'];
    const res = rule(b);
    expect(res.patch.footer.hideOn).toEqual(['cover', 'bigPicture']);
    expect(messages(res)).toEqual([expect.stringContaining('"bigPicture"')]);
  });
});
