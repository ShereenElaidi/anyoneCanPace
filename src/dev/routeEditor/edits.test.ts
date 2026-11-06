import { describe, expect, it } from 'vitest';
import sampleLoop from '../../data/routes/sample-loop.json';
import type { RouteData } from '../../nav/types';
import { ROUTE_TAGS } from '../../sixk/describe';
import { applyEdits, slugify, validateAdvisories, validateNewRouteId, validateTurns } from './edits';

const TODAY = '2026-11-05';
// A real route file, as reviewed and as unchecked, so these tests don't depend on which routes are reviewed today.
const route = sampleLoop as unknown as RouteData;
const reviewed: RouteData = { ...route, verification: { status: 'field-verified', reviewer: 'Crew run', date: '2026-11-05' } };
const unverified: RouteData = { ...reviewed, verification: { status: 'unverified' } };
const opts = { tags: ROUTE_TAGS, today: TODAY };

describe('slugify and new route ids', () => {
  it('makes a lowercase hyphenated id from a name', () => {
    expect(slugify("Lachine Canal à l'aube")).toBe('lachine-canal-a-l-aube');
    expect(slugify('  Pi Day 3.14!  ')).toBe('pi-day-3-14');
    expect(slugify('Montréal — Old Port & Back')).toBe('montreal-old-port-back');
    expect(slugify('x'.repeat(50))).toHaveLength(40);
  });

  it('rejects empty, malformed, reserved or taken ids', () => {
    expect(validateNewRouteId('canal-dawn', ['sample-loop'])).toEqual([]);
    expect(validateNewRouteId('', [])[0]).toMatch(/needs an id/);
    expect(validateNewRouteId('Canal', [])[0]).toMatch(/lowercase/);
    expect(validateNewRouteId('manifest', [])[0]).toMatch(/reserved/);
    expect(validateNewRouteId('sample-loop', ['sample-loop'])[0]).toMatch(/already/);
  });
});

describe('validateTurns', () => {
  it('accepts the shipped turns', () => {
    expect(validateTurns(reviewed.turns, reviewed.stats.distanceM)).toEqual([]);
    expect(validateTurns(unverified.turns, unverified.stats.distanceM)).toEqual([]);
  });

  it('rejects turns out of order, off the route, or with unknown directions or fields', () => {
    const ok = { atM: 100, dir: 'left', street: 'Rue Notre-Dame' };
    expect(validateTurns([ok, { ...ok, atM: 50 }], 1000)).toEqual(['turn 2 is not after turn 1 along the route']);
    expect(validateTurns([{ ...ok, atM: 1001 }], 1000)[0]).toMatch(/between 0 and 1000/);
    expect(validateTurns([{ ...ok, dir: 'west' }], 1000)[0]).toMatch(/unknown direction "west"/);
    expect(validateTurns([{ ...ok, note: '' }], 1000)[0]).toMatch(/note/);
    expect(validateTurns([{ ...ok, street: ' Rue X' }], 1000)[0]).toMatch(/street/);
    expect(validateTurns([{ ...ok, lat: 45 }], 1000)[0]).toMatch(/unknown field "lat"/);
  });
});

describe('validateAdvisories', () => {
  it('uses the advisory rules plus km ranges inside the route', () => {
    expect(validateAdvisories([{ text: 'Works on the path', fromKm: 1, toKm: 2, start: '2026-11-01' }], 'x', 6000, TODAY)).toEqual([]);
    expect(validateAdvisories([{ text: '' }], 'x', 6000, TODAY)).toEqual(['advisory 1: text is missing.']);
    expect(validateAdvisories([{ text: 'a', fromKm: 7 }], 'x', 6000, TODAY)[0]).toMatch(/past the end/);
    expect(validateAdvisories([{ text: 'a', fromKm: 2, toKm: 1 }], 'x', 6000, TODAY)[0]).toMatch(/before fromKm/);
    expect(validateAdvisories([{ text: 'a', colour: 'red' }], 'x', 6000, TODAY)[0]).toMatch(/unknown field "colour"/);
  });
});

