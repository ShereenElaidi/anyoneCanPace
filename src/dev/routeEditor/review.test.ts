import { describe, expect, it } from 'vitest';
import { validateVerification } from '../../nav/verification';
import { validateAdvisories } from './edits';
import { advisoryToForm, emptyAdvisory, formToAdvisory, mapCoverage, reviewedListLine, reviewRecord } from './review';

describe('review records', () => {
  it('builds a valid record for each status', () => {
    const desk = reviewRecord('desk-reviewed', '  Sam ', '2026-11-05', ' ');
    expect(desk).toEqual({ status: 'desk-reviewed', reviewer: 'Sam', date: '2026-11-05' });
    expect(validateVerification(desk, '2026-11-05')).toEqual([]);
    expect(reviewRecord('unverified', 'Sam', '2026-11-05', 'Detour since the works')).toEqual({
      status: 'unverified',
      notes: 'Detour since the works',
    });
  });

  it('gives the line for the reviewed list in verification.test.ts', () => {
    expect(reviewedListLine('pi-day', { status: 'field-verified', reviewer: 'Crew run', date: '2026-11-06' })).toBe(
      "'pi-day': true, // field-verified by Crew run, 2026-11-06",
    );
  });
});

describe('advisory form', () => {
  it('round-trips an advisory and leaves empty fields out', () => {
    const a = { text: 'Path closed', fromKm: 2.5, toKm: 3, start: '2026-11-01', end: '2026-12-01', source: 'https://montreal.ca' };
    expect(formToAdvisory(advisoryToForm(a))).toEqual(a);
    expect(formToAdvisory({ ...emptyAdvisory, text: ' Ice on the bridge ' })).toEqual({ text: 'Ice on the bridge' });
  });

  it('accepts a comma as the decimal mark, and lets validation report a bad km', () => {
    expect(formToAdvisory({ ...emptyAdvisory, text: 'x', fromKm: '1,5' }).fromKm).toBe(1.5);
    const bad = formToAdvisory({ ...emptyAdvisory, text: 'x', fromKm: 'two' });
    expect(validateAdvisories([bad], 'r', 6000, '2026-11-05')[0]).toMatch(/fromKm must be a number/);
  });
});

describe('mapCoverage', () => {
  const map = { minLon: -73.7, minLat: 45.4, maxLon: -73.5, maxLat: 45.6 };
  it('tells inside, partly and outside apart', () => {
    expect(mapCoverage([-73.6, 45.45, -73.55, 45.5], map)).toBe('inside');
    expect(mapCoverage([-73.75, 45.45, -73.6, 45.5], map)).toBe('partly');
    expect(mapCoverage([-73.3, 45.45, -73.2, 45.5], map)).toBe('outside');
  });
});
