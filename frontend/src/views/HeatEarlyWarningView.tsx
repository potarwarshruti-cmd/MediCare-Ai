import React from 'react';
import type { WeatherData, HeatAlertData, HospitalData } from '../types';
import { Thermometer, Radio, CheckCircle, Clock, Building2, AlertTriangle, ArrowRight } from 'lucide-react';
import { InteractiveMap } from '../components/InteractiveMap';

interface HeatEarlyWarningViewProps {
  weather: WeatherData;
  alerts: HeatAlertData[];
  hospitals: HospitalData[];
  alertRadiusKm: number;
  onSimulateHeat: () => void;
  onNavigateScreen: (screen: string) => void;
}

export const HeatEarlyWarningView: React.FC<HeatEarlyWarningViewProps> = ({
  weather,
  alerts,
  hospitals,
  alertRadiusKm,
  onSimulateHeat,
  onNavigateScreen,
}) => {
  const hospitalsInZone = hospitals.filter(h => (h.distance_km || 0.8) <= alertRadiusKm);

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-slate-50 to-amber-500/5 border border-amber-200/80 p-6 rounded-2xl shadow-sm backdrop-blur-md">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold mb-2">
              <Radio className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>Climate Heatwave Early Warning & Geofence System</span>
            </div>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Early Warning & Automated Hospital Notification Center
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Monitors live thermal indices, calculates hospital proximity inside the <strong className="text-amber-800 font-bold">{alertRadiusKm} km</strong> alert radius, and dispatches readiness alerts.
            </p>
          </div>

          <button
            onClick={onSimulateHeat}
            className="px-4 py-2.5 bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 hover:from-rose-700 hover:to-amber-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-rose-600/20 flex items-center space-x-2 shrink-0 cursor-pointer transition-all transform hover:scale-105"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Trigger Heatwave Alert Test</span>
          </button>
        </div>
      </div>

      {/* Grid: Forecast Card & Active Alert Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weather Forecast & Risk Indicator */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm backdrop-blur-md">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <Thermometer className="w-4 h-4 mr-2 text-rose-600" />
            Live Weather & Thermal Risk Metrics
          </h3>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 shadow-inner">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600">Forecast Temperature</span>
              <span className="text-2xl font-black text-rose-600 tracking-tight">{weather.temperature_c}°C</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600">Relative Humidity</span>
              <span className="text-sm font-bold text-slate-800 font-mono">{weather.humidity_pct}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-600">Calculated Heat Index</span>
              <span className="text-sm font-bold text-amber-700 font-mono">{weather.heat_index_c}°C</span>
            </div>
            <div className="flex justify-between items-center pt-2.5 border-t border-slate-200">
              <span className="text-xs text-slate-600">Heat Risk Status</span>
              <span className={`text-xs font-extrabold px-3 py-1 rounded-lg ${
                weather.heat_risk_category === 'High Risk'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-sm'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}>
                {weather.heat_risk_category}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 space-y-1 font-mono">
            <div>Data Source: <span className="text-slate-700 font-semibold">{weather.source}</span></div>
            <div>Last Update: <span className="text-slate-700 font-semibold">{weather.last_updated}</span></div>
          </div>

          <button
            onClick={() => onNavigateScreen('demand_prediction')}
            className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-xl transition flex items-center justify-center space-x-2 shadow-sm shadow-teal-600/20 cursor-pointer"
          >
            <span>Predict Surge with AI Model</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Map View of Alert Area */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Radio className="w-4 h-4 mr-2 text-amber-600" />
              Target Alert Geofence Zone ({alertRadiusKm} km Radius)
            </h3>
            <span className="text-xs text-amber-800 font-bold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
              Hospitals in Zone: {hospitalsInZone.length}
            </span>
          </div>
          <InteractiveMap
            alertRadiusKm={alertRadiusKm}
            hospitals={hospitals}
            showWarningCircle={true}
          />
        </div>
      </div>

      {/* Alert History Table */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 flex items-center">
            <Clock className="w-4 h-4 mr-2 text-teal-600" />
            Heatwave Alert Notification History & Hospital Acknowledgements
          </h3>
          <span className="text-xs text-slate-500 font-mono">Total Logged Alerts: {alerts.length}</span>
        </div>

        {alerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200">
            No active heatwave alerts recorded. Click "Trigger Heatwave Alert Test" to test notification dispatch.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Alert ID</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Temp / Heat Index</th>
                  <th className="px-4 py-3">Alert Radius</th>
                  <th className="px-4 py-3">Notified Hospitals & Status</th>
                  <th className="px-4 py-3 rounded-r-lg">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {alerts.map(alert => (
                  <tr key={alert.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-mono font-bold text-amber-700">#{alert.id}</td>
                    <td className="px-4 py-3">
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {alert.temperature_c}°C ({alert.heat_index_c}°C HI)
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">{alert.radius_km} km</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        {alert.acknowledgements?.map((ack, idx) => (
                          <div key={idx} className="flex items-center space-x-2 text-[11px]">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-semibold text-slate-800">{ack.hospital_name}:</span>
                            {ack.acknowledged ? (
                              <span className="text-emerald-700 font-bold flex items-center">
                                <CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Acknowledged ({ack.readiness_status})
                              </span>
                            ) : (
                              <span className="text-amber-800 font-semibold bg-amber-100 border border-amber-200 px-2 py-0.5 rounded text-[10px]">Pending Acknowledge</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-[10px]">{alert.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


