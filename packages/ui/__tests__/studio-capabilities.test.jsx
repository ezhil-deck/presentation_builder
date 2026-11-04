/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BrandPanel, { CapabilitiesGroup } from '../src/studio/BrandPanel.jsx';
import {
  capabilityFamily,
  claimCounts,
  claimFacts,
  claimStatus,
  groupCapabilities,
  unverifiedFields,
} from '../src/studio/lib.js';

const SPEC = {
  id: 'demo',
  capabilities: [
    {
      key: 'device:band',
      term: 'E2:device',
      from: ['/decor/elements/0'],
      files: [],
      measured: {},
      status: 'given',
      why: 'named',
    },
    { key: 'photo-area', term: 'E3:zone', from: [], files: [], measured: {}, status: 'given', why: 'p' },
    {
      key: 'colour-field:ink',
      term: 'E2:background',
      from: ['/surfaces/1'],
      files: [],
      measured: {},
      status: 'offered',
      why: 'inferred',
    },
    { key: 'logo:full', term: 'E2:brand-logo', from: [], files: [], measured: {}, status: 'given', why: 'l' },
    { key: 'angle', term: null, from: [], files: [], measured: {}, status: 'given', why: 'a' },
  ],
  claims: [
    {
      id: 'photoArea.title',
      pointer: '/brandLayouts/0/composition/photoArea',
      claim: { device: 'band' },
      measured: { edgeMaxDistancePctW: 3.64, vertexInsidePx: 0 },
      pass: false,
      why: 'the edge runs 3.64 % W off',
    },
    {
      id: 'sample.0',
      pointer: '/imagery/samples/0',
      claim: { w: 60, h: 40 },
      measured: { width: 60, height: 40 },
      pass: true,
      why: 'ok',
    },
    {
      id: 'backgroundSurface.hero',
      pointer: '/backgrounds/variants/hero/surface',
      claim: {},
      measured: {},
      pass: null,
      why: 'webp',
    },
  ],
  provenance: {
    '/surfaces/1/bg': { source: 'given', inputProvenance: { inferred: true } },
    '/surfaces/1/text': { source: 'given', inputProvenance: { inferred: true, verifiedAt: '2026-11-04' } },
    '/colors/primary': { source: 'given' },
  },
};

describe('studio lib: capabilities helpers', () => {
  it('groups capabilities by family in the panel order, empty families left out', () => {
    expect(groupCapabilities(SPEC.capabilities).map((g) => [g.family, g.items.map((c) => c.key)])).toEqual([
      ['devices', ['device:band']],
      ['photo-areas', ['photo-area']],
      ['colour-fields', ['colour-field:ink']],
      ['logos', ['logo:full']],
      ['shape', ['angle']],
    ]);
    expect(capabilityFamily('weight-contrast')).toBe('type');
    expect(capabilityFamily('mask:slant')).toBe('imagery');
    expect(groupCapabilities(undefined)).toEqual([]);
  });

  it('claim counts, status and facts; unverified = inferred without verifiedAt only', () => {
    expect(claimCounts(SPEC.claims)).toEqual({ pass: 1, fail: 1, skip: 1 });
    expect(SPEC.claims.map(claimStatus)).toEqual(['fail', 'pass', 'skip']);
    expect(claimFacts({ device: 'band', edge: 3.64 })).toBe('edge 3.64 · device band');
    expect(unverifiedFields(SPEC)).toEqual(['/surfaces/1/bg']);
    expect(unverifiedFields({})).toEqual([]);
  });
});

describe('CapabilitiesGroup', () => {
  it('is collapsed by default and loads nothing until opened', () => {
    const load = jest.fn();
    render(<CapabilitiesGroup brandId="demo" load={load} />);
    expect(screen.queryAllByTestId('capability-row')).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('opened with a BrandSpec: rows by family with given / offered, claims with claimed vs measured, unverified fields', () => {
    render(<CapabilitiesGroup brandId="demo" brandSpec={SPEC} />);
    fireEvent.click(screen.getByRole('button', { name: /capabilities/i }));
    expect(screen.getAllByTestId('capability-family').map((n) => n.dataset.family)).toEqual([
      'devices',
      'photo-areas',
      'colour-fields',
      'logos',
      'shape',
    ]);
    const rows = screen.getAllByTestId('capability-row');
    expect(rows).toHaveLength(5);
    const ink = rows.find((r) => r.textContent.includes('colour-field:ink'));
    expect(within(ink).getByText('offered')).toBeTruthy();
    expect(within(rows[0]).getByText('given')).toBeTruthy();
    expect(within(rows[0]).getByText('E2:device')).toBeTruthy();
    expect(within(rows.find((r) => r.textContent.includes('angle'))).getByText('rule')).toBeTruthy(); // term null
    const claims = screen.getAllByTestId('claim-row');
    expect(claims.map((c) => c.dataset.status)).toEqual(['fail', 'pass', 'skip']);
    expect(claims[0].textContent).toMatch(/claimed device band/);
    expect(claims[0].textContent).toMatch(/measured edgeMaxDistancePctW 3.64/);
    expect(within(screen.getByTestId('unverified-list')).getByText('/surfaces/1/bg')).toBeTruthy();
    expect(
      within(screen.getByTestId('claim-counts')).getByText('1', { selector: '.bg-red-50' }),
    ).toBeTruthy();
  });

  it('reads out/<id>/brand-spec.json through the API when opened (once)', async () => {
    const load = jest.fn(async () => SPEC);
    render(<CapabilitiesGroup brandId="demo" load={load} />);
    fireEvent.click(screen.getByRole('button', { name: /capabilities/i }));
    await waitFor(() => expect(screen.getAllByTestId('capability-row')).toHaveLength(5));
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('demo', 'brand-spec');
  });

  it('says how to measure when there is no brand-spec or it predates the record (negative)', async () => {
    render(<CapabilitiesGroup brandId="demo" load={async () => null} />);
    fireEvent.click(screen.getByRole('button', { name: /capabilities/i }));
    await waitFor(() => expect(screen.getByTestId('capabilities-missing')).toBeTruthy());
    expect(screen.queryAllByTestId('capability-row')).toHaveLength(0);
  });

  it('BrandPanel shows the group under Brand', () => {
    render(
      <BrandPanel
        brand={{ id: 'demo', name: 'Demo', surfaces: [] }}
        deck={{ slides: [] }}
        index={0}
        checks={null}
        overrides={{}}
        busy={false}
        onOverride={() => {}}
        onReset={() => {}}
        onSelect={() => {}}
        onHoverItem={() => {}}
        brandSpec={SPEC}
      />,
    );
    expect(screen.getByTestId('capabilities-group')).toBeTruthy();
  });
});
