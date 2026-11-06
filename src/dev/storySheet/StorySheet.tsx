/**
 * Dev-only (`?story-sheet`): the Sunday story drawn by the real renderer for
 * a few example weathers from src/weather/scenarios.ts, so the design can be
 * seen any day of the week (the real MAKE STORY needs the forecast to reach
 * Sunday). main.tsx only loads it when `import.meta.env.DEV`.
 */
import { useEffect, useState } from 'react';
import { EVENT, nextRun } from '../../event/event';
import { weatherText } from '../../weather/forecast';
import { whatToWear } from '../../weather/outfit';
import { SCENARIOS } from '../../weather/scenarios';
import { renderStory } from '../../story/render';
import type { StorySnapshot } from '../../story/snapshot';

const EXAMPLES = ['A1', 'A7', 'A16', 'U4'];

function snapshotFor(id: string): StorySnapshot {
  const sc = SCENARIOS.find((s) => s.id === id)!;
  const i = sc.input;
  const now = Date.now();
  const run = nextRun(now);
  return {
    madeAt: now,
    forecastFetchedAt: now,
    eventName: EVENT.name,
    weekday: EVENT.weekday,
    run,
    place: EVENT.place,
    weather: { hourAt: run.startAt, tempC: i.tempC, feelsC: i.feelsC, text: weatherText(i.code), windKmh: i.windKmh, precipProb: i.precipProb },
    outfit: whatToWear(i),
  };
}

export default function StorySheet() {
  const [stories, setStories] = useState<{ id: string; name: string; url: string }[]>([]);
  useEffect(() => {
    let urls: string[] = [];
    void Promise.all(
      EXAMPLES.map(async (id) => ({
        id,
        name: SCENARIOS.find((s) => s.id === id)!.name,
        url: await (async () => {
          const blob = await renderStory(snapshotFor(id));
          // Also saved to .cache/story-sheet/ by the dev server, to open or share as files.
          await fetch(`/__dev/story-sheet?name=story-${id.toLowerCase()}`, { method: 'POST', body: blob }).catch(() => {});
          return URL.createObjectURL(blob);
        })(),
      })),
    ).then((list) => {
      urls = list.map((s) => s.url);
      setStories(list);
    });
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  return (
    <div style={{ padding: 16, fontFamily: '"JetBrains Mono", monospace', background: '#F5F0E8' }}>
      <h1 style={{ color: '#1B3F72', margin: '0 0 4px' }}>Story sheet</h1>
      <p style={{ margin: '0 0 16px', fontSize: 14 }}>
        Example weathers drawn by the real story renderer (1080 × 1920 PNG), also saved to .cache/story-sheet/. Dev only.
      </p>
      {!stories.length && <p role="status">Drawing…</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {stories.map((s) => (
          <figure key={s.id} style={{ margin: 0, width: 360 }}>
            <img src={s.url} alt={`Story for ${s.name}`} style={{ width: '100%', border: '2px solid #2C2C2A', borderRadius: 12 }} />
            <figcaption style={{ fontSize: 13, fontWeight: 700 }}>
              {s.id} · {s.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
