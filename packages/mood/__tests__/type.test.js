import { CHAINS, rule } from '../src/rules/type.js';
import { load, messages, readJson } from './fixtures.js';

describe('MD-TYPE on stripe', () => {
  const res = rule(load('stripe'));
  const { type } = res.patch;

  it('faces copied (family, files, fallback, variable)', () => {
    expect(type.faces.heading).toEqual({
      family: 'Sohne',
      files: [{ file: 'assets/fonts/Sohne-var.woff2', format: 'woff2', weight: '1 1000', style: 'normal' }],
      fallback: 'Helvetica Neue, Arial, sans-serif',
      variable: true,
    });
    expect(type.faces.mono.variable).toBe(false);
  });

  it('role chains pick the first brand role that exists; provenance names it', () => {
    expect(type.roles.display).toMatchObject({
      face: 'heading',
      size: 80,
      weight: 300,
      lineHeight: 1.15,
      letterSpacing: -0.02,
      case: 'none',
    });
    expect(res.provenance['/type/roles/quoteAttribution'].from).toEqual(['/typography/roles/personRole']);
    expect(res.provenance['/type/roles/quoteAttribution'].note).toMatch(/brand role "personRole"/);
    expect(res.provenance['/type/roles/statLabel'].from).toEqual(['/typography/roles/caption']);
    expect(res.provenance['/type/roles/tableHeader'].from).toEqual(['/typography/roles/caption']);
    expect(res.provenance['/type/roles/tableCell'].from).toEqual(['/typography/roles/bodySmall']);
    expect(res.provenance['/type/roles/footer'].from).toEqual([
      '/typography/roles/caption',
      '/layout/footer/style',
    ]);
    expect(type.roles.bullet.size).toBe(22.4); // body, canvas px (16 x slideScale 1.4, D3)
    expect(Object.keys(type.roles).sort()).toEqual(
      [
        'body',
        'bodySmall',
        'bullet',
        'button',
        'caption',
        'chartLabel',
        'display',
        'eyebrow',
        'footer',
        'h1',
        'h2',
        'h3',
        'quote',
        'quoteAttribution',
        'stat',
        'statLabel',
        'tableCell',
        'tableHeader',
        // G4: every other brand style under its own name
        'displayAccent',
        'h1Accent',
        'link',
        'personName',
        'personRole',
        'statFact',
        'statFactLabel',
      ].sort(),
    );
  });

  it('colour: the brand style own colour when given (D4), else the role meaning', () => {
    // h1 and button give no colour: the meaning table
    expect(type.roles.h1.color).toBe('heading');
    expect(type.roles.button.color).toBe('text');
    expect(res.provenance['/type/roles/h1/color'].from).toEqual([]);
    expect(res.provenance['/type/roles/h1/color'].note).toMatch(/gives no colour: meaning/);
    // body gives textMuted (Stripe's slate body copy): copied, not overridden by the meaning (text)
    expect(type.roles.body.color).toBe('textMuted');
    expect(res.provenance['/type/roles/body/color'].from).toEqual(['/typography/roles/body/color']);
    expect(type.roles.stat.color).toBe('heading');
    expect(type.roles.caption.color).toBe('textMuted');
    expect(type.roles.footer.color).toBe('textMuted');
  });

  it('D4: a literal hex colour on the brand style is kept literal', () => {
    const b = load('stripe');
    b.typography.roles.quote.color = '#635BFF';
    expect(rule(b).patch.type.roles.quote.color).toBe('#635BFF');
  });

  it("D4 negative: no style colour -> the meaning, never another role's colour", () => {
    const b = load('stripe');
    delete b.typography.roles.body.color;
    const t = rule(b).patch.type;
    expect(t.roles.body.color).toBe('text');
    expect(t.roles.bullet.color).toBe('text');
  });

  it('fit.min: headings step to the next smaller heading; body-like to minBodySize', () => {
    expect(type.roles.display.fit).toEqual({ min: 56, step: 2 });
    expect(type.roles.h1.fit).toEqual({ min: 36.4, step: 2 });
    expect(type.roles.h2.fit).toEqual({ min: 22.4, step: 2 });
    expect(type.roles.h3.fit).toEqual({ min: 22.4, step: 2 }); // next = body (22.4)
    expect(type.roles.body.fit).toEqual({ min: 19.6, step: 2 });
    expect(res.provenance['/type/roles/display/fit'].from).toEqual(['/typography/roles/h1/size']);
  });

  it('a role below minBodySize keeps its own size as min and is warned once', () => {
    expect(type.roles.caption.fit.min).toBe(16.8);
    expect(messages(res).filter((m) => /below typography.limits.minBodySize/.test(m))).toHaveLength(1);
  });

  it('align, bullets (char read as glyph), limits', () => {
    expect(type.align).toEqual({ title: 'left', body: 'left' });
    expect(type.bullets).toMatchObject({ glyph: '•', color: 'accent', indent: 28 });
    expect(type.bullets.char).toBeUndefined();
    expect(type.limits.minBodySize).toBe(19.6);
    expect(res.questions).toEqual([]);
  });
});

