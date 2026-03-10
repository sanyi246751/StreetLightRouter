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
  routeSegments: { geometry: any, color: string }[];
  optimizedOrder: (Point & { distanceTo?: number })[];
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

export default function Map({ lights, startPoint, selectedLightIds, routeSegments, optimizedOrder, mode, onMapClick, center }: MapProps) {
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

      {lights.map(light => {
        // Check if this light is in the optimized order
        const orderItem = optimizedOrder.find(opt => opt.id === light.id);
        const orderIndex = optimizedOrder.findIndex(opt => opt.id === light.id);
        const isSelected = selectedLightIds.has(light.id);

        return (
          <Marker
            key={light.id}
            position={[light.lat, light.lng]}
            icon={isSelected ? selectedLightIcon : lightIcon}
          >
            {/* If in optimized order, show the number badge with matching color */}
            {orderIndex !== -1 ? (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -40]}
                className="font-black text-white border-none rounded-full w-6 h-6 flex items-center justify-center p-0 shadow-lg text-xs"
                style={{ backgroundColor: (orderItem as any)?.color || '#10b981' }}
              >
                {orderIndex + 1}
              </Tooltip>
            ) : (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -40]}
                className={`font-bold ${isSelected ? 'text-red-700' : 'text-blue-700'} bg-white/80 border-none shadow-sm`}
              >
                {light.name}
              </Tooltip>
            )}
            <Popup>
              <div className="font-bold">{light.name}</div>
              <div className="text-xs text-gray-500">{light.lat.toFixed(5)}, {light.lng.toFixed(5)}</div>
              {orderIndex !== -1 && (
                <div className="text-xs font-bold text-emerald-600 mt-1">第 {orderIndex + 1} 站</div>
              )}
            </Popup>
          </Marker>
        );
      })}

      {routeSegments.map((segment, index) => (
        <GeoJSON
          key={`route-seg-${index}-${segment.color}`}
          data={segment.geometry}
          style={{ color: segment.color, weight: 6, opacity: 0.8 }}
        />
      ))}
    </MapContainer>
  );
}