describe('applyEdits', () => {
  it('saving the file unchanged gives back the same file, in the same key order', () => {
    const { data, errors, verificationReset } = applyEdits(reviewed, {}, opts);
    expect(errors).toEqual([]);
    expect(JSON.stringify(data)).toBe(JSON.stringify(reviewed));
    expect(verificationReset).toBe(false);
  });

  it('merges details without touching the review', () => {
    const { data, errors } = applyEdits(
      reviewed,
      { name: 'Old Port Loop', description: 'Flat and shaded.', tags: ['waterfront', 'good-first-route'], notes: ['Water at km 3.'] },
      opts,
    );
    expect(errors).toEqual([]);
    expect(data).toMatchObject({ name: 'Old Port Loop', description: 'Flat and shaded.', tags: ['waterfront', 'good-first-route'] });
    expect(data!.verification).toEqual(reviewed.verification);
    // description sits after place, where the build writes it.
    const keys = Object.keys(data!);
    expect(keys.indexOf('description')).toBe(keys.indexOf('place') + 1);
  });

  it('empty place, description and tags remove the field', () => {
    const { data } = applyEdits({ ...reviewed, description: 'x' }, { place: '', description: '', tags: [] }, opts);
    expect(data).not.toHaveProperty('place');
    expect(data).not.toHaveProperty('description');
    expect(data).not.toHaveProperty('tags');
  });

  it('accepts a tag that was just added to the tag list', () => {
    const tags = { ...ROUTE_TAGS, 'hill-repeats': { label: 'Hill repeats', tone: 'blue' as const } };
    expect(applyEdits(reviewed, { tags: ['hill-repeats'] }, opts).errors).toEqual(['unknown tag "hill-repeats"']);
    expect(applyEdits(reviewed, { tags: ['hill-repeats'] }, { tags, today: TODAY }).errors).toEqual([]);
  });

  it('changing a turn resets a reviewed route to unverified', () => {
    const turns = reviewed.turns.map((t, i) => (i === 0 ? { ...t, note: 'Busy crossing' } : t));
    const { data, verificationReset } = applyEdits(reviewed, { turns }, opts);
    expect(verificationReset).toBe(true);
    expect(data!.verification.status).toBe('unverified');
    expect(data!.verification.notes).toMatch(/Was field-verified/);
  });

  it('changing the start street resets it too; an unverified route just stays unverified', () => {
    expect(applyEdits(reviewed, { startStreet: 'Rue de la Commune' }, opts).verificationReset).toBe(true);
    const { data, verificationReset } = applyEdits(unverified, { startStreet: 'Rue de la Commune' }, opts);
    expect(verificationReset).toBe(false);
    expect(data!.verification).toEqual(unverified.verification);
  });

  it('refuses to mark a route reviewed in the same save as a turn change', () => {
    const turns = unverified.turns.slice(1);
    const verification = { status: 'desk-reviewed', reviewer: 'Shereen', date: TODAY };
    expect(applyEdits(unverified, { turns, verification }, opts).errors).toEqual([
      'save the changed turns first, then mark the route reviewed: a review has to be of the saved turns',
    ]);
    expect(applyEdits(unverified, { verification }, opts).data!.verification).toEqual(verification);
  });

  it('checks the review record', () => {
    expect(applyEdits(unverified, { verification: { status: 'desk-reviewed' } }, opts).errors).toEqual([
      'desk-reviewed needs a reviewer',
      'desk-reviewed needs a date',
    ]);
    expect(applyEdits(unverified, { verification: { status: 'field-verified', reviewer: 'A', date: '2026-12-01' } }, opts).errors[0]).toMatch(
      /future/,
    );
  });

  it('refuses generated fields and bad values, and returns no file', () => {
    const result = applyEdits(reviewed, { stats: {}, geometry: 'x', name: ' ', description: 'x'.repeat(300) }, opts);
    expect(result.data).toBeNull();
    expect(result.errors).toEqual([
      '"stats" can\'t be edited here (it comes from npm run routes)',
      '"geometry" can\'t be edited here (it comes from npm run routes)',
      'name must be text without spaces at the start or end',
      'description is 300 characters (at most 280)',
    ]);
    expect(applyEdits(reviewed, null, opts).errors).toEqual(['edits must be an object']);
  });
});
