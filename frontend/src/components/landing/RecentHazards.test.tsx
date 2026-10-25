import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecentHazards } from './RecentHazards';
import { fetchValidatedHazards, HazardResponse } from '../../services/hazardsApi';

jest.mock('../../services/hazardsApi', () => ({ fetchValidatedHazards: jest.fn() }));
jest.mock('./RecentHazardMap', () => ({
  __esModule: true,
  default: ({ hazards, onSelect }: { hazards: HazardResponse[]; onSelect: (h: HazardResponse) => void }) => (
    <div aria-label="Map preview">{hazards.map(h => <button key={h.id} onClick={() => onSelect(h)}>Marker {h.id}</button>)}</div>
  ),
}));
const mockFetch = fetchValidatedHazards as jest.Mock;
const clients: QueryClient[] = [];
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RecentHazards /></MemoryRouter></QueryClientProvider>);
}
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; jest.clearAllMocks(); });

test('report selection, map selection, type filtering and full-map links stay connected', async () => {
  mockFetch.mockResolvedValue([
    { id: '1', hazard_type: 'flood', source_headline: 'Flood source headline', location_name: 'Manila', severity: null },
    { id: '2', hazard_type: 'heat_index', source_title: 'Heat source headline', location_name: 'Olongapo', severity: 'moderate' },
  ]);
  show();
  const report = await screen.findByRole('button', { name: /Flood source headline/ });
  fireEvent.click(report);
  expect(report).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: /Inspect report/ })).toHaveAttribute('href', '/map?report=1');
  fireEvent.click(await screen.findByRole('button', { name: 'Marker 2' }));
  expect(screen.getByRole('button', { name: /Heat source headline/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(screen.getByRole('combobox', { name: 'Hazard type' }), { target: { value: 'heat_index' } });
  expect(screen.queryByRole('button', { name: /Flood source headline/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Marker 1' })).not.toBeInTheDocument();
});

test('empty report data makes no claim that the area is safe', async () => {
  mockFetch.mockResolvedValue([]);
  show();
  expect(await screen.findByText(/This does not mean there are no hazards/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Full map and filters/ })).toHaveAttribute('href', '/map');
});

test('unavailable reports expose an accessible retry action', async () => {
  mockFetch.mockRejectedValue(new Error('unavailable'));
  show();
  expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('Recent reports are unavailable');
  mockFetch.mockResolvedValue([]);
  fireEvent.click(screen.getByRole('button', { name: 'Retry reports' }));
  expect(await screen.findByText(/This does not mean there are no hazards/)).toBeInTheDocument();
});
