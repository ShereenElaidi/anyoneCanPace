import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadRoute } from './data';
import { RoutePage } from './RoutePage';

// MapLibre needs WebGL, which jsdom doesn't have: stub the map at its boundary.
vi.mock('./map/RouteMap', () => ({ default: () => <div data-testid="route-map" /> }));

describe('RoutePage description', () => {
  it('shows the description above the stats when the route has one', async () => {
    const route = await loadRoute('sample-loop');
    const text = 'Flat along the canal, shaded most of the way.';
    const { container } = render(<RoutePage route={{ ...route, data: { ...route.data, description: text } }} onStart={() => {}} />);
    const description = screen.getByText(text);
    expect(description.classList).toContain('route-page__description');
    const stats = container.querySelector('.route-stats')!;
    expect(description.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows nothing extra when the route has no description', async () => {
    const route = await loadRoute('sample-loop');
    const { description: _, ...data } = route.data;
    const { container } = render(<RoutePage route={{ ...route, data }} onStart={() => {}} />);
    expect(container.querySelector('.route-page__description')).toBeNull();
  });
});
