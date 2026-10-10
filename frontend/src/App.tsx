import { useState, useEffect, useCallback } from 'react';
import type { UserRole, SystemConfigData, WeatherData, HospitalData, HeatAlertData, NotificationData } from './types';
import { api } from './services/api';
import { wsService } from './services/websocket';
import { useGeolocation } from './hooks/useGeolocation';
import { useLiveWeather } from './hooks/useLiveWeather';
import { useNearbyHospitals } from './hooks/useNearbyHospitals';
import { MapPin, Wifi, RefreshCw, Loader2, Building2 } from 'lucide-react';

import { Header } from './components/Header';
import { LoginView } from './views/LoginView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { HeatEarlyWarningView } from './views/HeatEarlyWarningView';
import { DemandPredictionView } from './views/DemandPredictionView';
import { HospitalPreparednessView } from './views/HospitalPreparednessView';
import { UniversalDataIntegrationView } from './views/UniversalDataIntegrationView';
import { AmbulanceEntryView } from './views/AmbulanceEntryView';
import { HospitalMapView } from './views/HospitalMapView';
import { IncomingAmbulancesView } from './views/IncomingAmbulancesView';
import { InventoryView } from './views/InventoryView';
import { AuditHistoryView } from './views/AuditHistoryView';

import { AmbulanceActiveTrackView } from './views/AmbulanceActiveTrackView';
import { AmbulanceMobileNav } from './components/AmbulanceMobileNav';

