import React, { useState, useEffect, useCallback } from 'react';
import type { HospitalData } from '../types';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import { InteractiveMap } from '../components/InteractiveMap';
import {
  MapPin, CheckCircle, Sparkles, Building2, Wifi, WifiOff,
  AlertTriangle, Navigation, RefreshCw, Loader2, Info, ShieldAlert
} from 'lucide-react';
import { useNearbyHospitals } from '../hooks/useNearbyHospitals';

interface HospitalMapViewProps {
  requestId?: number | null;
  ambulanceLat: number;
  ambulanceLng: number;
  capabilities: string[];
  urgencyLevel: string;
  isHeatIllness: boolean;
  onSelectDestination: (hospital: HospitalData, etaMinutes: number) => void;
}

/** Merge backend-ranked and OSM hospitals, deduplicating by proximity (<200m) */
function mergeHospitalLists(
  backendHospitals: HospitalData[],
  osmHospitals: HospitalData[]
): HospitalData[] {
  const merged = [...backendHospitals];
  const dedupRadius = 0.2; // km

  for (const osm of osmHospitals) {
    const isDuplicate = merged.some(h => {
      const dLat = (h.latitude - osm.latitude) * 111;
      const dLng = (h.longitude - osm.longitude) * 111;
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng);
      return distKm < dedupRadius;
    });
    if (!isDuplicate) merged.push(osm);
  }

  return merged.sort((a, b) => {
    const aScore = a.match_score ?? -1;
    const bScore = b.match_score ?? -1;
    if (aScore !== bScore) return bScore - aScore;
    return (a.distance_km ?? 999) - (b.distance_km ?? 999);
  });
}

