/** @jest-environment jsdom */
import { fireEvent, render, screen, within } from '@testing-library/react';
import BrandsTable, { brandCounts } from '../src/components/BrandsTable.jsx';

const BRANDS = [
  {
    id: 'stripe',
    name: 'Stripe',
    out: true,
    input: true,
    stale: false,
    report: { checks: 14, pass: 10, warn: 3, fail: 1, skip: 0 },
    counts: { slides: 24, overflow: 0 },
    questions: { blocking: 0, optional: 1 },
    signedOff: true,
    signedOffDate: '2026-10-31T09:15:00.000Z',
    reviewStale: false,
  },
  {
    id: 'hdfc-2',
    name: 'HDFC securities',
    out: true,
    input: true,
    stale: true,
    report: null,
    counts: { slides: 24, overflow: 2 },
    questions: { blocking: 2, optional: 5 },
    signedOff: false,
  },
  { id: 'newbrand', out: false, input: true, stale: false, report: null, counts: null, signedOff: false },
];

describe('BrandsTable', () => {
  it('renders one row per brand with build state, counts and sign-off', () => {
    render(<BrandsTable brands={BRANDS} onBuild={() => {}} />);
    const rows = screen.getAllByTestId('brand-row');
    expect(rows).toHaveLength(3);
    const [stripe, hdfc, fresh] = rows.map((r) => within(r));
    expect(stripe.getByText('built')).toBeTruthy();
    expect(stripe.getByText('yes')).toBeTruthy();
    expect(stripe.getByText('24')).toBeTruthy();
    expect(stripe.getByText('3')).toBeTruthy(); // warn
    expect(hdfc.getByText('stale')).toBeTruthy();
    expect(hdfc.getAllByText('2', { selector: 'td' })).toHaveLength(2); // overflow + blocking questions
    expect(hdfc.getByText('no checks')).toBeTruthy();
    expect(fresh.getByText('not built')).toBeTruthy();
    expect(screen.getByTestId('brand-counts').textContent).toBe(
      '3 brands · 2 built · 1 stale · 1 with failing checks · 1 signed off',
    );
  });

  it('counts brands and sends build requests', () => {
    expect(brandCounts(BRANDS)).toEqual({ brands: 3, built: 2, stale: 1, signedOff: 1, fail: 1 });
    const onBuild = jest.fn();
    render(<BrandsTable brands={BRANDS} onBuild={onBuild} />);
    const row = within(screen.getAllByTestId('brand-row')[1]);
    fireEvent.click(row.getByText('Build + PNG'));
    fireEvent.click(row.getByText('Build'));
    expect(onBuild.mock.calls).toEqual([
      ['hdfc-2', true],
      ['hdfc-2', false],
    ]);
  });
});
