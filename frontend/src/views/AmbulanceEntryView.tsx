import React, { useState, useEffect } from 'react';
import {
  Ambulance, MapPin, AlertTriangle, Send, CheckCircle, Flame,
  Activity, Loader2, ShieldAlert, RefreshCw, WifiOff, Crosshair, Info
} from 'lucide-react';
import { api } from '../services/api';
import { useGeolocation } from '../hooks/useGeolocation';

interface AmbulanceEntryViewProps {
  onCreatedRequest: (
    reqId: number,
    ambulanceLat: number,
    ambulanceLng: number,
    caps: string[],
    urgency: string,
    isHeat: boolean
  ) => void;
}

export const AmbulanceEntryView: React.FC<AmbulanceEntryViewProps> = ({ onCreatedRequest }) => {
  const geo = useGeolocation();

  const [vehicleCode, setVehicleCode] = useState('AMB-101');
  const [age, setAge] = useState<number>(62);
  const [gender, setGender] = useState('Male');
  const [condition, setCondition] = useState('');
  const [urgency, setUrgency] = useState('Critical');
  const [isHeat, setIsHeat] = useState(false);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Auto-request GPS on mount
  useEffect(() => {
    geo.requestLocation();
  }, []);

  const toggleCapability = (cap: string) => {
    setCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  };

  const conditionPresets = [
    'Severe Heat Stroke, Core Temp >40°C, Confusion, Dehydration',
    'Heat Exhaustion, Dizziness, High Pulse, Low BP',
    'Cardiac Emergency, Severe Chest Pain, Shortness of Breath',
    'Trauma & Fracture Emergency, Active Bleeding',
    'Stroke, Sudden Facial Drooping, Slurred Speech',
    'Respiratory Distress, Oxygen Saturation <90%',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (geo.status !== 'success' || !geo.coords) {
      setSubmitError('GPS location is required to dispatch. Please enable location and retry.');
      return;
    }

    if (!condition.trim()) {
      setSubmitError('Please describe the patient\'s reported condition.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.createEmergencyRequest({
        ambulance_code: vehicleCode,
        current_lat: geo.coords.latitude,
        current_lng: geo.coords.longitude,
        patient_age: age,
        patient_gender: gender,
        reported_condition: condition,
        urgency_level: urgency,
        is_heat_illness: isHeat,
        required_capabilities: capabilities,
      });

      setSuccessMsg(true);
      setTimeout(() => {
        setSuccessMsg(false);
        onCreatedRequest(
          res.request_id,
          geo.coords!.latitude,
          geo.coords!.longitude,
          capabilities,
          urgency,
          isHeat
        );
      }, 800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred. Check backend connection.';
      setSubmitError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ─── GPS Status Panel ───────────────────────────────────────────────────────
  const renderGpsPanel = () => {
    switch (geo.status) {
      case 'idle':
        return (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-600">
              <Crosshair className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-semibold">GPS not yet acquired</span>
            </div>
            <button
              type="button"
              onClick={geo.requestLocation}
              className="px-3 py-1.5 bg-teal-600 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-teal-700 transition flex items-center space-x-1"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Get My Location</span>
            </button>
          </div>
        );

      case 'requesting':
        return (
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex items-center space-x-3">
            <Loader2 className="w-5 h-5 text-sky-600 animate-spin shrink-0" />
            <div>
              <p className="text-xs font-bold text-sky-900">Acquiring GPS Location…</p>
              <p className="text-[10px] text-sky-700 mt-0.5">
                Please accept the location permission prompt in your browser.
              </p>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-emerald-900">Live GPS Location Acquired</span>
              </div>
              <button
                type="button"
                onClick={geo.requestLocation}
                title="Refresh GPS"
                className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-600 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div className="bg-white border border-emerald-200 rounded-lg p-2 text-center">
                <span className="text-slate-500 text-[9px] block">LATITUDE</span>
                <span className="font-extrabold text-slate-900">{geo.coords!.latitude.toFixed(5)}</span>
              </div>
              <div className="bg-white border border-emerald-200 rounded-lg p-2 text-center">
                <span className="text-slate-500 text-[9px] block">LONGITUDE</span>
                <span className="font-extrabold text-slate-900">{geo.coords!.longitude.toFixed(5)}</span>
              </div>
              <div className="bg-white border border-emerald-200 rounded-lg p-2 text-center">
                <span className="text-slate-500 text-[9px] block">ACCURACY</span>
                <span className="font-extrabold text-slate-900">±{Math.round(geo.coords!.accuracy)}m</span>
              </div>
            </div>
          </div>
        );

      case 'denied':
        return (
          <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-2">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="text-xs font-bold text-rose-900">Location Permission Denied</span>
            </div>
            <p className="text-[11px] text-rose-700">{geo.errorMessage}</p>
            <p className="text-[10px] text-rose-600 bg-rose-100 rounded-lg p-2 border border-rose-200">
              <strong>How to fix:</strong> Click the lock/info icon in your browser's address bar → Site settings → Location → Allow → Refresh this page.
            </p>
            <button
              type="button"
              onClick={geo.requestLocation}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center justify-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Location Request</span>
            </button>
          </div>
        );

      case 'unavailable':
      case 'timeout':
      case 'error':
        return (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
            <div className="flex items-center space-x-2">
              <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="text-xs font-bold text-amber-900">
                {geo.status === 'timeout' ? 'Location Request Timed Out' : 'Location Unavailable'}
              </span>
            </div>
            <p className="text-[11px] text-amber-800">{geo.errorMessage}</p>
            <button
              type="button"
              onClick={geo.requestLocation}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer transition flex items-center justify-center space-x-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry GPS</span>
            </button>
          </div>
        );
    }
  };

  const gpsReady = geo.status === 'success' && geo.coords != null;

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Mobile PWA Card Header */}
      <div className="bg-gradient-to-r from-teal-600 to-emerald-600 p-5 rounded-2xl shadow-md text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold backdrop-blur-md">
            <Ambulance className="w-3.5 h-3.5" />
            <span>DRIVER DISPATCH APP</span>
          </div>
          <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-white/10 text-teal-100 text-[10px] font-semibold">
            <Info className="w-3 h-3" />
            <span>Real GPS Required</span>
          </div>
        </div>
        <h2 className="text-xl font-black tracking-tight">New Patient Dispatch Request</h2>
        <p className="text-xs text-teal-100 mt-0.5">
          Submit patient details for smart hospital ranking with your live GPS location.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-5 rounded-2xl space-y-5 shadow-sm">

        {/* ── GPS Location Panel ── */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-1.5">
            <MapPin className="w-4 h-4 text-teal-600" />
            <span>Ambulance GPS Location</span>
          </label>
          {renderGpsPanel()}
        </div>

        {/* ── Vehicle Code ── */}
        <div className="space-y-1.5 pt-3 border-t border-slate-200">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
            Ambulance Unit ID
          </label>
          <input
            type="text"
            value={vehicleCode}
            onChange={e => setVehicleCode(e.target.value)}
            className="w-full h-11 bg-slate-50 border border-slate-300 rounded-xl px-3 text-xs font-mono font-bold text-teal-800 focus:bg-white focus:border-teal-500 transition text-center"
            required
          />
        </div>

        {/* ── Patient Triage ── */}
        <div className="space-y-3 pt-3 border-t border-slate-200">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
            <Activity className="w-4 h-4 mr-1.5 text-rose-600" />
            Patient Clinical Triage
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">Patient Age</span>
              <div className="flex items-center h-11 bg-slate-50 border border-slate-300 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setAge(Math.max(1, age - 1))}
                  className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 font-black text-sm flex items-center justify-center cursor-pointer active:scale-95"
                >-</button>
                <span className="flex-1 text-center font-extrabold text-sm text-slate-900">{age}</span>
                <button
                  type="button"
                  onClick={() => setAge(age + 1)}
                  className="w-9 h-9 bg-white border border-slate-300 rounded-lg text-slate-700 font-black text-sm flex items-center justify-center cursor-pointer active:scale-95"
                >+</button>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-500 font-semibold block mb-1">Gender</span>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full h-11 bg-slate-50 border border-slate-300 rounded-xl px-3 text-xs font-bold text-slate-900 focus:bg-white focus:border-slate-400 cursor-pointer"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Urgency */}
          <div>
            <span className="text-[10px] text-slate-500 font-semibold block mb-1">Urgency Triage Level</span>
            <div className="grid grid-cols-2 gap-1.5">
              {['Critical', 'High', 'Medium', 'Low'].map(u => (
                <button
                  type="button"
                  key={u}
                  onClick={() => setUrgency(u)}
                  className={`h-11 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                    urgency === u
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {u}{u === 'Critical' ? ' (Trauma/ICU)' : u === 'High' ? ' (Heat Risk)' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div>
            <span className="text-[10px] text-slate-500 font-semibold block mb-1">Reported Condition / Symptoms</span>
            <textarea
              rows={2}
              value={condition}
              onChange={e => setCondition(e.target.value)}
              placeholder="Describe the patient's symptoms and condition..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs text-slate-900 font-medium focus:bg-white focus:border-teal-500 transition"
              required
            />
            <div className="space-y-1 mt-1.5">
              <span className="text-[10px] text-slate-400 font-semibold block">Quick Condition Presets:</span>
              <div className="flex flex-wrap gap-1">
                {conditionPresets.map((preset, pIdx) => (
                  <button
                    type="button"
                    key={pIdx}
                    onClick={() => setCondition(preset)}
                    className="px-2 py-1 bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-200 rounded-lg text-[10px] font-medium transition cursor-pointer text-left"
                  >
                    {preset.split(',')[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Heat Emergency */}
          <label className="flex items-center space-x-3 p-3 bg-amber-50 border border-amber-300 rounded-xl cursor-pointer hover:bg-amber-100 transition">
            <input
              type="checkbox"
              checked={isHeat}
              onChange={e => setIsHeat(e.target.checked)}
              className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
            />
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="text-xs font-bold text-amber-900">
                Suspected Heat Stroke / Extreme Heat Emergency
              </span>
            </div>
          </label>
        </div>

        {/* ── Required Capabilities ── */}
        <div className="space-y-2 pt-3 border-t border-slate-200">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
            Required Hospital Capabilities
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { key: 'trauma', label: 'Trauma Emergency' },
              { key: 'icu', label: 'ICU / Ventilator' },
              { key: 'heat_cooling', label: 'Heat Cooling Ward' },
              { key: 'cardiac', label: 'Cardiac Care Unit' },
              { key: 'pediatric', label: 'Pediatric Care' },
              { key: 'burn', label: 'Burn Specialty' },
            ].map(item => {
              const active = capabilities.includes(item.key);
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => toggleCapability(item.key)}
                  className={`h-11 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center justify-between ${
                    active
                      ? 'bg-teal-100 text-teal-900 border-teal-300 shadow-xs'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{item.label}</span>
                  {active ? <span className="text-teal-700 font-extrabold text-sm">✓</span> : <span className="text-slate-300">+</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── GPS Required Warning ── */}
        {!gpsReady && (
          <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>GPS location is required</strong> before submitting a dispatch request. Acquire your location above first.
            </span>
          </div>
        )}

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={loading || !gpsReady}
          className="w-full h-14 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md shadow-teal-600/20 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98]"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 text-teal-200 animate-spin" />
              <span>Transmitting Dispatch Request…</span>
            </>
          ) : (
            <>
              <Send className="w-5 h-5 text-teal-200" />
              <span>Search & Rank Nearby Hospitals</span>
            </>
          )}
        </button>

        {submitError && (
          <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs font-medium text-rose-800 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{submitError}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-center text-xs font-bold text-emerald-800 flex items-center justify-center space-x-2 animate-pulse">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span>Dispatch Request Transmitted Live!</span>
          </div>
        )}
      </form>
    </div>
  );
};
