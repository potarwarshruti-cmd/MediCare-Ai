export type UserRole = 'admin' | 'hospital_staff' | 'ambulance';

export interface WeatherData {
  location_name: string;
  temperature_c: number;
  humidity_pct: number;
  heat_index_c: number;
  heat_risk_category: 'Normal' | 'Warning' | 'High Risk';
  last_updated: string;
  source: string;
}

export interface HospitalResourceData {
  total_staffed_beds: number;
  available_staffed_beds: number;
  total_icu_beds: number;
  available_icu_beds: number;
  available_doctors: number;
  available_nurses: number;
  cooling_center_capacity: number;
  available_cooling_beds: number;
  ed_capacity_status: string;
  readiness_status: string;
  last_updated?: string;
  freshness_status?: FreshnessStatus;
  data_source?: DataSource;
  last_synced_at?: string;
}

export type FreshnessStatus = 'LIVE' | 'RECENT' | 'STALE' | 'MANUAL';

export type DataSource =
  | 'ERP_FHIR'
  | 'ERP_EPIC'
  | 'ERP_CERNER'
  | 'EXCEL_IMPORT'
  | 'CSV_IMPORT'
  | 'MANUAL_ENTRY'
  | 'WEBHOOK';

export interface StandardizedResourceRecord {
  id: number;
  hospital_id: number;
  resource_type: string; // 'staffed_beds' | 'icu_beds' | 'doctors' | 'nurses' | 'cooling_beds' | 'inventory_item' | 'equipment'
  resource_name: string;
  total_capacity: number;
  available_quantity: number;
  data_source: DataSource;
  freshness_status: FreshnessStatus;
  validation_status: 'VALID' | 'WARNING' | 'ERROR';
  last_updated: string;
  raw_metadata?: Record<string, any>;
}

export interface ERPConnectorConfig {
  id?: number;
  hospital_id: number;
  system_type: 'FHIR_R4' | 'EPIC_EHR' | 'CERNER_EHR' | 'CUSTOM_WEBHOOK' | 'FILE_BATCH';
  endpoint_url?: string;
  auth_type: 'Bearer' | 'Basic' | 'OAuth2' | 'APIKey' | 'None';
  auth_token?: string;
  sync_frequency_minutes: number;
  is_active: boolean;
  last_sync_status: 'SUCCESS' | 'FAILED' | 'IDLE' | 'RUNNING';
  last_sync_time?: string;
  last_error_message?: string;
}

export interface DataImportBatchLog {
  id: number;
  hospital_id: number;
  file_name: string;
  file_type: 'CSV' | 'XLSX' | 'XLS' | 'ERP_SYNC';
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_count: number;
  imported_by: string;
  created_at: string;
  error_details?: Array<{ row: number; field: string; message: string }>;
}


export interface HospitalData {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  contact_phone: string;
  capabilities: string[];
  resources: HospitalResourceData;
  // Dynamic fields from ranking
  distance_km?: number;
  eta_minutes?: number;
  match_score?: number;
  recommendation_reasons?: string[];
  data_freshness_label?: string;
  available_staffed_beds?: number;
  available_icu_beds?: number;
}

export interface InventoryItem {
  id: number;
  hospital_id: number;
  item_name: string;
  category: string;
  usable_quantity: number;
  allocated_quantity: number;
  incoming_quantity: number;
  safety_stock: number;
  unit: string;
  lead_time_days: number;
  expiry_date?: string;
  last_updated?: string;
  freshness_status?: FreshnessStatus;
  data_source?: string;
  is_demo_data?: boolean;
}

export interface HeatAlertData {
  id: number;
  location_name: string;
  severity: 'Warning' | 'High Risk';
  radius_km: number;
  temperature_c: number;
  humidity_pct: number;
  heat_index_c: number;
  status: 'Active' | 'Resolved';
  created_at: string;
  acknowledgements: {
    hospital_id: number;
    hospital_name: string;
    acknowledged: boolean;
    readiness_status: string;
    checklist_status: Record<string, boolean>;
    acknowledged_at?: string;
  }[];
}

export interface DemandPredictionData {
  forecast_period_hours: number;
  temperature_c: number;
  humidity_pct: number;
  heat_index_c: number;
  baseline_admissions: number;
  predicted_admissions: number;
  predicted_additional_patients: number;
  percentage_increase: number | null;
  baseline_zero_warning: boolean;
  model_confidence_pct: number;
  contributing_factors: Record<string, number>;
  is_simulated_forecast: boolean;
}

export interface StockRecommendationData {
  item_id?: number;
  item_name: string;
  category: string;
  current_usable_stock: number;
  confirmed_incoming_stock: number;
  forecast_consumption: number;
  safety_stock: number;
  recommended_stock: number;
  shortage_quantity: number;
  lead_time_days: number;
  priority: 'High' | 'Medium' | 'Low';
  unit: string;
  review_status: string;
  freshness_status?: FreshnessStatus;
  data_source?: string;
  is_demo_data?: boolean;
}

export interface AIInventoryPlannerResponse {
  hospital_id: number;
  hospital_name: string;
  has_real_data: boolean;
  data_source_notice: string | null;
  demand_forecast: DemandPredictionData;
  additional_patients_24h: number;
  inventory_items: InventoryItem[];
  stock_recommendations: StockRecommendationData[];
}

export interface EmergencyRequestData {
  id: number;
  ambulance_code: string;
  current_lat: number;
  current_lng: number;
  patient_age: number;
  patient_gender: string;
  reported_condition: string;
  urgency_level: 'Critical' | 'High' | 'Medium' | 'Low';
  is_heat_illness: boolean;
  required_capabilities: string[];
  destination_hospital_id?: number;
  destination_hospital_name?: string;
  status: 'Pending' | 'Requested' | 'Accepted' | 'Declined' | 'Redirected' | 'Completed';
  eta_minutes?: number;
  created_at?: string;
}

export interface AuditLogData {
  id: number;
  timestamp: string;
  user_role: string;
  user_name: string;
  action: string;
  details: string;
}

export interface NotificationData {
  id: number;
  recipient_role: string;
  title: string;
  message: string;
  severity: 'Info' | 'Warning' | 'Urgent';
  read: boolean;
  created_at: string;
}

export interface SystemConfigData {
  monitored_area_name: string;
  center_latitude: number;
  center_longitude: number;
  warning_temp_threshold_c: number;
  high_risk_temp_threshold_c: number;
  alert_radius_km: number;
}
