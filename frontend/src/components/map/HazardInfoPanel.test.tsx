import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { HazardInfoPanel } from './HazardInfoPanel';

const report = {
  id: 'hazard-1', hazard_type: 'heat_index', severity: null,
  location_name: 'Olongapo City', latitude: 14.839, longitude: 120.284,
  confidence_score: 1, source_type: 'rss', validated: true,
  validation_notes: 'Auto-validated (confidence 1 >= threshold: 0.7)',
  created_at: '2026-10-25T08:50:00Z', source_published_at: '2026-10-25T07:00:00Z',
  source_title: 'olongapo heat index reaches 44.8°c',
  source_content: 'The city continued to experience dangerously high heat levels.',
  source_url: 'https://news.example/heat', image_url: 'https://news.example/heat.jpg',
  image_alt: 'Residents sheltering from the heat',
};

test('preserves source details and distinguishes confidence, severity and automated screening', () => {
  render(<HazardInfoPanel hazard={report} isOpen onClose={jest.fn()} />);
  expect(screen.getByRole('heading', { name: 'heat index' })).toBeInTheDocument();
  expect(screen.getByText('Not assessed')).toBeInTheDocument();
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getByText('Passed automated screening')).toBeInTheDocument();
  expect(screen.getByText(/Even 100% confidence does not confirm/)).toBeInTheDocument();
  expect(screen.getByText('14.8390, 120.2840')).toBeInTheDocument();
  expect(screen.getByText(/4:50 pm PHT/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /View Full Source/ })).toHaveAttribute('href', report.source_url);
});

test('loads editorial images and removes failed images without a placeholder', () => {
  render(<HazardInfoPanel hazard={report} isOpen onClose={jest.fn()} />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading article image');
  const img = screen.getByAltText(report.image_alt);
  expect(img).toHaveAttribute('loading', 'lazy');
  fireEvent.load(img);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.error(img);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('switching reports resets image error state and handles missing coordinates', () => {
  const props = { isOpen: true, onClose: jest.fn(), onZoomTo: jest.fn() };
  const { rerender } = render(<HazardInfoPanel hazard={report} {...props} />);
  fireEvent.error(screen.getByAltText(report.image_alt));
  rerender(<HazardInfoPanel hazard={{ ...report, id: 'other', image_url: 'https://news.example/next.jpg', latitude: null }} {...props} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://news.example/next.jpg');
  expect(screen.getByText('Coordinates unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Zoom to Location' })).toBeDisabled();
});

test('old reports need no image and unsafe source links are omitted', () => {
  render(<HazardInfoPanel hazard={{ ...report, image_url: null, source_url: 'data:text/html,unsafe', validated: false, severity: 'critical' }} isOpen onClose={jest.fn()} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('critical')).toBeInTheDocument();
  expect(screen.getByText('Pending validation')).toBeInTheDocument();
});

test('close, Escape, zoom and focus restoration work without blocking the map', () => {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  trigger.focus();
  const onClose = jest.fn(), onZoomTo = jest.fn();
  const { rerender, unmount } = render(<HazardInfoPanel hazard={report} isOpen onClose={onClose} onZoomTo={onZoomTo} />);
  expect(screen.getByRole('button', { name: 'Close hazard details' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Zoom to Location' }));
  expect(onZoomTo).toHaveBeenCalledWith(14.839, 120.284);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Close hazard details' }));
  expect(onClose).toHaveBeenCalledTimes(2);
  rerender(<HazardInfoPanel hazard={report} isOpen={false} onClose={onClose} />);
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  unmount(); trigger.remove();
});

test('long source excerpts can be expanded and full headline is retained', () => {
  const headline = 'A very long headline '.repeat(20);
  render(<HazardInfoPanel hazard={{ ...report, source_headline: headline, source_content: 'Source sentence. '.repeat(50), confidence_score: 0.42 }} isOpen onClose={jest.fn()} />);
  expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(headline.trim());
  expect(screen.getByText('42%')).toBeInTheDocument();
  const fullExcerpt = screen.getByText('Source sentence. '.repeat(50).trim());
  expect(fullExcerpt).not.toBeVisible();
  const summary = screen.getByText('Read full source excerpt');
  fireEvent.click(summary);
  expect(fullExcerpt).toBeVisible();
});
