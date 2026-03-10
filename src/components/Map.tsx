import { MapContainer, TileLayer, Marker, Popup, useMapEvents, GeoJSON, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { Point, InteractionMode } from '../types';
import { useEffect, useRef } from 'react';

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const lightIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const selectedLightIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapEvents({ mode, onMapClick }: { mode: InteractionMode, onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (mode !== 'none') {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

interface MapProps {
  lights: Point[];
  startPoint: Point | null;
  selectedLightIds: Set<string>;
  routeGeoJSON: any | null;
  mode: InteractionMode;
  onMapClick: (lat: number, lng: number) => void;
  center: [number, number];
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMapEvents({});
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function Map({ lights, startPoint, selectedLightIds, routeGeoJSON, mode, onMapClick, center }: MapProps) {
  return (
    <MapContainer center={center} zoom={13} className="h-full w-full z-0" style={{ cursor: mode !== 'none' ? 'crosshair' : 'grab' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapUpdater center={center} />
      <MapEvents mode={mode} onMapClick={onMapClick} />

      {startPoint && (
        <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}>
          <Tooltip permanent direction="top" offset={[0, -40]} className="font-bold text-green-700 bg-white/80 border-green-200">
            {startPoint.name}
          </Tooltip>
          <Popup>出發點 (Start)</Popup>
        </Marker>
      )}

      {lights.map(light => (
        <Marker
          key={light.id}
          position={[light.lat, light.lng]}
          icon={selectedLightIds.has(light.id) ? selectedLightIcon : lightIcon}
        >
          <Tooltip permanent direction="top" offset={[0, -40]} className={`font-bold ${selectedLightIds.has(light.id) ? 'text-red-700' : 'text-blue-700'} bg-white/80 border-none`}>
            {light.name}
          </Tooltip>
          <Popup>
            <div className="font-bold">{light.name}</div>
            <div className="text-xs text-gray-500">{light.lat.toFixed(5)}, {light.lng.toFixed(5)}</div>
          </Popup>
        </Marker>
      ))}

      {routeGeoJSON && (
        <GeoJSON key={JSON.stringify(routeGeoJSON)} data={routeGeoJSON} style={{ color: '#3b82f6', weight: 5, opacity: 0.7 }} />
      )}
    </MapContainer>
  );
}
