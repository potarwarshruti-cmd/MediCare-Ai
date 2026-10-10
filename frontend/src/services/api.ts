import type {
  WeatherData, HospitalData, InventoryItem, HeatAlertData,
  DemandPredictionData, StockRecommendationData, EmergencyRequestData,
  AuditLogData, NotificationData, SystemConfigData,
  StandardizedResourceRecord, ERPConnectorConfig, DataImportBatchLog,
  AIInventoryPlannerResponse
} from '../types';

const API_BASE_URL = 'http://localhost:8000/api';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error (${res.status}): ${errorText}`);
  }
  return res.json();
}

export const api = {
  // Config & Weather
  getConfig: () => fetchJson<SystemConfigData>('/config'),
  updateConfig: (config: Partial<SystemConfigData>) =>
    fetchJson<{ message: string; config: SystemConfigData }>('/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getWeather: () => fetchJson<WeatherData>('/weather'),
  simulateWeather: (data: { temperature_c: number; humidity_pct: number; location_name?: string }) =>
    fetchJson<{ weather: WeatherData; triggered_alert: any }>('/weather/simulate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Heat Alerts & AI Forecasting
  getHeatAlerts: () => fetchJson<HeatAlertData[]>('/heat-alerts'),
  acknowledgeHeatAlert: (alertId: number, data: { hospital_id: number; readiness_status: string; checklist_status: Record<string, boolean> }) =>
    fetchJson<{ message: string }>(`/heat-alerts/${alertId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDemandForecast: (tempC = 41.5, humidityPct = 65.0, horizonHours = 24, alertId?: number) => {
    const query = new URLSearchParams({
      temp_c: tempC.toString(),
      humidity_pct: humidityPct.toString(),
      horizon_hours: horizonHours.toString(),
    });
    if (alertId) query.append('alert_id', alertId.toString());
    return fetchJson<DemandPredictionData>(`/demand-forecast?${query.toString()}`);
  },

  getResourceRecommendations: (hospitalId: number, tempC = 41.5, humidityPct = 65.0) =>
    fetchJson<{
      hospital_id: number;
      hospital_name: string;
      demand_forecast: DemandPredictionData;
      resource_requirements: any;
      stock_recommendations: StockRecommendationData[];
    }>(`/resources/recommendations/${hospitalId}?temp_c=${tempC}&humidity_pct=${humidityPct}`),

  getMlEvaluation: () => fetchJson<any>('/ml/evaluation'),

  // Hospitals & Ranking
  getHospitals: () => fetchJson<HospitalData[]>('/hospitals'),
  upsertHospital: (data: { name: string; latitude: number; longitude: number; address: string; contact_phone?: string; capabilities?: string[] }) =>
    fetchJson<{ message: string; hospital_id: number; hospital: HospitalData }>('/hospitals/upsert', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  rankHospitals: (data: {
    ambulance_lat: number;
    ambulance_lng: number;
    required_capabilities: string[];
    urgency_level: string;
    is_heat_illness: boolean;
  }) => fetchJson<HospitalData[]>('/hospitals/rank', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateHospitalResources: (hospitalId: number, resources: any) =>
    fetchJson<{ message: string }>(`/hospitals/${hospitalId}/resources`, {
      method: 'POST',
      body: JSON.stringify(resources),
    }),

  // Universal Hospital Data Integration Module
  getStandardizedRecords: (hospitalId: number) =>
    fetchJson<StandardizedResourceRecord[]>(`/integration/records/${hospitalId}`),

  batchImportRecords: (hospitalId: number, data: { file_name: string; file_type: string; records: any[]; imported_by?: string }) =>
    fetchJson<{ message: string; total_rows: number; imported_rows: number; skipped_rows: number; error_count: number; errors: any[] }>(
      `/integration/batch-import/${hospitalId}`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  getERPConfig: (hospitalId: number) =>
    fetchJson<ERPConnectorConfig>(`/integration/erp-config/${hospitalId}`),

  saveERPConfig: (hospitalId: number, config: Partial<ERPConnectorConfig>) =>
    fetchJson<{ message: string; config: ERPConnectorConfig }>(`/integration/erp-config/${hospitalId}`, {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  triggerERPSync: (hospitalId: number) =>
    fetchJson<{ message: string; system_type: string; last_sync_time: string; synced_records_count: number }>(
      `/integration/erp-sync-trigger/${hospitalId}`,
      { method: 'POST' }
    ),

  getImportLogs: (hospitalId: number) =>
    fetchJson<DataImportBatchLog[]>(`/integration/import-logs/${hospitalId}`),

  // Ambulance Requests
  createEmergencyRequest: (data: {
    ambulance_code: string;
    current_lat: number;
    current_lng: number;
    patient_age: number;
    patient_gender: string;
    reported_condition: string;
    urgency_level: string;
    is_heat_illness: boolean;
    required_capabilities: string[];
  }) => fetchJson<{ message: string; request_id: number; status: string }>('/emergency-requests', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  selectDestination: (requestId: number, hospitalId: number) =>
    fetchJson<{ message: string; status: string; eta_minutes: number }>(`/emergency-requests/${requestId}/destination`, {
      method: 'POST',
      body: JSON.stringify({ hospital_id: hospitalId }),
    }),

  getEmergencyRequest: (requestId: number) =>
    fetchJson<EmergencyRequestData>(`/emergency-requests/${requestId}`),

  respondEmergencyRequest: (requestId: number, response: 'Accepted' | 'Declined', decline_reason?: string) =>
    fetchJson<{ message: string; status: string }>(`/emergency-requests/${requestId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response, decline_reason }),
    }),

  redirectEmergencyRequest: (requestId: number, hospitalId: number) =>
    fetchJson<{ message: string; new_request_id: number; new_hospital_name: string; eta_minutes: number; distance_km: number }>(
      `/emergency-requests/${requestId}/redirect`,
      {
        method: 'POST',
        body: JSON.stringify({ hospital_id: hospitalId }),
      }
    ),

  getIncomingAmbulances: (hospitalId: number) => fetchJson<EmergencyRequestData[]>(`/hospitals/${hospitalId}/incoming`),

  // Inventory, Audit & Notifications
  getInventory: (hospitalId: number) => fetchJson<InventoryItem[]>(`/inventory/${hospitalId}`),
  updateInventoryItem: (hospitalId: number, itemId: number, data: { usable_quantity: number; incoming_quantity?: number; safety_stock?: number; lead_time_days?: number }) =>
    fetchJson<{ message: string; freshness_status: string }>(`/inventory/${hospitalId}/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  addInventoryItem: (hospitalId: number, data: { item_name: string; category: string; usable_quantity: number; incoming_quantity?: number; safety_stock?: number; unit?: string; lead_time_days?: number }) =>
    fetchJson<{ message: string; item_id: number }>(`/inventory/${hospitalId}/add-item`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  placeStockOrder: (hospitalId: number, itemId: number, orderQuantity: number) =>
    fetchJson<{ message: string; new_incoming_quantity: number }>(`/inventory/${hospitalId}/stock-order`, {
      method: 'POST',
      body: JSON.stringify({ item_id: itemId, order_quantity: orderQuantity }),
    }),
  getAIInventoryPlanner: (hospitalId: number, tempC: number, humidityPct: number) =>
    fetchJson<AIInventoryPlannerResponse>(`/inventory/${hospitalId}/ai-planner?temp_c=${tempC}&humidity_pct=${humidityPct}`),

  getNotifications: (role?: string) => fetchJson<NotificationData[]>(`/notifications${role ? `?role=${role}` : ''}`),
  getAuditLogs: () => fetchJson<AuditLogData[]>('/audit-logs'),

  // Demo Runner
  runDemoScenario: () => fetchJson<{ success: boolean; message: string; alert_id: number; ambulance_request_id: number }>('/demo/run-scenario', { method: 'POST' }),
};

