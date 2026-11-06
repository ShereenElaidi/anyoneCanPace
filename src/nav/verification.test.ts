import { describe, expect, it } from 'vitest';
import manifestJson from '../data/routes/manifest.json';
import type { RouteData, RouteManifest } from './types';
import { allRoutes } from './testing/replay';
import { validateVerification, verificationText } from './verification';

const TODAY = '2026-11-05';
const manifest = manifestJson as unknown as RouteManifest;

describe('route verification status', () => {
  it('every shipped route has a valid verification record, matching the manifest', () => {
    for (const { data } of allRoutes()) {
      expect(validateVerification(data.verification, TODAY), data.id).toEqual([]);
      expect(manifest.routes.find((r) => r.id === data.id)?.verification).toBe(data.verification.status);
    }
  });

  it('no route claims a review the repository has no record of', () => {
    // routes/review/*.md are automated suggestions only. A route listed here was signed off by a
    // person: record reviewer and date in the route file and update this list.
    const reviewed: Record<string, true> = {
      'sample-loop': true, // field-verified on a crew run, 2026-11-05
      'canal-test': true, // field-verified on a crew run, 2026-11-05
      'verdun-with-this-test': true, // desk-reviewed by SE, 2026-11-05
    };
    for (const { data } of allRoutes()) {
      if (!reviewed[data.id]) expect((data as RouteData).verification.status, data.id).toBe('unverified');
    }
  });

  it('a reviewed status needs who and when; dates must be real and not in the future', () => {
    expect(validateVerification({ status: 'unverified' }, TODAY)).toEqual([]);
    expect(validateVerification({ status: 'desk-reviewed' }, TODAY)).toEqual([
      'desk-reviewed needs a reviewer',
      'desk-reviewed needs a date',
    ]);
    expect(validateVerification({ status: 'field-verified', reviewer: 'S.', date: '2026-11-01' }, TODAY)).toEqual([]);
    expect(validateVerification({ status: 'field-verified', reviewer: 'S.', date: '2027-01-01' }, TODAY)).toEqual([
      'date 2027-01-01 is in the future',
    ]);
    expect(validateVerification({ status: 'approved' }, TODAY)[0]).toMatch(/unknown status/);
    expect(validateVerification(undefined, TODAY)).toEqual(['verification is missing']);
    expect(validateVerification({ status: 'unverified', by: 'x' }, TODAY)).toEqual(['unknown field "by"']);
  });

  it('the wording never implies a check that did not happen', () => {
    expect(verificationText({ status: 'unverified' }).detail).toMatch(/haven’t been checked by a person or on the ground/);
    expect(verificationText({ status: 'desk-reviewed', reviewer: 'A', date: '2026-11-01' }).detail).toMatch(
      /nobody has walked it/,
    );
    expect(verificationText(undefined).label).toBe('Unverified');
  });
});