export function App() {
  const [currentRole, setRole] = useState<UserRole>('admin');
  const [activeScreen, setActiveScreen] = useState<string>('admin_dashboard');

  // App Config & Data
  const [config, setConfig] = useState<SystemConfigData>({
    monitored_area_name: 'Live Device Geofence Zone',
    center_latitude: 18.5204,
    center_longitude: 73.8567,
    warning_temp_threshold_c: 38.0,
    high_risk_temp_threshold_c: 41.0,
    alert_radius_km: 10.0,
  });

  const [hospitals, setHospitals] = useState<HospitalData[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<HeatAlertData[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  // Ambulance Dispatch State
  const [ambReqId, setAmbReqId] = useState<number | null>(null);
  const [ambLat, setAmbLat] = useState<number>(0);
  const [ambLng, setAmbLng] = useState<number>(0);
  const [ambCaps, setAmbCaps] = useState<string[]>([]);
  const [ambUrgency, setAmbUrgency] = useState<string>('Critical');
  const [ambIsHeat, setAmbIsHeat] = useState<boolean>(false);

  // 1. Browser Geolocation Hook
  const geo = useGeolocation();

  // Auto-request location on initial mount
  useEffect(() => {
    geo.requestLocation();
  }, []);

  const activeLat = geo.status === 'success' && geo.coords
    ? geo.coords.latitude
    : config.center_latitude;

  const activeLng = geo.status === 'success' && geo.coords
    ? geo.coords.longitude
    : config.center_longitude;

  // 2. Open-Meteo Real-Time Weather Hook
  const liveWeather = useLiveWeather(
    activeLat,
    activeLng,
    config.warning_temp_threshold_c,
    config.high_risk_temp_threshold_c,
    5
  );

  // 3. OpenStreetMap Real Nearby Hospitals Hook
  const osm = useNearbyHospitals();

  // Update backend config when real GPS position is acquired
  useEffect(() => {
    if (geo.status === 'success' && geo.coords) {
      const lat = geo.coords.latitude;
      const lng = geo.coords.longitude;
      api.updateConfig({
        center_latitude: lat,
        center_longitude: lng,
        monitored_area_name: `Device GPS Zone (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`,
      }).then(res => {
        setConfig(res.config);
      }).catch(console.warn);

      // Fetch OSM hospitals around user position
      osm.fetchNearby(lat, lng, 15);
    }
  }, [geo.status, geo.coords?.latitude, geo.coords?.longitude]);

  // Combined weather object (Open-Meteo real weather preferred)
  const [weatherState, setWeatherState] = useState<WeatherData>({
    location_name: 'Live GPS Location',
    temperature_c: 32.0,
    humidity_pct: 55.0,
    heat_index_c: 33.5,
    heat_risk_category: 'Normal',
    last_updated: new Date().toLocaleTimeString(),
    source: 'Open-Meteo Real-Time Weather API',
  });

  useEffect(() => {
    if (liveWeather.weather) {
      setWeatherState(liveWeather.weather);
      
      // Auto-trigger heat alert on backend if weather hits warning/high risk
      if (liveWeather.weather.heat_risk_category !== 'Normal') {
        api.simulateWeather({
          temperature_c: liveWeather.weather.temperature_c,
          humidity_pct: liveWeather.weather.humidity_pct,
          location_name: liveWeather.weather.location_name,
        }).catch(console.warn);
      }
    }
  }, [liveWeather.weather]);

  // Reload Backend Data
  const reloadData = useCallback(async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);

      const hosps = await api.getHospitals();
      setHospitals(hosps);

      const alrts = await api.getHeatAlerts();
      setAlerts(alrts);

      const notes = await api.getNotifications();
      setNotifications(notes);
    } catch (err) {
      console.warn('Backend API connection issue, running in resilient mode.', err);
    }
  }, []);

  useEffect(() => {
    reloadData();

    const unsub = wsService.subscribe((msg) => {
      if (
        msg.type === 'ambulance_request_created' ||
        msg.type === 'ambulance_request_updated' ||
        msg.type === 'hospital_capacity_synced' ||
        msg.type === 'request_redirected'
      ) {
        reloadData();
      }
    });

    return () => unsub();
  }, [reloadData]);

  // Update System Threshold Config
  const handleUpdateConfig = async (newCfg: Partial<SystemConfigData>) => {
    try {
      const res = await api.updateConfig(newCfg);
      setConfig(res.config);
    } catch (err) {
      setConfig({ ...config, ...newCfg });
    }
  };

  // Trigger Weather Ingestion & Alert Evaluation
  const handleSimulateWeather = async (temp: number, hum: number) => {
    try {
      const res = await api.simulateWeather({ temperature_c: temp, humidity_pct: hum });
      setWeatherState(res.weather);
      await reloadData();
    } catch (err) {
      console.error('Failed to trigger weather alert evaluation', err);
    }
  };

  // Sync OSM Hospital to Backend SQLite Database
  const handleRegisterOsmHospital = async (osmHospital: HospitalData) => {
    try {
      const res = await api.upsertHospital({
        name: osmHospital.name,
        latitude: osmHospital.latitude,
        longitude: osmHospital.longitude,
        address: osmHospital.address || 'Real OpenStreetMap Location',
        capabilities: ['trauma', 'icu', 'heat_cooling'],
      });
      await reloadData();
      setSelectedHospitalId(res.hospital_id);
    } catch (err) {
      console.error('Failed to register OSM hospital in database', err);
    }
  };

  // Compute Active Selected Hospital for Hospital Portal
  const activeHospital: HospitalData = (
    hospitals.find(h => h.id === selectedHospitalId) ||
    hospitals[0] || {
      id: 1,
      name: 'Registered Local Emergency Hospital',
      latitude: activeLat,
      longitude: activeLng,
      address: 'Verified Local Medical Center Address',
      contact_phone: '+1-800-555-0199',
      capabilities: ['trauma', 'icu', 'heat_cooling'],
      resources: {
        total_staffed_beds: 120,
        available_staffed_beds: 28,
        total_icu_beds: 20,
        available_icu_beds: 6,
        available_doctors: 14,
        available_nurses: 32,
        cooling_center_capacity: 18,
        available_cooling_beds: 10,
        ed_capacity_status: 'Normal',
        readiness_status: 'Ready',
      },
    }
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans pb-16 sm:pb-0">
      {/* Header */}
      <Header
        currentRole={currentRole}
        setRole={setRole}
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        unreadNotifications={notifications.filter(n => !n.read).length}
      />

      {/* Real Data & GPS Telemetry Status Strip */}
      <div className="bg-slate-900 text-slate-200 border-b border-slate-800 px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-4 flex-wrap">
            {/* GPS Status */}
            <div className="flex items-center space-x-1.5">
              <MapPin className={`w-3.5 h-3.5 ${geo.status === 'success' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span className="font-semibold">GPS:</span>
              {geo.status === 'success' && geo.coords ? (
                <span className="font-mono text-emerald-300 font-bold">
                  {geo.coords.latitude.toFixed(4)}°, {geo.coords.longitude.toFixed(4)}° (±{Math.round(geo.coords.accuracy)}m)
                </span>
              ) : geo.status === 'requesting' ? (
                <span className="text-sky-300 animate-pulse flex items-center">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Acquiring device location…
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">{geo.status.toUpperCase()}</span>
              )}
            </div>

            {/* Weather API Status */}
            <div className="flex items-center space-x-1.5">
              <Wifi className={`w-3.5 h-3.5 ${liveWeather.status === 'success' ? 'text-sky-400' : 'text-slate-400'}`} />
              <span className="font-semibold">Live Weather:</span>
              <span className="font-mono text-sky-300 font-bold">
                {weatherState.temperature_c}°C | RH {weatherState.humidity_pct}% | Heat Index {weatherState.heat_index_c}°C
              </span>
            </div>

            {/* Osm Hospitals Count */}
            {osm.hospitals.length > 0 && (
              <div className="flex items-center space-x-1 text-teal-300 font-semibold">
                <Building2 className="w-3.5 h-3.5" />
                <span>{osm.hospitals.length} Real OSM Hospitals Nearby</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={geo.requestLocation}
              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg transition text-[11px] flex items-center space-x-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Acquire GPS</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeScreen === 'login' && (
          <LoginView
            onSelectRole={(r) => {
              setRole(r);
              setActiveScreen(r === 'admin' ? 'admin_dashboard' : r === 'hospital_staff' ? 'hospital_preparedness' : 'ambulance_entry');
            }}
          />
        )}

        {activeScreen === 'admin_dashboard' && (
          <AdminDashboardView
            config={config}
            weather={weatherState}
            hospitals={hospitals}
            alerts={alerts}
            userCoords={geo.coords}
            geoStatus={geo.status}
            geoErrorMessage={geo.errorMessage}
            onRequestGps={geo.requestLocation}
            liveWeatherStatus={liveWeather.status}
            liveWeatherError={liveWeather.errorMessage}
            onUpdateConfig={handleUpdateConfig}
            onSimulateWeather={handleSimulateWeather}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'heat_warning' && (
          <HeatEarlyWarningView
            weather={weatherState}
            alerts={alerts}
            hospitals={hospitals}
            alertRadiusKm={config.alert_radius_km}
            onSimulateHeat={() => handleSimulateWeather(42.5, 70.0)}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'demand_prediction' && (
          <DemandPredictionView
            tempC={weatherState.temperature_c}
            humidityPct={weatherState.humidity_pct}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'hospital_preparedness' && (
          <HospitalPreparednessView
            hospital={activeHospital}
            allHospitals={hospitals}
            onSelectHospital={h => setSelectedHospitalId(h.id)}
            activeAlert={alerts.length > 0 ? alerts[0] : null}
            onUpdateResources={() => reloadData()}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'data_integration' && (
          <UniversalDataIntegrationView
            hospital={activeHospital}
            onUpdateResources={() => reloadData()}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'ambulance_entry' && (
          <AmbulanceEntryView
            onCreatedRequest={(reqId, lat, lng, caps, urgency, isHeat) => {
              setAmbReqId(reqId);
              setAmbLat(lat);
              setAmbLng(lng);
              setAmbCaps(caps);
              setAmbUrgency(urgency);
              setAmbIsHeat(isHeat);
              setActiveScreen('hospital_map');
            }}
          />
        )}

        {activeScreen === 'hospital_map' && (
          <HospitalMapView
            requestId={ambReqId}
            ambulanceLat={ambLat || activeLat}
            ambulanceLng={ambLng || activeLng}
            capabilities={ambCaps}
            urgencyLevel={ambUrgency}
            isHeatIllness={ambIsHeat}
            onSelectDestination={(h) => {
              if ('is_osm_sourced' in h && (h as any).is_osm_sourced) {
                handleRegisterOsmHospital(h);
              } else {
                setSelectedHospitalId(h.id);
              }
              reloadData();
              setActiveScreen('ambulance_tracking');
            }}
          />
        )}

        {activeScreen === 'ambulance_tracking' && (
          <AmbulanceActiveTrackView
            requestId={ambReqId}
            ambulanceLat={ambLat || activeLat}
            ambulanceLng={ambLng || activeLng}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'incoming_ambulances' && (
          <IncomingAmbulancesView
            hospital={activeHospital}
            onUpdateHospitalCapacity={() => reloadData()}
          />
        )}

        {activeScreen === 'inventory_management' && (
          <InventoryView
            hospital={activeHospital}
            tempC={weatherState.temperature_c}
            humidityPct={weatherState.humidity_pct}
            onNavigateScreen={setActiveScreen}
          />
        )}

        {activeScreen === 'audit_history' && (
          <AuditHistoryView />
        )}
      </main>

      {/* Ambulance Mobile App Bottom Nav (Mobile Viewports) */}
      {currentRole === 'ambulance' && (
        <AmbulanceMobileNav
          activeScreen={activeScreen}
          setActiveScreen={setActiveScreen}
          hasActiveRequest={Boolean(ambReqId)}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs font-semibold text-slate-500 shadow-sm">
        MediCare AI — Real-Time Heatwave Demand Prediction & Universal Hospital Data Integration Platform
      </footer>
    </div>
  );
}

export default App;
