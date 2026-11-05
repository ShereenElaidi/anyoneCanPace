import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NoticeList, noticeDates } from './NoticeList';

describe('<NoticeList>', () => {
  it('shows each notice as text with where, when and a source link, plus when it was last checked', () => {
    render(
      <NoticeList
        lastChecked="2026-11-04"
        routeNames={{ 'sample-loop': 'Sample Loop' }}
        empty="None"
        notices={[
          {
            id: 'c',
            route: 'sample-loop',
            text: 'Commune Ouest closed.',
            fromKm: 1.1,
            toKm: 2.1,
            end: '2026-11-06',
            source: 'https://donnees.montreal.ca/dataset/info-travaux',
            kind: 'closure',
          },
          { id: 'g', route: 'global', text: 'Fountains are off.' },
        ]}
      />,
    );
    expect(screen.getByText('Commune Ouest closed.')).toBeTruthy();
    expect(screen.getByText(/Sample Loop, km 1\.1–2\.1 · until Nov 6/)).toBeTruthy();
    expect(screen.getByText('Possible closure')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Source' }).getAttribute('href')).toContain('donnees.montreal.ca');
    expect(screen.getByText('Fountains are off.')).toBeTruthy();
    expect(screen.getByText('Last checked Nov 4, 2026.')).toBeTruthy();
  });

  it('empty state still says when the list was last checked', () => {
    render(<NoticeList notices={[]} lastChecked="2026-11-04" empty="No advisories right now." />);
    expect(screen.getByText('No advisories right now.')).toBeTruthy();
    expect(screen.getByText('Last checked Nov 4, 2026.')).toBeTruthy();
  });

  it('date wording', () => {
    expect(noticeDates({ id: 'a', route: 'global', text: '', start: '2026-11-01', end: '2026-11-30' })).toBe('Nov 1 – Nov 30');
    expect(noticeDates({ id: 'a', route: 'global', text: '', start: '2026-11-01' })).toBe('from Nov 1');
    expect(noticeDates({ id: 'a', route: 'global', text: '' })).toBe('');
  });
});
