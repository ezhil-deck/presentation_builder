/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import ChecksTable from '../src/components/ChecksTable.jsx';
import ChecksTab from '../src/tabs/ChecksTab.jsx';
import { reportV1 } from './fixtures/report.js';

const DECK = JSON.parse(
  readFileSync(
    join(resolve(__dirname, '..', '..', '..'), 'golden', 'expected', 'stripe', 'deck.json'),
    'utf8',
  ),
);
const CHECKS = reportV1(DECK);

describe('ChecksTable', () => {
  it('lists one row per result and filters by status and by check', () => {
    render(<ChecksTable id="stripe" checks={CHECKS} />);
    expect(screen.getAllByTestId('check-row')).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'warn' } });
    expect(screen.getAllByTestId('check-row').map((r) => r.children[2].textContent)).toEqual([
      'margins',
      'variety',
    ]);
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'skip' } });
    expect(screen.queryAllByTestId('check-row')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Check filter'), { target: { value: 'contrast' } });
    expect(screen.getAllByTestId('check-row')).toHaveLength(1);
  });

  it('expands a result to its items, which link to their slide', () => {
    render(<ChecksTable id="stripe" checks={CHECKS} />);
    expect(screen.queryAllByTestId('check-item')).toHaveLength(0);
    fireEvent.click(screen.getAllByTestId('check-row').find((r) => r.children[2].textContent === 'contrast'));
    const items = screen.getAllByTestId('check-item');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a').getAttribute('href')).toBe('#/b/stripe/slides/4');
    expect(items[0].textContent).toContain('3.9:1');
  });
});

describe('ChecksTab', () => {
  it('shows the summary line for Report v1', () => {
    render(<ChecksTab id="stripe" report={{ checks: CHECKS }} />);
    expect(screen.getByTestId('checks-summary').textContent).toContain(
      '4 checks: 1 fail, 2 warn, 1 pass, 0 skip',
    );
  });

  it('says the checks were not run for a pre-v1 report', () => {
    render(<ChecksTab id="stripe" report={{ checks: { version: '0.0.0' } }} />);
    expect(screen.getByText(/checks not run for this build \(rebuild\)/)).toBeTruthy();
  });
});