describe('MD-TYPE negatives', () => {
  it('missing required role -> blocking question with neededBy', () => {
    const b = load('stripe');
    delete b.typography.roles.h2;
    const res = rule(b);
    expect(res.patch.type.roles.h2).toBeUndefined();
    expect(res.questions).toContainEqual(
      expect.objectContaining({
        id: 'typography.roles.h2',
        pointer: '/typography/styles/h2', // D5: the input pointer where the answer goes
        neededBy: ['MD-TYPE'],
        severity: 'blocking',
      }),
    );
    expect(res.patch.type.roles.h1.fit.min).toBe(22.4); // next smaller resolved heading is h3
  });

  it('h3 falls back to cardTitle', () => {
    const b = load('minimal');
    b.typography.roles.cardTitle = b.typography.roles.h3;
    delete b.typography.roles.h3;
    const res = rule(b);
    expect(res.patch.type.roles.h3.size).toBe(24);
    expect(res.provenance['/type/roles/h3'].from).toEqual(['/typography/roles/cardTitle']);
  });

  it('minimal: optional chains with no hit -> optional questions; no minBodySize -> optional question, min = size', () => {
    const res = rule(load('minimal'));
    const opt = res.questions.filter((q) => q.severity === 'optional').map((q) => q.id);
    expect(opt).toEqual(
      expect.arrayContaining([
        'typography.roles.bodySmall',
        'typography.roles.eyebrow',
        'typography.roles.stat',
        'typography.roles.quote',
        'typography.roles.button',
        'typography.roles.tableCell',
        'typography.limits.minBodySize',
      ]),
    );
    expect(res.questions.filter((q) => q.severity === 'blocking')).toEqual([]);
    expect(res.patch.type.roles.body.fit).toEqual({ min: 20, step: 2 });
    expect(res.patch.type.roles.statLabel.size).toBe(14); // statLabel <- caption
    expect(res.patch.type.faces.heading.metrics.unitsPerEm).toBe(1000);
  });

  it('brand role without weight -> question, role absent', () => {
    const b = load('minimal');
    delete b.typography.roles.caption.weight;
    const res = rule(b);
    expect(res.patch.type.roles.caption).toBeUndefined();
    expect(res.questions).toContainEqual(
      expect.objectContaining({ pointer: '/typography/styles/caption/weight', severity: 'blocking' }),
    );
  });

  it('heading smaller than the next heading -> min = own size + warning', () => {
    const b = load('minimal');
    b.typography.roles.h2.size = 20;
    b.typography.roles.h3.size = 24;
    const res = rule(b);
    expect(res.patch.type.roles.h2.fit.min).toBe(20);
    expect(messages(res)).toContainEqual(
      expect.stringMatching(/"h2" \(20\) is smaller than the next heading "h3"/),
    );
  });
});

