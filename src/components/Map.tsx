import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, GeoJSON, Tooltip, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { Point, InteractionMode } from '../types';
import 'leaflet/dist/leaflet.css';

// Create consistent Circle Icons
const createNumberedIcon = (number: number | string, color: string, isMain: boolean = false) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${color};
        width: ${isMain ? '32px' : '28px'};
        height: ${isMain ? '32px' : '28px'};
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${isMain ? '14px' : '12px'};
        transform: translate(-10%, -10%);
      ">
        ${number}
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

const startIcon = createNumberedIcon('起', '#059669', true); // Emerald-600 for Start
const dotIcon = createNumberedIcon('', '#3b82f6'); // Default Blue
const selectedDotIcon = createNumberedIcon('', '#ef4444'); // Selected Red

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
  optimizedOrder: (Point & { distanceTo?: number, color?: string })[];
  mode: InteractionMode;
  onMapClick: (lat: number, lng: number) => void;
  onMarkerClick?: (light: Point) => void;
  center: [number, number];
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMapEvents({});
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function Map({ lights, startPoint, selectedLightIds, routeSegments, optimizedOrder, mode, onMapClick, onMarkerClick, center }: MapProps) {
  return (
    <MapContainer center={center} zoom={13} className="h-full w-full z-0" style={{ cursor: mode !== 'none' ? 'crosshair' : 'grab' }}>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="OpenStreetMap">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="內政部 TGOS (臺灣通用電子地圖)">
          <TileLayer
            attribution='&copy; <a href="https://maps.nlsc.gov.tw/">NLSC</a>, MOI'
            url="https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      <MapUpdater center={center} />
      <MapEvents mode={mode} onMapClick={onMapClick} />

      {startPoint && (
        <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon}>
          <Tooltip permanent direction="top" offset={[0, -15]} className="font-bold text-green-700 bg-white/90 border-green-200 px-2 rounded">
            {startPoint.name} (起點)
          </Tooltip>
          <Popup>出發點 (Start)</Popup>
        </Marker>
      )}

      {lights.map(light => {
        const orderItem = optimizedOrder.find(opt => opt.id === light.id);
        const orderIndex = optimizedOrder.findIndex(opt => opt.id === light.id);
        const isSelected = selectedLightIds.has(light.id);

        // Decide Icon
        let currentIcon = isSelected ? selectedDotIcon : dotIcon;
        if (orderIndex !== -1) {
          currentIcon = createNumberedIcon(orderIndex + 1, orderItem?.color || '#10b981');
        }

        return (
          <Marker
            key={light.id}
            position={[light.lat, light.lng]}
            icon={currentIcon}
            eventHandlers={{
              click: (e) => {
                // If setting start point, use this marker instead of map click
                if (mode === 'set_start' && onMarkerClick) {
                  onMarkerClick(light);
                  // Prevent the map click event from firing
                  L.DomEvent.stopPropagation(e);
                }
              }
            }}
          >
            {orderIndex === -1 && (
              <Tooltip
                permanent
                direction="top"
                offset={[0, -15]}
                className={`font-bold ${isSelected ? 'text-red-700' : 'text-blue-700'} bg-white/80 border-none shadow-sm px-1.5 rounded text-[10px]`}
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
