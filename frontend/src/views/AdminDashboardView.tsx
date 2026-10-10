import React, { useState } from 'react';
import type { SystemConfigData, WeatherData, HospitalData, HeatAlertData } from '../types';
import {
  Settings, Thermometer, ShieldAlert, Radio, Building2, Save,
  RefreshCw, CheckCircle, Flame, Activity, Zap, MapPin, Loader2,
  AlertTriangle, Crosshair, Wifi
} from 'lucide-react';
import { InteractiveMap } from '../components/InteractiveMap';

interface AdminDashboardViewProps {
  config: SystemConfigData;
  weather: WeatherData;
  hospitals: HospitalData[];
  alerts: HeatAlertData[];
  userCoords: { latitude: number; longitude: number } | null;
  geoStatus: string;
  geoErrorMessage: string | null;
  onRequestGps: () => void;
  liveWeatherStatus: string;
  liveWeatherError: string | null;
  onUpdateConfig: (newConfig: Partial<SystemConfigData>) => void;
  onSimulateWeather: (temp: number, humidity: number) => void;
  onNavigateScreen: (screen: string) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  config,
  weather,
  hospitals,
  alerts,
  userCoords,
  geoStatus,
  geoErrorMessage,
  onRequestGps,
  liveWeatherStatus,
  liveWeatherError,
  onUpdateConfig,
  onSimulateWeather,
  onNavigateScreen,
}) => {
  const [warningTemp, setWarningTemp] = useState(config.warning_temp_threshold_c);
  const [highRiskTemp, setHighRiskTemp] = useState(config.high_risk_temp_threshold_c);
  const [radiusKm, setRadiusKm] = useState(config.alert_radius_km);
  const [simTemp, setSimTemp] = useState(42.5);
  const [simHum, setSimHum] = useState(70.0);
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSaveConfig = () => {
    onUpdateConfig({
      warning_temp_threshold_c: warningTemp,
      high_risk_temp_threshold_c: highRiskTemp,
      alert_radius_km: radiusKm,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const centerLat = userCoords?.latitude ?? config.center_latitude;
  const centerLng = userCoords?.longitude ?? config.center_longitude;

  const hospitalsInRadius = hospitals.filter(h => (h.distance_km || 0.8) <= radiusKm);
  const readyHospitals = hospitals.filter(h => h.resources?.readiness_status === 'Ready');
  const readinessPct = Math.round((readyHospitals.length / (hospitals.length || 1)) * 100);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/20 border border-teal-400/40 text-teal-300 text-xs font-bold mb-2">
              <Zap className="w-3.5 h-3.5 text-teal-300" />
              <span>Administrator Command Dashboard</span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              Regional Heatwave Emergency & Hospital Operations Control
            </h2>
            <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-2">
              <span>Monitored Zone: <strong className="text-white font-bold">{config.monitored_area_name}</strong></span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-slate-300">
                Lat: {centerLat.toFixed(4)}, Lng: {centerLng.toFixed(4)}
              </span>
              {userCoords && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold">
                  ✓ Live Browser GPS Active
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => onNavigateScreen('heat_warning')}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-amber-500/20 text-amber-200 border border-amber-400/40 hover:bg-amber-500/30 transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
            >
              <ShieldAlert className="w-4 h-4 text-amber-300" />
              <span>Active Heat Alerts ({alerts.length})</span>
            </button>
            <button
              onClick={() => onNavigateScreen('demand_prediction')}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-teal-500 hover:bg-teal-600 text-slate-950 transition-all flex items-center space-x-2 shadow-md cursor-pointer"
            >
              <Flame className="w-4 h-4" />
              <span>AI Surge Predictor</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── GPS & Live Weather Status Bar ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GPS Control Card */}
        <div className={`p-4 rounded-2xl border transition-all ${
          geoStatus === 'success'
            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
            : geoStatus === 'denied'
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Crosshair className={`w-4 h-4 ${geoStatus === 'success' ? 'text-emerald-600' : 'text-slate-500'}`} />
              <span className="text-xs font-bold uppercase tracking-wider">Device GPS Location</span>
            </div>
            <button
              onClick={onRequestGps}
              className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{geoStatus === 'requesting' ? 'Acquiring...' : 'Use My GPS'}</span>
            </button>
          </div>

          <div className="mt-2 text-xs">
            {geoStatus === 'requesting' && (
              <div className="flex items-center space-x-2 text-sky-700">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Requesting location permission from browser...</span>
              </div>
            )}
            {geoStatus === 'success' && userCoords && (
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-emerald-800 mt-1">
                <span>📍 Lat: {userCoords.latitude.toFixed(5)}°</span>
                <span>Lng: {userCoords.longitude.toFixed(5)}°</span>
                <span className="text-emerald-700">Live GPS</span>
              </div>
            )}
            {geoStatus === 'denied' && (
              <div className="space-y-1 mt-1 text-rose-800">
                <p className="font-semibold flex items-center">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600 shrink-0" />
                  Location permission denied. Click address bar lock icon to grant permission.
                </p>
                {geoErrorMessage && <p className="text-[10px] text-rose-600">{geoErrorMessage}</p>}
              </div>
            )}
            {geoStatus === 'idle' && (
              <p className="text-[11px] text-slate-500 mt-1">
                Click "Use My GPS" to update center coordinates & nearby hospitals to your device location.
              </p>
            )}
          </div>
        </div>

        {/* Live Weather Status Card */}
        <div className={`p-4 rounded-2xl border transition-all ${
          liveWeatherStatus === 'success'
            ? 'bg-sky-50/80 border-sky-300 text-sky-950'
            : liveWeatherStatus === 'error'
            ? 'bg-rose-50 border-rose-300 text-rose-950'
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Wifi className={`w-4 h-4 ${liveWeatherStatus === 'success' ? 'text-sky-600' : 'text-slate-500'}`} />
              <span className="text-xs font-bold uppercase tracking-wider">Open-Meteo Real Weather Feed</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
              {weather.source}
            </span>
          </div>

          <div className="mt-2 text-xs">
            {liveWeatherStatus === 'loading' && (
              <div className="flex items-center space-x-2 text-sky-700">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Fetching real-time weather metrics from Open-Meteo API...</span>
              </div>
            )}
            {liveWeatherStatus === 'error' && (
              <div className="space-y-1 text-rose-800">
                <p className="font-semibold flex items-center">
                  <AlertTriangle className="w-3.5 h-3.5 mr-1 text-rose-600 shrink-0" />
                  Live Weather API Error
                </p>
                <p className="text-[10px] text-rose-600">{liveWeatherError}</p>
              </div>
            )}
            {liveWeatherStatus === 'success' && (
              <div className="flex items-center justify-between text-[11px] font-mono text-sky-900 mt-1">
                <span>Temp: <strong className="text-rose-600">{weather.temperature_c}°C</strong></span>
                <span>Humidity: <strong className="text-slate-900">{weather.humidity_pct}%</strong></span>
                <span>Heat Index: <strong className="text-amber-700">{weather.heat_index_c}°C</strong></span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forecast Temperature</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center">
              <Thermometer className="w-5 h-5 text-rose-600" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 mt-3 tracking-tight">
            {weather.temperature_c}°C
          </div>
          <div className="flex items-center space-x-2 mt-2">
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-md ${
              weather.heat_risk_category === 'High Risk'
                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
            }`}>
              {weather.heat_risk_category}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Heat Index: {weather.heat_index_c}°C</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Alert Geofence Radius</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
              <Radio className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <div className="text-3xl font-black text-amber-600 mt-3 tracking-tight">
            {radiusKm} km
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            <strong className="text-slate-900 font-extrabold">{hospitalsInRadius.length}</strong> of {hospitals.length} hospitals inside zone
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hospital Readiness</span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-teal-600" />
            </div>
          </div>
          <div className="text-3xl font-black text-teal-700 mt-3 tracking-tight">
            {readyHospitals.length} <span className="text-lg font-bold text-slate-400">/ {hospitals.length}</span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden border border-slate-200">
            <div className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full" style={{ width: `${readinessPct}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 shadow-sm hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Risk Threshold</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="text-3xl font-black text-purple-700 mt-3 tracking-tight">
            {highRiskTemp}°C
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            Early Warning Trigger at <span className="text-amber-600 font-bold">{warningTemp}°C</span>
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Regional Map */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Activity className="w-4 h-4 mr-2 text-rose-600 animate-pulse" />
              Regional Hospital & Geofenced Heatwave Monitoring Map
            </h3>
            <span className="text-[11px] font-mono font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
              Live GIS Telemetry
            </span>
          </div>
          <InteractiveMap
            centerLat={centerLat}
            centerLng={centerLng}
            alertRadiusKm={radiusKm}
            hospitals={hospitals}
            showWarningCircle={true}
          />
        </div>

        {/* Right Col: Admin Controls & Simulator */}
        <div className="space-y-6">
          {/* Threshold Config Box */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <Settings className="w-4 h-4 mr-2 text-teal-600" />
              System Threshold & Radius Settings
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Warning Threshold (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={warningTemp}
                  onChange={e => setWarningTemp(parseFloat(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-amber-700 focus:outline-none focus:border-amber-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  High Risk Threshold (°C)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={highRiskTemp}
                  onChange={e => setHighRiskTemp(parseFloat(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-rose-700 focus:outline-none focus:border-rose-500 focus:bg-white transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex justify-between">
                  <span>Alert Geofence Radius (km)</span>
                  <span className="text-teal-700 font-mono font-extrabold">{radiusKm} km</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.1"
                  value={radiusKm}
                  onChange={e => setRadiusKm(parseFloat(e.target.value))}
                  className="w-full accent-teal-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono font-bold">
                  <span>0.5 km</span>
                  <span className="text-teal-700">1.5 km (Default)</span>
                  <span>5.0 km</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveConfig}
              className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-xl transition flex items-center justify-center space-x-2 shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save System Thresholds</span>
            </button>

            {savedMsg && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-xs font-extrabold text-emerald-800 flex items-center justify-center space-x-1 animate-pulse">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>System Thresholds Updated & Synced!</span>
              </div>
            )}
          </div>

          {/* Weather Simulator Box */}
          <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 flex items-center">
              <RefreshCw className="w-4 h-4 mr-2 text-amber-600" />
              Simulate Weather Event Trigger
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Inject synthetic forecast data to trigger heatwave detection, automated hospital alerts, and surge model evaluations.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Temp (°C)</label>
                <input
                  type="number"
                  step="0.5"
                  value={simTemp}
                  onChange={e => setSimTemp(parseFloat(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-amber-700 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Humidity (%)</label>
                <input
                  type="number"
                  step="1"
                  value={simHum}
                  onChange={e => setSimHum(parseFloat(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm font-bold text-teal-700 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <button
              onClick={() => onSimulateWeather(simTemp, simHum)}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-600 hover:to-rose-700 text-white text-xs font-extrabold rounded-xl transition flex items-center justify-center space-x-2 shadow-md cursor-pointer"
            >
              <Flame className="w-4 h-4" />
              <span>Simulate Heat Event & Alert Radius</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
