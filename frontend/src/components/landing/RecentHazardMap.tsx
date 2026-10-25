import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from 'react-leaflet';
import { getHazardMarkerIcon } from '../map/hazardMarkerIcon';
import type { HazardResponse } from '../../services/hazardsApi';
import 'leaflet/dist/leaflet.css';

interface Props {
  hazards: HazardResponse[];
  selected?: HazardResponse;
  onSelect: (hazard: HazardResponse) => void;
}

function Selection({ selected }: { selected?: HazardResponse }) {
  const map = useMap();
  const latitude = selected?.latitude;
  const longitude = selected?.longitude;
  useEffect(() => {
    if (typeof latitude === 'number' && typeof longitude === 'number' &&
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) map.flyTo([latitude, longitude], 9, {
      animate: !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    });
  }, [map, latitude, longitude]);
  return null;
}

export default function RecentHazardMap({ hazards, selected, onSelect }: Props) {
  return (
    <MapContainer center={[12.5, 122]} zoom={5} scrollWheelZoom={false} className="h-full w-full" aria-label="Recent hazard reports in the Philippines">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <Selection selected={selected} />
      {hazards.filter(h => Number.isFinite(h.latitude) && Number.isFinite(h.longitude) && Math.abs(h.latitude) <= 90 && Math.abs(h.longitude) <= 180).map(hazard => (
        <Marker key={hazard.id} position={[hazard.latitude, hazard.longitude]}
          zIndexOffset={selected?.id === hazard.id ? 1000 : 0}
          opacity={!selected || selected.id === hazard.id ? 1 : 0.6}
          icon={getHazardMarkerIcon(hazard.hazard_type, hazard.severity || undefined)}
          title={`${hazard.hazard_type.replace(/_/g, ' ')} · ${hazard.location_name}`}
          eventHandlers={{ click: () => onSelect(hazard) }}>
          <Tooltip>{hazard.hazard_type.replace(/_/g, ' ')} · {hazard.location_name}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