describe('G4: every brand style is a Mood role under its own name', () => {
  const golden = (id) => readJson('..', '..', '..', 'golden', 'expected', id, 'brand-spec.json');

  it.each([
    ['hdfc-2', ['label', 'closingTitle', 'footnote', 'factValue', 'bodyLarge']],
    ['notion', ['tableHead', 'tableGroup', 'statStrip']],
  ])('%s: %j present with the brand values', (id, names) => {
    const b = golden(id);
    const res = rule(b);
    for (const n of names) {
      const br = b.typography.roles[n];
      expect(res.patch.type.roles[n]).toMatchObject({ face: br.face, size: br.size, weight: br.weight });
      expect(res.provenance[`/type/roles/${n}`]).toMatchObject({ from: [`/typography/roles/${n}`] });
      expect(res.patch.type.roles[n].fit.min).toBeGreaterThan(0);
    }
  });

  it('colour: the style own colour when given, else text (noted; no meaning from the name)', () => {
    const b = load('stripe');
    b.typography.roles.link.color = 'accent';
    delete b.typography.roles.personName.color;
    const res = rule(b);
    expect(res.patch.type.roles.link.color).toBe('accent');
    expect(res.patch.type.roles.personName.color).toBe('text');
    expect(res.provenance['/type/roles/personName/color'].note).toMatch(/gives no colour: surface role text/);
  });

  it('fit.min by the same rule as other non-heading roles', () => {
    const res = rule(load('stripe'));
    const { roles } = res.patch.type;
    expect(roles.statFact.fit).toEqual(
      roles.statFact.size < 19.6 ? { min: roles.statFact.size, step: 2 } : { min: 19.6, step: 2 },
    );
  });

  it('canonical roles unchanged: the same as from a brand with only the chain styles', () => {
    const b = load('stripe');
    const all = rule(b).patch.type.roles;
    const chainNames = new Set(
      Object.values(CHAINS)
        .flat()
        .filter((n) => typeof n === 'string'),
    );
    for (const n of Object.keys(b.typography.roles))
      if (!chainNames.has(n) && n !== b.layout.footer.style) delete b.typography.roles[n];
    const only = rule(b).patch.type.roles;
    for (const r of Object.keys(CHAINS)) expect(all[r]).toEqual(only[r]);
  });

  it('negatives: a style missing weight is warned and left out; a style named like a canonical role resolved elsewhere is not overwritten', () => {
    const b = load('stripe');
    delete b.typography.roles.link.weight;
    b.typography.roles.tableHeader = { ...b.typography.roles.h1 };
    b.typography.roles.tableHead = { ...b.typography.roles.caption };
    const res = rule(b);
    expect(res.patch.type.roles.link).toBeUndefined();
    expect(messages(res)).toContainEqual(expect.stringMatching(/brand style "link" gives no weight/));
    expect(res.patch.type.roles.tableHeader.size).toBe(b.typography.roles.tableHead.size);
    expect(messages(res)).toContainEqual(
      expect.stringMatching(/"tableHeader" has the name of the canonical role/),
    );
  });
});

describe('G8: role sizes must be px', () => {
  const golden = (id) => readJson('..', '..', '..', 'golden', 'expected', id, 'brand-spec.json');
  const g8 = (res) => messages(res).filter((m) => /\(G8\)/.test(m));

  it('notion: displayHighlight (size 1.35, a multiplier) is not a role; one warning names it', () => {
    const b = golden('notion');
    expect(b.typography.roles.displayHighlight.size).toBe(1.35);
    const res = rule(b);
    expect(res.patch.type.roles.displayHighlight).toBeUndefined();
    expect(res.provenance['/type/roles/displayHighlight']).toBeUndefined();
    expect(g8(res)).toEqual([expect.stringContaining('"displayHighlight"')]);
    expect(res.warnings).toContainEqual(
      expect.objectContaining({ pointer: '/typography/roles/displayHighlight/size' }),
    );
    // every registered role is px
    for (const r of Object.values(res.patch.type.roles)) expect(r.size).toBeGreaterThanOrEqual(4);
  });

  it('a multiplier style is skipped by a chain too (h3 -> cardTitle), still one warning', () => {
    const b = load('stripe');
    b.typography.roles.cardTitle = { ...b.typography.roles.h2, size: 30 };
    b.typography.roles.h3 = { ...b.typography.roles.h3, size: 1.2 };
    const res = rule(b);
    expect(res.patch.type.roles.h3.size).toBe(30);
    expect(res.provenance['/type/roles/h3'].from).toEqual(['/typography/roles/cardTitle']);
    expect(g8(res)).toEqual([expect.stringContaining('"h3"')]);
  });

  it('negatives: size 4 and above register; no G8 warning on the other golden brands', () => {
    const b = golden('notion');
    b.typography.roles.displayHighlight.size = 4;
    const res = rule(b);
    expect(res.patch.type.roles.displayHighlight.size).toBe(4);
    expect(g8(res)).toEqual([]);
    for (const id of ['stripe', 'hdfc-2', 'akgmedia']) expect(g8(rule(golden(id)))).toEqual([]);
  });
});
