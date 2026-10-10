import React, { useState } from 'react';
import type { HospitalData, HeatAlertData } from '../types';
import { Building2, CheckSquare, ShieldCheck, AlertCircle, CheckCircle, RefreshCw, MapPin } from 'lucide-react';
import { api } from '../services/api';

interface HospitalPreparednessViewProps {
  hospital: HospitalData;
  allHospitals?: HospitalData[];
  onSelectHospital?: (hospital: HospitalData) => void;
  activeAlert: HeatAlertData | null;
  onUpdateResources: (resources: any) => void;
  onNavigateScreen: (screen: string) => void;
}

export const HospitalPreparednessView: React.FC<HospitalPreparednessViewProps> = ({
  hospital,
  allHospitals = [],
  onSelectHospital,
  activeAlert,
  onUpdateResources,
  onNavigateScreen
}) => {
  const [beds, setBeds] = useState(hospital.resources?.available_staffed_beds || 25);
  const [icu, setIcu] = useState(hospital.resources?.available_icu_beds || 5);
  const [doctors, setDoctors] = useState(hospital.resources?.available_doctors || 12);
  const [nurses, setNurses] = useState(hospital.resources?.available_nurses || 30);
  const [cooling, setCooling] = useState(hospital.resources?.available_cooling_beds || 8);
  const [readinessStatus, setReadinessStatus] = useState<string>(
    hospital.resources?.readiness_status || 'Ready'
  );

  const [checklist, setChecklist] = useState({
    beds: true,
    staffing: true,
    stock: true,
    equipment: true,
    replenishmentSubmitted: true
  });

  const [saved, setSaved] = useState(false);

  const handleSavePreparedness = async () => {
    const updated = {
      available_staffed_beds: beds,
      available_icu_beds: icu,
      available_doctors: doctors,
      available_nurses: nurses,
      available_cooling_beds: cooling,
      readiness_status: readinessStatus
    };

    try {
      await api.updateHospitalResources(hospital.id, updated);
      onUpdateResources(updated);
    } catch (err) {
      console.error('Failed to update hospital resources', err);
      onUpdateResources(updated);
    }

    if (activeAlert) {
      try {
        await api.acknowledgeHeatAlert(activeAlert.id, {
          hospital_id: hospital.id,
          readiness_status: readinessStatus,
          checklist_status: checklist
        });
      } catch (err) {
        console.error('Failed to acknowledge alert', err);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const isFullyChecked = Object.values(checklist).every(Boolean);

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header with Hospital Selector */}
      <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-sm min-w-0 max-w-full">
        <div className="min-w-0 max-w-full flex-1 space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-100 border border-teal-300 text-teal-800 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <span>Hospital Staff Readiness Workstation</span>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 max-w-full min-w-0">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 break-words min-w-0">
              {hospital.name}
            </h2>
            {allHospitals.length > 1 && onSelectHospital && (
              <select
                value={hospital.id}
                onChange={e => {
                  const selected = allHospitals.find(h => h.id === Number(e.target.value));
                  if (selected) onSelectHospital(selected);
                }}
                className="h-9 bg-teal-50 border border-teal-300 text-teal-900 font-bold text-xs rounded-xl px-3 cursor-pointer focus:outline-none w-full sm:w-auto max-w-full sm:max-w-xs md:max-w-sm truncate"
              >
                {allHospitals.map(h => (
                  <option key={h.id} value={h.id}>
                    Switch to: {h.name} ({h.address})
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 break-words">
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Address: <strong className="text-slate-800 font-semibold break-words">{hospital.address}</strong></span>
            </span>
            <span className="hidden sm:inline text-slate-400">•</span>
            <span className="font-mono text-slate-600 shrink-0">
              {hospital.latitude.toFixed(4)}°, {hospital.longitude.toFixed(4)}°
            </span>
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 max-w-full w-full lg:w-auto">
          <button
            onClick={() => onNavigateScreen('data_integration')}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-md flex items-center justify-center space-x-1 whitespace-nowrap"
          >
            <span>ERP & File Integration Hub</span>
          </button>
          <button
            onClick={() => onNavigateScreen('incoming_ambulances')}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition cursor-pointer shadow-sm whitespace-nowrap"
          >
            Incoming Ambulances
          </button>
          <button
            onClick={() => onNavigateScreen('inventory_management')}
            className="flex-1 sm:flex-initial px-3.5 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl text-xs font-bold hover:bg-teal-100 transition cursor-pointer shadow-sm whitespace-nowrap"
          >
            Review Stock & Inventory
          </button>
        </div>
      </div>

      {/* Active Heat Alert Warning Box */}
      {activeAlert && (
        <div className="bg-gradient-to-r from-amber-50 via-rose-50 to-amber-50 border border-amber-300 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm min-w-0 max-w-full">
          <div className="flex items-start space-x-3 min-w-0">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block break-words">
                ACTIVE HEATWAVE WARNING IN EFFECT (#{activeAlert.id})
              </span>
              <p className="text-sm font-bold text-slate-900 mt-0.5 break-words">
                Forecast Temp {activeAlert.temperature_c}°C (Heat Index {activeAlert.heat_index_c}°C) within {activeAlert.radius_km} km alert zone.
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <span className="text-xs font-bold text-teal-800 bg-teal-100 px-3 py-1 rounded-full border border-teal-300 inline-block">
              Hospital Alert Acknowledged
            </span>
          </div>
        </div>
      )}

      {/* Main Grid: Resource Update & Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0 max-w-full">
        {/* Left: Capacity Editor */}
        <div className="bg-white border border-slate-200 p-5 sm:p-6 rounded-2xl space-y-4 shadow-sm min-w-0 max-w-full">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <RefreshCw className="w-4 h-4 mr-2 text-teal-600" />
            Live Capacity & Staff Availability Editor
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Available Staffed Beds</label>
              <input
                type="number"
                value={beds}
                onChange={e => setBeds(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-teal-700 focus:bg-white focus:border-teal-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Available ICU Beds</label>
              <input
                type="number"
                value={icu}
                onChange={e => setIcu(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-rose-700 focus:bg-white focus:border-rose-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Available Doctors</label>
              <input
                type="number"
                value={doctors}
                onChange={e => setDoctors(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-slate-400 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Available Nurses</label>
              <input
                type="number"
                value={nurses}
                onChange={e => setNurses(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:bg-white focus:border-slate-400 transition"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cooling Ward Beds Available</label>
              <input
                type="number"
                value={cooling}
                onChange={e => setCooling(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-amber-700 focus:bg-white focus:border-amber-500 transition"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Hospital Overall Readiness Status</label>
              <select
                value={readinessStatus}
                onChange={e => setReadinessStatus(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:bg-white focus:border-teal-500 transition"
              >
                <option value="Ready">Ready (Normal Operations & Surge Prep)</option>
                <option value="Preparing">Preparing (Prepping Beds & Staffing Call-in)</option>
                <option value="Constrained">Constrained (High Occupancy / Diversion Warning)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Right: Preparedness Checklist */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <CheckSquare className="w-4 h-4 mr-2 text-emerald-600" />
              Hospital Heatwave Preparedness Checklist
            </h3>
            {isFullyChecked && (
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                Checklist 100% Complete
              </span>
            )}
          </div>

          <div className="space-y-3 text-xs">
            <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={checklist.beds}
                onChange={e => setChecklist({ ...checklist, beds: e.target.checked })}
                className="w-4 h-4 accent-teal-600 rounded"
              />
              <span className="text-slate-800 font-medium">Bed & ICU capacity reviewed and reserved for heat stroke emergencies</span>
            </label>

            <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={checklist.staffing}
                onChange={e => setChecklist({ ...checklist, staffing: e.target.checked })}
                className="w-4 h-4 accent-teal-600 rounded"
              />
              <span className="text-slate-800 font-medium">Emergency physician & nursing shift coverage confirmed</span>
            </label>

            <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={checklist.stock}
                onChange={e => setChecklist({ ...checklist, stock: e.target.checked })}
                className="w-4 h-4 accent-teal-600 rounded"
              />
              <span className="text-slate-800 font-medium">Essential stock checked (IV fluids 0.9% NS, ORS, ice packs)</span>
            </label>

            <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={checklist.equipment}
                onChange={e => setChecklist({ ...checklist, equipment: e.target.checked })}
                className="w-4 h-4 accent-teal-600 rounded"
              />
              <span className="text-slate-800 font-medium">Hydrogel cooling blankets & rehydration equipment operational</span>
            </label>

            <label className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-100 transition">
              <input
                type="checkbox"
                checked={checklist.replenishmentSubmitted}
                onChange={e => setChecklist({ ...checklist, replenishmentSubmitted: e.target.checked })}
                className="w-4 h-4 accent-teal-600 rounded"
              />
              <span className="text-slate-800 font-medium">Replenishment request submitted for shortage items</span>
            </label>
          </div>

          <button
            onClick={handleSavePreparedness}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center space-x-2 shadow-sm shadow-emerald-600/20 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Confirm Preparedness & Sync Database</span>
          </button>

          {saved && (
            <div className="p-2 bg-emerald-100 border border-emerald-300 rounded-xl text-center text-xs font-bold text-emerald-800 flex items-center justify-center space-x-1">
              <CheckCircle className="w-4 h-4" />
              <span>Preparedness Status Confirmed & Broadcasted!</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
