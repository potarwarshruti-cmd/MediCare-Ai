import React, { useState, useEffect, useCallback } from 'react';
import type { EmergencyRequestData, HospitalData } from '../types';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import {
  Ambulance, CheckCircle, XCircle, Clock, ShieldCheck, Flame,
  RefreshCw, AlertTriangle, Navigation, Wifi, WifiOff, ArrowRight,
  Activity, MapPin
} from 'lucide-react';

interface IncomingAmbulancesViewProps {
  hospital: HospitalData;
  onUpdateHospitalCapacity: () => void;
}

interface RedirectOption {
  requestId: number;
  alternatives: HospitalData[];
}

const urgencyColors: Record<string, string> = {
  Critical: 'bg-rose-100 text-rose-800 border-rose-300',
  High: 'bg-amber-100 text-amber-900 border-amber-300',
  Medium: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  Low: 'bg-slate-100 text-slate-700 border-slate-300',
};

const urgencyRing: Record<string, string> = {
  Critical: 'border-rose-300 shadow-sm',
  High: 'border-amber-300 shadow-sm',
  Medium: 'border-yellow-300',
  Low: 'border-slate-200',
};

export const IncomingAmbulancesView: React.FC<IncomingAmbulancesViewProps> = ({
  hospital,
  onUpdateHospitalCapacity,
}) => {
  const [requests, setRequests] = useState<EmergencyRequestData[]>([]);
  const [loading, setLoading] = useState(true);
  const [declineReason, setDeclineReason] = useState<string>('');
  const [activeDeclineId, setActiveDeclineId] = useState<number | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [actionError, setActionError] = useState<Record<number, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [redirectOption, setRedirectOption] = useState<RedirectOption | null>(null);
  const [redirectLoading, setRedirectLoading] = useState(false);
  const [newRequestAlert, setNewRequestAlert] = useState<string | null>(null);

  const fetchIncoming = useCallback(async () => {
    try {
      const res = await api.getIncomingAmbulances(hospital.id);
      setRequests(res);
    } catch (err) {
      console.error('Failed to load incoming ambulances', err);
    } finally {
      setLoading(false);
    }
  }, [hospital.id]);

  useEffect(() => {
    fetchIncoming();
  }, [fetchIncoming]);

  useEffect(() => {
    const checkConn = () => setWsConnected(wsService.isConnected);
    const interval = setInterval(checkConn, 1500);

    const unsub = wsService.subscribe((msg) => {
      if (msg.type === 'ambulance_request_updated' || msg.type === 'ambulance_request_created') {
        const data = msg.data;
        const destId = data.destination_hospital_id as number | undefined;
        if (destId === hospital.id && data.status === 'Requested') {
          setNewRequestAlert(`Ambulance ${data.ambulance_code} incoming! ETA: ${data.eta_minutes} min`);
          setTimeout(() => setNewRequestAlert(null), 6000);
        }
        fetchIncoming();
      }
      if (msg.type === 'hospital_capacity_synced' && (msg.data.hospital_id as number) === hospital.id) {
        onUpdateHospitalCapacity();
      }
      if (msg.type === 'request_redirected') {
        fetchIncoming();
      }
    });

    return () => { clearInterval(interval); unsub(); };
  }, [hospital.id, fetchIncoming, onUpdateHospitalCapacity]);

  const clearError = (id: number) => setActionError(prev => { const n = { ...prev }; delete n[id]; return n; });

  const handleRespond = async (requestId: number, response: 'Accepted' | 'Declined', reason?: string) => {
    setActionLoading(prev => ({ ...prev, [requestId]: true }));
    clearError(requestId);
    try {
      await api.respondEmergencyRequest(requestId, response, reason);
      setActiveDeclineId(null);
      setDeclineReason('');
      fetchIncoming();
      onUpdateHospitalCapacity();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Action failed.';
      setActionError(prev => ({ ...prev, [requestId]: errMsg }));
    } finally {
      setActionLoading(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleDeclineAndRedirect = async (req: EmergencyRequestData) => {
    setActionLoading(prev => ({ ...prev, [req.id]: true }));
    clearError(req.id);
    try {
      await api.respondEmergencyRequest(req.id, 'Declined', declineReason || 'Capacity unavailable');
      setActiveDeclineId(null);
      setDeclineReason('');
      setRedirectLoading(true);
      const ranked = await api.rankHospitals({
        ambulance_lat: req.current_lat ?? hospital.latitude,
        ambulance_lng: req.current_lng ?? hospital.longitude,
        required_capabilities: req.required_capabilities || [],
        urgency_level: req.urgency_level,
        is_heat_illness: req.is_heat_illness,
      });
      const alts = ranked.filter((h) => {
        const hId = (h as HospitalData & { hospital_id?: number }).hospital_id ?? h.id;
        return hId !== hospital.id;
      }).slice(0, 3);
      setRedirectOption({ requestId: req.id, alternatives: alts });
      fetchIncoming();
      onUpdateHospitalCapacity();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Redirect failed.';
      setActionError(prev => ({ ...prev, [req.id]: errMsg }));
    } finally {
      setActionLoading(prev => ({ ...prev, [req.id]: false }));
      setRedirectLoading(false);
    }
  };

  const handleRedirectTo = async (hospitalId: number) => {
    if (!redirectOption) return;
    setRedirectLoading(true);
    try {
      const res = await api.redirectEmergencyRequest(redirectOption.requestId, hospitalId);
      setRedirectOption(null);
      fetchIncoming();
      alert(`Redirected to ${res.new_hospital_name} — ETA: ${res.eta_minutes} min (${res.distance_km} km)`);
    } catch (err) {
      console.error('Redirect failed', err);
    } finally {
      setRedirectLoading(false);
    }
  };

  const openGoogleMaps = (req: EmergencyRequestData) => {
    const dest = `${hospital.latitude},${hospital.longitude}`;
    const org = `${req.current_lat ?? hospital.latitude},${req.current_lng ?? hospital.longitude}`;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${org}&destination=${dest}&travelmode=driving`, '_blank', 'noopener,noreferrer');
  };

  const pendingCount = requests.filter(r => r.status === 'Requested').length;
  const acceptedCount = requests.filter(r => r.status === 'Accepted').length;

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header */}
      <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm min-w-0 max-w-full">
        <div className="min-w-0 max-w-full flex-1">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-100 border border-rose-300 text-rose-800 text-xs font-semibold mb-2">
            <Ambulance className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>System A — Hospital Emergency Queue</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 break-words min-w-0">Incoming Ambulance Requests</h2>
          <p className="text-xs text-slate-600 mt-1 break-words">{hospital.name} — Prioritized by urgency level and arrival order.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 max-w-full">
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border text-xs font-bold ${wsConnected ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-300 text-slate-600'}`}>
            {wsConnected ? <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <WifiOff className="w-3.5 h-3.5 shrink-0" />}
            <span>{wsConnected ? 'Live' : 'Reconnecting...'}</span>
          </div>
          {requests.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-1 rounded-lg bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold">{pendingCount} Pending</span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold">{acceptedCount} Accepted</span>
            </div>
          )}
          <button onClick={fetchIncoming} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition flex items-center space-x-2 cursor-pointer shadow-sm">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {newRequestAlert && (
        <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-xs font-bold text-rose-800 flex items-center space-x-2 animate-pulse shadow-sm">
          <Activity className="w-4 h-4 text-rose-600 shrink-0" />
          <span>NEW: {newRequestAlert}</span>
        </div>
      )}

      {/* Live Capacity Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Staffed Beds', val: hospital.resources?.available_staffed_beds, color: 'text-teal-700' },
          { label: 'ICU Beds', val: hospital.resources?.available_icu_beds, color: 'text-rose-700' },
          { label: 'Doctors', val: hospital.resources?.available_doctors, color: 'text-sky-700' },
          { label: 'Nurses', val: hospital.resources?.available_nurses, color: 'text-purple-700' },
        ].map(item => (
          <div key={item.label} className="bg-white border border-slate-200 p-3 rounded-xl text-center shadow-sm">
            <div className={`text-xl font-black ${item.color}`}>{item.val ?? '—'}</div>
            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">{item.label} Available</div>
          </div>
        ))}
      </div>

      {/* Smart Redirection Panel */}
      {redirectOption && (
        <div className="bg-gradient-to-br from-amber-50 via-slate-50 to-amber-50 border border-amber-300 p-5 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center space-x-2">
            <Navigation className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-extrabold text-amber-900">Smart Redirection — Select Alternate Hospital</h3>
          </div>
          <p className="text-xs text-slate-600">Request #{redirectOption.requestId} declined. Choose a clinically suitable alternate below.</p>
          {redirectLoading ? (
            <div className="text-xs text-slate-500 animate-pulse">Finding best hospitals...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {redirectOption.alternatives.map((alt, idx) => {
                const altId = (alt as HospitalData & { hospital_id?: number }).hospital_id ?? alt.id;
                return (
                  <div key={altId ?? idx} className="bg-white border border-slate-200 p-4 rounded-xl space-y-2 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-teal-700">#{idx + 1} Best Match</span>
                      <span className="text-xs font-black text-emerald-700">{alt.match_score}%</span>
                    </div>
                    <div className="font-bold text-sm text-slate-900 leading-tight">{alt.name}</div>
                    <div className="text-[10px] text-slate-500">{alt.address}</div>
                    <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <div><span className="text-slate-500 block">ETA</span><span className="font-bold text-teal-700">{alt.eta_minutes}m</span></div>
                      <div><span className="text-slate-500 block">Beds</span><span className="font-bold text-slate-900">{alt.resources?.available_staffed_beds ?? alt.available_staffed_beds ?? 0}</span></div>
                      <div><span className="text-slate-500 block">ICU</span><span className="font-bold text-rose-700">{alt.resources?.available_icu_beds ?? alt.available_icu_beds ?? 0}</span></div>
                    </div>
                    <div className="flex space-x-2">
                      <button onClick={() => handleRedirectTo(altId!)} disabled={redirectLoading} className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10px] rounded-lg transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer shadow-sm">
                        <ArrowRight className="w-3 h-3" /><span>Redirect Here</span>
                      </button>
                      <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${alt.latitude},${alt.longitude}&travelmode=driving`, '_blank')} className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-slate-700 cursor-pointer" title="Google Maps">
                        <MapPin className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={() => setRedirectOption(null)} className="text-xs text-slate-500 hover:text-slate-800 transition cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Queue */}
      {loading ? (
        <div className="p-8 text-center text-slate-500 text-xs">Loading incoming ambulance requests...</div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-200 p-8 rounded-2xl text-center text-slate-500 text-xs space-y-2 shadow-sm">
          <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto opacity-80" />
          <p className="font-bold text-slate-900 text-sm">No Pending Transport Requests</p>
          <p className="text-slate-500">All ambulances processed. Queue is clear.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-xs text-slate-600">
            <Activity className="w-4 h-4 text-teal-600" />
            <span className="font-semibold">Prioritized Queue — Critical first, then by arrival order</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requests.map((req, qIdx) => (
              <div key={req.id} className={`bg-white border-2 p-5 rounded-2xl space-y-3 transition-all shadow-sm ${req.status === 'Accepted' ? 'border-emerald-400 shadow-emerald-500/10' : req.status === 'Redirected' ? 'border-amber-300 opacity-70' : (urgencyRing[req.urgency_level] ?? 'border-slate-200')}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className={`w-6 h-6 rounded-full font-black text-[11px] flex items-center justify-center ${req.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}`}>
                      {qIdx + 1}
                    </span>
                    <span className="font-mono font-bold text-sm text-teal-800">Unit {req.ambulance_code}</span>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${urgencyColors[req.urgency_level] ?? ''}`}>{req.urgency_level}</span>
                  </div>
                  <div>
                    {req.status === 'Accepted' ? (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-bold">Accepted</span>
                    ) : req.status === 'Redirected' ? (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold">Redirected</span>
                    ) : (
                      <div className="flex items-center text-xs text-amber-800 font-bold bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-300">
                        <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />ETA: {req.eta_minutes} mins
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex justify-between text-slate-600">
                    <span>Patient:</span>
                    <span className="font-bold text-slate-900">{req.patient_age} yrs, {req.patient_gender}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Condition:</span>
                    <p className="font-semibold text-slate-900 mt-0.5">{req.reported_condition}</p>
                  </div>
                  {req.is_heat_illness && (
                    <div className="flex items-center space-x-1 text-amber-700 text-[11px] font-bold">
                      <Flame className="w-3.5 h-3.5 text-amber-600" /><span>Heatwave Emergency</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {req.required_capabilities?.map((cap, cIdx) => (
                    <span key={cIdx} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">{cap}</span>
                  ))}
                </div>

                {actionError[req.id] && (
                  <div className="p-2 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{actionError[req.id]}</span>
                  </div>
                )}

                {req.status === 'Requested' ? (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    {activeDeclineId === req.id ? (
                      <div className="space-y-2">
                        <input type="text" placeholder="Decline reason (e.g. ICU at capacity)..." value={declineReason} onChange={e => setDeclineReason(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-rose-500 transition" />
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => handleRespond(req.id, 'Declined', declineReason)} disabled={actionLoading[req.id]} className="py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition disabled:opacity-50 cursor-pointer shadow-sm">Decline Only</button>
                          <button onClick={() => handleDeclineAndRedirect(req)} disabled={actionLoading[req.id]} className="py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1 disabled:opacity-50 cursor-pointer shadow-sm">
                            <Navigation className="w-3.5 h-3.5" /><span>Decline + Smart Redirect</span>
                          </button>
                        </div>
                        <button onClick={() => { setActiveDeclineId(null); clearError(req.id); }} className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button onClick={() => handleRespond(req.id, 'Accepted')} disabled={actionLoading[req.id]} className="w-1/2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center space-x-1 shadow-sm shadow-emerald-600/20 disabled:opacity-50 cursor-pointer">
                          <CheckCircle className="w-4 h-4" /><span>{actionLoading[req.id] ? 'Processing...' : 'Accept Patient'}</span>
                        </button>
                        <button onClick={() => { setActiveDeclineId(req.id); clearError(req.id); }} className="w-1/2 py-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-800 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition flex items-center justify-center space-x-1 cursor-pointer">
                          <XCircle className="w-4 h-4" /><span>Decline / Redirect</span>
                        </button>
                      </div>
                    )}
                    <button onClick={() => openGoogleMaps(req)} className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-teal-700 text-[10px] font-semibold transition flex items-center justify-center space-x-1 cursor-pointer">
                      <MapPin className="w-3 h-3 text-slate-500" /><span>View Route in Google Maps</span>
                    </button>
                  </div>
                ) : req.status === 'Accepted' ? (
                  <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-xl text-center text-xs font-bold text-emerald-800 flex items-center justify-center space-x-1">
                    <CheckCircle className="w-4 h-4 text-emerald-600" /><span>Accepted — Staff Alerted</span>
                  </div>
                ) : (
                  <div className="p-2 bg-amber-100 border border-amber-300 rounded-xl text-center text-xs font-bold text-amber-800 flex items-center justify-center space-x-1">
                    <Navigation className="w-4 h-4 text-amber-600" /><span>Redirected to alternate hospital</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};