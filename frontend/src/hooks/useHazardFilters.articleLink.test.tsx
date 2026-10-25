import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useHazardFilters } from './useHazardFilters';

function Harness() {
  const { updateFilters, resetFilters } = useHazardFilters();
  const location = useLocation();
  return <>
    <output aria-label="Query">{location.search}</output>
    <button onClick={() => updateFilters({ hazardTypes: ['flood'] })}>Filter floods</button>
    <button onClick={resetFilters}>Reset</button>
  </>;
}

test('report links survive initial filter URL synchronization, changes and reset', () => {
  localStorage.clear();
  render(<MemoryRouter initialEntries={['/map?report=selected-id']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Harness /></MemoryRouter>);
  expect(screen.getByLabelText('Query')).toHaveTextContent('report=selected-id');
  fireEvent.click(screen.getByRole('button', { name: 'Filter floods' }));
  expect(screen.getByLabelText('Query')).toHaveTextContent('report=selected-id');
  expect(screen.getByLabelText('Query')).toHaveTextContent('types=flood');
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByLabelText('Query')).toHaveTextContent('report=selected-id');
  expect(screen.getByLabelText('Query')).not.toHaveTextContent('types=flood');
});
