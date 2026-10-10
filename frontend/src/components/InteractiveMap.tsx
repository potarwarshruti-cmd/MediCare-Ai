import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HospitalData } from '../types';

// Custom icons using Leaflet DivIcons for modern high-resolution markers
const createCustomMarkerIcon = (color: string, label: string) => {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        font-family: sans-serif;
      ">
        ${label}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

interface InteractiveMapProps {
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  alertRadiusKm?: number;
  hospitals?: HospitalData[];
  selectedHospitalId?: number | null;
  onSelectHospital?: (hospital: HospitalData) => void;
  ambulanceLat?: number;
  ambulanceLng?: number;
  showWarningCircle?: boolean;
}

// Component to dynamically recenter map when selected hospital or ambulance changes
const RecenterMap: React.FC<{ lat: number; lng: number; zoom?: number }> = ({ lat, lng, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], zoom || map.getZoom());
  }, [lat, lng, zoom, map]);
  return null;
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  centerLat = 18.5204,
  centerLng = 73.8567,
  zoom = 13,
  alertRadiusKm = 1.5,
  hospitals = [],
  selectedHospitalId = null,
  onSelectHospital,
  ambulanceLat,
  ambulanceLng,
  showWarningCircle = true,
}) => {
  const selectedHospital = hospitals.find(h => h.id === selectedHospitalId);

  return (
    <div className="relative w-full h-[480px] rounded-2xl overflow-hidden shadow-inner border border-slate-700 bg-slate-900">
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={zoom}
        style={{ width: '100%', height: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <RecenterMap lat={centerLat} lng={centerLng} zoom={zoom} />

        {/* Heat Alert Radius Circle (1.5 km default) */}
        {showWarningCircle && (
          <Circle
            center={[centerLat, centerLng]}
            radius={alertRadiusKm * 1000} // Convert km to meters
            pathOptions={{
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 0.15,
              weight: 2,
              dashArray: '6, 6',
            }}
          >
            <Popup>
              <div className="p-1 font-sans">
                <span className="font-bold text-red-600 block text-xs">
                  🔥 Heatwave Warning Radius ({alertRadiusKm} km)
                </span>
                <span className="text-[11px] text-slate-600">
                  Hospitals inside this circle receive priority early-warning alerts.
                </span>
              </div>
            </Popup>
          </Circle>
        )}

        {/* Hospital Markers */}
        {hospitals.map(h => {
          const isSelected = h.id === selectedHospitalId;
          const isWithinRadius = alertRadiusKm ? (h.distance_km || 0) <= alertRadiusKm : true;
          const markerColor = isSelected ? '#10b981' : isWithinRadius ? '#f59e0b' : '#3b82f6';
          const icon = createCustomMarkerIcon(markerColor, `H${h.id}`);

          return (
            <Marker
              key={h.id}
              position={[h.latitude, h.longitude]}
              icon={icon}
              eventHandlers={{
                click: () => {
                  if (onSelectHospital) onSelectHospital(h);
                },
              }}
            >
              <Popup>
                <div className="p-2 font-sans max-w-xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="font-bold text-sm text-slate-900">{h.name}</h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                      {h.resources?.readiness_status || 'Ready'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{h.address}</p>

                  <div className="grid grid-cols-2 gap-1 text-[11px] bg-slate-50 p-1.5 rounded border mb-2">
                    <div>
                      <span className="text-slate-500">Staffed Beds:</span>{' '}
                      <span className="font-bold text-slate-800">{h.resources?.available_staffed_beds ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">ICU Beds:</span>{' '}
                      <span className="font-bold text-slate-800">{h.resources?.available_icu_beds ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Cooling Beds:</span>{' '}
                      <span className="font-bold text-teal-700">{h.resources?.available_cooling_beds ?? 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Doctors:</span>{' '}
                      <span className="font-bold text-slate-800">{h.resources?.available_doctors ?? 'N/A'}</span>
                    </div>
                  </div>

                  {h.match_score && (
                    <div className="text-[11px] font-semibold text-emerald-700 mb-1">
                      Match Score: {h.match_score}% {h.eta_minutes ? `(${h.eta_minutes} min away)` : ''}
                    </div>
                  )}

                  {onSelectHospital && (
                    <button
                      onClick={() => onSelectHospital(h)}
                      className="w-full mt-1 py-1 px-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded transition"
                    >
                      Select Destination
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Ambulance Marker */}
        {ambulanceLat && ambulanceLng && (
          <Marker
            position={[ambulanceLat, ambulanceLng]}
            icon={createCustomMarkerIcon('#ef4444', '🚑')}
          >
            <Popup>
              <div className="p-1 font-sans">
                <span className="font-bold text-xs text-slate-900">🚑 Ambulance Unit</span>
                <span className="block text-[11px] text-slate-600">Current GPS Location</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Route Polyline if ambulance & destination hospital selected */}
        {ambulanceLat && ambulanceLng && selectedHospital && (
          <Polyline
            positions={[
              [ambulanceLat, ambulanceLng],
              [selectedHospital.latitude, selectedHospital.longitude],
            ]}
            pathOptions={{ color: '#10b981', weight: 4, dashArray: '8, 8' }}
          />
        )}
      </MapContainer>

      {/* Map Overlay Legend */}
      <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-700 p-2.5 rounded-xl shadow-lg text-[11px] text-slate-300 flex items-center space-x-4">
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 border border-white inline-block"></span>
          <span>Ambulance</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white inline-block"></span>
          <span>In 1.5km Zone</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-blue-500 border border-white inline-block"></span>
          <span>Regional Hospital</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white inline-block"></span>
          <span>Selected Destination</span>
        </div>
      </div>
    </div>
  );
};
