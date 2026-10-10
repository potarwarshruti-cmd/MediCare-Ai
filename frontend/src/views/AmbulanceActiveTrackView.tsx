import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { wsService } from '../services/websocket';
import {
  Ambulance, Navigation, PhoneCall, CheckCircle, AlertTriangle, Clock,
  MapPin, Building2, RefreshCw, Wifi, WifiOff, HeartPulse
} from 'lucide-react';

interface AmbulanceActiveTrackViewProps {
  requestId: number | null;
  ambulanceLat: number;
  ambulanceLng: number;
  onNavigateScreen: (screen: string) => void;
}

export const AmbulanceActiveTrackView: React.FC<AmbulanceActiveTrackViewProps> = ({
  requestId,
  ambulanceLat,
  ambulanceLng,
  onNavigateScreen,
}) => {
  const [requestData, setRequestData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);

  const fetchRequestDetails = async () => {
    if (!requestId) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.getEmergencyRequest(requestId);
      setRequestData(data);
    } catch (err) {
      console.warn('Could not fetch specific request details, using active state', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequestDetails();

    const checkConn = () => setWsConnected(wsService.isConnected);
    const interval = setInterval(checkConn, 1500);

    const unsub = wsService.subscribe((msg) => {
      if (
        msg.type === 'ambulance_request_updated' ||
        msg.type === 'request_redirected'
      ) {
        if (!requestId || (msg.data && msg.data.request_id === requestId)) {
          fetchRequestDetails();
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [requestId]);

  const openGoogleMapsNav = (hospitalLat?: number, hospitalLng?: number, hospitalName?: string, address?: string) => {
    let dest = '';
    if (hospitalLat && hospitalLng) {
      dest = `${hospitalLat},${hospitalLng}`;
    } else if (address) {
      dest = encodeURIComponent(address);
    } else if (hospitalName) {
      dest = encodeURIComponent(hospitalName);
    }

    if (!dest) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${ambulanceLat},${ambulanceLng}&destination=${dest}&travelmode=driving`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 text-xs font-semibold bg-white rounded-2xl border border-slate-200 shadow-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
        Syncing live ambulance transport tracking...
      </div>
    );
  }

  if (!requestId || !requestData) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm space-y-4 max-w-md mx-auto">
        <div className="w-14 h-14 bg-teal-50 border border-teal-200 rounded-full flex items-center justify-center mx-auto text-teal-600">
          <Ambulance className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">No Active Transport Request</h3>
          <p className="text-xs text-slate-600 mt-1">Submit a new patient dispatch request to start live GPS routing and hospital capacity reservation.</p>
        </div>
        <button
          onClick={() => onNavigateScreen('ambulance_entry')}
          className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center space-x-2"
        >
          <Ambulance className="w-4 h-4" />
          <span>New Dispatch Request</span>
        </button>
      </div>
    );
  }

  const isAccepted = requestData.status === 'Accepted';
  const isDeclined = requestData.status === 'Declined';
  const isRedirected = requestData.status === 'Redirected';
  const isRequested = requestData.status === 'Requested';

  const destName = requestData.destination_hospital_name || requestData.hospital?.name || 'Selected Hospital';
  const destAddress = requestData.hospital?.address || 'Medical Enclave District';
  const phone = requestData.hospital?.contact_phone || '+1-800-555-0199';

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* Mobile App Shell Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-100 border border-teal-300 text-teal-800 flex items-center justify-center font-bold">
            <Ambulance className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm text-slate-900 font-mono">Unit {requestData.ambulance_code}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-50 text-teal-700 border border-teal-200">ACTIVE DISPATCH</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Req #{requestData.id} • Lat {ambulanceLat.toFixed(3)}, Lng {ambulanceLng.toFixed(3)}</span>
          </div>
        </div>

        <div className={`flex items-center space-x-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${
          wsConnected ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-300 text-slate-600'
        }`}>
          {wsConnected ? <Wifi className="w-3 h-3 text-emerald-600" /> : <WifiOff className="w-3 h-3" />}
          <span>{wsConnected ? 'LIVE' : 'SYNCING'}</span>
        </div>
      </div>

      {/* Primary Real-time Status Card */}
      <div className={`p-5 rounded-2xl border-2 shadow-sm space-y-4 ${
        isAccepted ? 'bg-emerald-50/70 border-emerald-400' :
        isDeclined ? 'bg-rose-50/70 border-rose-400' :
        isRedirected ? 'bg-amber-50/70 border-amber-400' :
        'bg-sky-50/70 border-sky-400'
      }`}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
              isAccepted ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
              isDeclined ? 'bg-rose-100 text-rose-800 border-rose-300' :
              isRedirected ? 'bg-amber-100 text-amber-900 border-amber-300' :
              'bg-sky-100 text-sky-800 border-sky-300'
            }`}>
              {isAccepted ? '✓ TRANSPORT ACCEPTED & CONFIRMED' :
               isDeclined ? '⚠️ DECLINED BY HOSPITAL' :
               isRedirected ? '↗️ PATIENT REDIRECTED' :
               '⌛ TRANSPORT REQUEST SENT — AWAITING RESPONSE'}
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight pt-1">
              {destName}
            </h2>
            <p className="text-xs text-slate-600 flex items-center">
              <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
              {destAddress}
            </p>
          </div>

          <div className="text-right shrink-0">
            <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
              {requestData.eta_minutes || 5} <span className="text-xs font-bold text-slate-500">min</span>
            </div>
            <span className="text-[10px] text-slate-500 uppercase font-semibold">Estimated Travel ETA</span>
          </div>
        </div>

        {/* Live Status Explainer */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 leading-relaxed font-medium shadow-inner">
          {isAccepted && (
            <div className="flex items-start space-x-2 text-emerald-800">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Hospital bed & clinical trauma team have been reserved. Proceed directly to Emergency Department bay.</span>
            </div>
          )}
          {isDeclined && (
            <div className="flex items-start space-x-2 text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{requestData.decline_reason || 'Hospital at full capacity.'} Please tap below to view alternate ranked hospitals.</span>
            </div>
          )}
          {isRedirected && (
            <div className="flex items-start space-x-2 text-amber-900">
              <Navigation className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Patient rerouted to {destName} for optimal care capabilities and bed availability.</span>
            </div>
          )}
          {isRequested && (
            <div className="flex items-start space-x-2 text-sky-900">
              <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
              <span>Request transmitted to hospital ER workstation via WebSockets. Awaiting staff confirmation...</span>
            </div>
          )}
        </div>

        {/* ONE-TAP GOOGLE MAPS NAVIGATION & EMERGENCY CALL BUTTONS */}
        <div className="space-y-2 pt-1">
          <button
            onClick={() => openGoogleMapsNav(requestData.hospital?.latitude, requestData.hospital?.longitude, destName, destAddress)}
            className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-sm rounded-xl shadow-md shadow-teal-600/20 transition flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
          >
            <Navigation className="w-5 h-5 text-teal-200" />
            <span>Launch Google Maps Turn-by-Turn Nav</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${phone}`}
              className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <PhoneCall className="w-4 h-4 text-emerald-600" />
              <span>Call Hospital ER</span>
            </a>

            <button
              onClick={() => onNavigateScreen('hospital_map')}
              className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Building2 className="w-4 h-4 text-teal-600" />
              <span>Change Hospital</span>
            </button>
          </div>
        </div>
      </div>

      {/* Patient Triage Summary */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl space-y-2.5 shadow-sm">
        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center">
            <HeartPulse className="w-4 h-4 mr-1.5 text-rose-600" />
            Patient Triage Summary
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            {requestData.urgency_level || 'Critical'}
          </span>
        </h4>

        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700">
          <div>
            <span className="text-slate-500 text-[10px] block">Patient Profile:</span>
            <span className="font-bold text-slate-900">{requestData.patient_age} y/o {requestData.patient_gender}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] block">Heat Illness Suspected:</span>
            <span className="font-bold text-amber-700">{requestData.is_heat_illness ? 'Yes (Heat Stroke)' : 'No'}</span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-500 text-[10px] block">Condition Note:</span>
            <span className="font-medium text-slate-800">{requestData.reported_condition}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
