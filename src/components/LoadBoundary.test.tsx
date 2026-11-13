import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Lazy, LoadFailed } from './LoadBoundary';

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

describe('lazy parts of the app that fail to load', () => {
  it('a failed import shows a retry instead of a blank screen, and retry loads it again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new TypeError('Failed to fetch dynamically imported module');
      return { default: Hello };
    });
    render(
      <Lazy
        load={load}
        props={{ name: 'duck' }}
        loading={<p>Loading…</p>}
        failed={(retry) => <LoadFailed what="The dashboard" onRetry={retry} />}
      />,
    );
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('The dashboard didn’t load.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'RELOAD APP' })).toBeTruthy();

    fail = false;
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' })));
    expect(await screen.findByText('Hello duck')).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    err.mockRestore();
  });

  it('a component that throws while rendering is caught the same way', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Broken = () => {
      throw new Error('boom');
    };
    render(
      <Lazy
        load={async () => ({ default: Broken })}
        props={{}}
        loading={<p>Loading…</p>}
        failed={() => <p>Map didn’t load. Directions still work.</p>}
      />,
    );
    expect(await screen.findByText('Map didn’t load. Directions still work.')).toBeTruthy();
    warn.mockRestore();
    err.mockRestore();
  });
});