export const HospitalMapView: React.FC<HospitalMapViewProps> = ({
  requestId,
  ambulanceLat,
  ambulanceLng,
  capabilities,
  urgencyLevel,
  isHeatIllness,
  onSelectDestination,
}) => {
  const [backendHospitals, setBackendHospitals] = useState<HospitalData[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<HospitalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [wsConnected, setWsConnected] = useState(false);
  const [searchRadius, setSearchRadius] = useState(10);

  const osm = useNearbyHospitals();

  const hasRealCoords = ambulanceLat !== 0 && ambulanceLng !== 0;
  const isDemoCoords =
    (Math.abs(ambulanceLat - 28.614) < 0.01 && Math.abs(ambulanceLng - 77.208) < 0.01) ||
    !hasRealCoords;

  const loadRanked = useCallback(async () => {
    if (!hasRealCoords) return;
    setLoading(true);
    setBackendError(null);
    try {
      const ranked = await api.rankHospitals({
        ambulance_lat: ambulanceLat,
        ambulance_lng: ambulanceLng,
        required_capabilities: capabilities,
        urgency_level: urgencyLevel,
        is_heat_illness: isHeatIllness,
      });
      setBackendHospitals(ranked);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBackendError(`Backend hospital ranking unavailable: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [ambulanceLat, ambulanceLng, capabilities, urgencyLevel, isHeatIllness, hasRealCoords]);

  const fetchOsm = useCallback(() => {
    if (hasRealCoords) {
      osm.fetchNearby(ambulanceLat, ambulanceLng, searchRadius);
    }
  }, [ambulanceLat, ambulanceLng, searchRadius, hasRealCoords]);

  useEffect(() => {
    loadRanked();
    fetchOsm();
  }, [loadRanked, fetchOsm]);

  useEffect(() => {
    const checkConn = () => setWsConnected(wsService.isConnected);
    const interval = setInterval(checkConn, 1500);

    const unsub = wsService.subscribe((msg) => {
      if (msg.type === 'hospital_capacity_synced') loadRanked();

      if (msg.type === 'ambulance_request_updated') {
        const data = msg.data;
        if (requestId && data.request_id === requestId) {
          if (data.status === 'Accepted') {
            setStatusType('success');
            setRequestStatus(`✅ Transport Accepted by ${data.destination_hospital_name || 'Hospital'}! Bed & trauma team reserved.`);
          } else if (data.status === 'Declined') {
            setStatusType('error');
            setRequestStatus(`⚠️ Request Declined. Reason: ${data.decline_reason || 'Capacity unavailable'}. Select alternate hospital.`);
          } else if (data.status === 'Requested') {
            setStatusType('info');
            setRequestStatus(`⌛ Request sent to ${data.destination_hospital_name}. Awaiting confirmation (ETA: ${data.eta_minutes}m)…`);
          }
        }
      }

      if (msg.type === 'request_redirected') {
        const data = msg.data;
        if (requestId && (data.original_request_id === requestId || data.new_request_id === requestId)) {
          setStatusType('warning');
          setRequestStatus(`↗️ Redirected to ${data.redirect_hospital_name}! New ETA: ${data.eta_minutes} mins.`);
        }
      }
    });

    return () => { clearInterval(interval); unsub(); };
  }, [requestId, loadRanked]);

  const allHospitals = mergeHospitalLists(backendHospitals, osm.hospitals);

  useEffect(() => {
    if (allHospitals.length > 0 && !selectedHospital) {
      setSelectedHospital(allHospitals[0]);
    }
  }, [allHospitals.length]);

  const isOsmHospital = (h: HospitalData) =>
    'is_osm_sourced' in h && (h as any).is_osm_sourced === true;

  const openDirections = (hospital: HospitalData | null) => {
    if (!hospital) return;
    const hasCoords = hospital.latitude !== 0 && hospital.longitude !== 0;
    const dest = hasCoords
      ? `${hospital.latitude},${hospital.longitude}`
      : encodeURIComponent(hospital.address || hospital.name);
    const params = new URLSearchParams({ api: '1', destination: dest, travelmode: 'driving' });
    if (hasRealCoords) params.set('origin', `${ambulanceLat},${ambulanceLng}`);
    window.open(`https://www.google.com/maps/dir/?${params.toString()}`, '_blank', 'noopener,noreferrer');
  };

  const handleSelectHospital = async (hospital: HospitalData) => {
    setSelectedHospital(hospital);
    openDirections(hospital);

    let targetId = hospital.id;

    if (requestId) {
      try {
        if (isOsmHospital(hospital) || targetId >= 900000) {
          const upsertRes = await api.upsertHospital({
            name: hospital.name,
            latitude: hospital.latitude,
            longitude: hospital.longitude,
            address: hospital.address || 'Real OpenStreetMap Location, Pune',
            contact_phone: hospital.contact_phone,
            capabilities: ['trauma', 'icu', 'heat_cooling'],
          });
          targetId = upsertRes.hospital_id;
        }

        const res = await api.selectDestination(requestId, targetId);
        setRequestStatus(`Request sent to ${hospital.name}. ETA: ${res.eta_minutes} mins.`);
        setStatusType('success');
        onSelectDestination({ ...hospital, id: targetId }, res.eta_minutes);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setRequestStatus(`Failed to register destination: ${msg}`);
        setStatusType('error');
      }
    } else {
      onSelectDestination(hospital, hospital.eta_minutes ?? 10);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>AI-Ranked + Real OpenStreetMap Hospitals</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900">Smart Emergency Hospital Destination Selection</h2>
          <p className="text-xs text-slate-600 mt-1">
            Combines system-verified hospitals (live capacity) with real nearby hospitals from OpenStreetMap. Bed/ICU figures for OSM hospitals are <strong>unverified</strong>.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${
            wsConnected ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-300 text-slate-600'
          }`}>
            {wsConnected ? <Wifi className="w-3.5 h-3.5 text-emerald-600" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{wsConnected ? 'Live Real-time Sync' : 'Connecting…'}</span>
          </div>

          {selectedHospital && (
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center space-x-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Selected Destination</span>
                <span className="text-xs font-bold text-emerald-700">{selectedHospital.name}</span>
              </div>
              <button
                onClick={() => handleSelectHospital(selectedHospital)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-sm cursor-pointer"
              >
                Request Transport
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Demo coords warning */}
      {isDemoCoords && (
        <div className="flex items-start space-x-2.5 p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Demo Coordinates Detected.</strong> The ambulance location appears to be the default demo position (New Delhi, India), not your actual GPS.
            Real hospitals near that location are still shown from OpenStreetMap. For accurate results, go to the Dispatch Form and enable real GPS.
          </div>
        </div>
      )}

      {/* Request status */}
      {requestStatus && (
        <div className={`p-4 border rounded-xl text-center text-xs font-bold flex items-center justify-center space-x-2 shadow-sm ${
          statusType === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' :
          statusType === 'error' ? 'bg-rose-50 border-rose-300 text-rose-800' :
          statusType === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-900' :
          'bg-sky-50 border-sky-300 text-sky-900'
        }`}>
          {statusType === 'success' && <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />}
          {statusType === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
          {statusType === 'warning' && <Navigation className="w-4 h-4 text-amber-600 shrink-0" />}
          <span>{requestStatus}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-4 rounded-2xl space-y-3 shadow-sm">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <MapPin className="w-4 h-4 mr-2 text-rose-600" />
              Live Hospital Map & Route Visualization
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              Ambulance at {ambulanceLat.toFixed(4)}, {ambulanceLng.toFixed(4)}
            </span>
          </div>
          <InteractiveMap
            centerLat={ambulanceLat}
            centerLng={ambulanceLng}
            zoom={13}
            hospitals={allHospitals}
            selectedHospitalId={selectedHospital?.id}
            onSelectHospital={handleSelectHospital}
            ambulanceLat={ambulanceLat}
            ambulanceLng={ambulanceLng}
          />
        </div>

        {/* Hospital List */}
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 flex items-center">
                <Building2 className="w-4 h-4 mr-2 text-teal-600" />
                Hospitals ({allHospitals.length})
              </h3>
              <span className="text-[10px] text-slate-500">
                {backendHospitals.length} system-verified · {osm.hospitals.length} from OpenStreetMap
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                value={searchRadius}
                onChange={e => setSearchRadius(Number(e.target.value))}
                className="h-8 bg-white border border-slate-300 rounded-lg text-xs px-2 cursor-pointer"
              >
                {[5, 10, 15, 25, 50].map(r => (
                  <option key={r} value={r}>{r} km</option>
                ))}
              </select>
              <button
                onClick={() => { loadRanked(); fetchOsm(); }}
                disabled={osm.status === 'fetching' || loading}
                title="Refresh Nearby Hospitals"
                className="h-8 w-8 flex items-center justify-center bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${(osm.status === 'fetching' || loading) ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {osm.status === 'fetching' && (
            <div className="flex items-center space-x-2 p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-800">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 shrink-0" />
              <span>Fetching real nearby hospitals from OpenStreetMap…</span>
            </div>
          )}
          {osm.status === 'error' && (
            <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>{osm.errorMessage}</span>
            </div>
          )}
          {osm.status === 'success' && osm.lastFetchedAt && (
            <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 px-1">
              <Info className="w-3 h-3" />
              <span>OSM updated at {osm.lastFetchedAt.toLocaleTimeString()}</span>
            </div>
          )}
          {backendError && (
            <div className="flex items-start space-x-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{backendError}</span>
            </div>
          )}

          {loading && backendHospitals.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Ranking nearby hospitals…</span>
            </div>
          ) : allHospitals.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              No hospitals found. Try increasing the search radius or refreshing.
            </div>
          ) : (
            allHospitals.map((h, idx) => {
              const isSelected = selectedHospital?.id === h.id;
              const fromOsm = isOsmHospital(h);
              const freeBeds = h.resources?.available_staffed_beds ?? h.available_staffed_beds;
              const freeIcu = h.resources?.available_icu_beds ?? h.available_icu_beds;

              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedHospital(h)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                    isSelected
                      ? 'bg-emerald-50/60 border-emerald-400 shadow-md ring-2 ring-emerald-400/20'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-teal-100 border border-teal-300 text-teal-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 truncate">{h.name}</h4>
                        {fromOsm && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 text-[9px] font-bold rounded shrink-0">
                            OSM
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5 truncate">{h.address}</span>
                    </div>

                    {h.match_score != null ? (
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-sm font-black text-emerald-700 block">{h.match_score}%</span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Match</span>
                      </div>
                    ) : h.distance_km != null ? (
                      <div className="text-right shrink-0 ml-2">
                        <span className="text-sm font-black text-slate-700 block">{h.distance_km} km</span>
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Distance</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">Travel:</span>
                      <span className="font-bold text-teal-700">{h.eta_minutes ?? '–'} min</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Staffed Beds:</span>
                      {fromOsm
                        ? <span className="font-bold text-amber-700 text-[9px]">⚠ Unverified</span>
                        : <span className="font-bold text-slate-900">{freeBeds ?? '–'} free</span>
                      }
                    </div>
                    <div>
                      <span className="text-slate-500 block">ICU:</span>
                      {fromOsm
                        ? <span className="font-bold text-amber-700 text-[9px]">⚠ Unverified</span>
                        : <span className="font-bold text-rose-700">{freeIcu ?? '–'} free</span>
                      }
                    </div>
                  </div>

                  {h.recommendation_reasons && h.recommendation_reasons.length > 0 && (
                    <div className="space-y-0.5">
                      {h.recommendation_reasons.slice(0, 2).map((r, rIdx) => (
                        <div key={rIdx} className={`text-[10px] flex items-center font-medium ${fromOsm ? 'text-blue-700' : 'text-emerald-800'}`}>
                          {fromOsm
                            ? <Info className="w-3 h-3 mr-1 text-blue-500 shrink-0" />
                            : <CheckCircle className="w-3 h-3 mr-1 text-emerald-600 shrink-0" />
                          }
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="text-[10px] text-slate-500">
                      {fromOsm ? 'OpenStreetMap — Capacity Unverified' : (h.data_freshness_label ?? 'System Verified')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={e => { e.stopPropagation(); openDirections(h); }}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] rounded-lg transition border border-slate-200 cursor-pointer flex items-center gap-1"
                      >
                        <Navigation className="w-3 h-3" />
                        Directions
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleSelectHospital(h); }}
                        className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] rounded-lg transition shadow-sm cursor-pointer"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
