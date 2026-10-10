import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    role = Column(String) # 'ambulance', 'hospital_staff', 'admin'
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    ambulance_id = Column(String, nullable=True)
    full_name = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Hospital(Base):
    __tablename__ = "hospitals"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String)
    contact_phone = Column(String)
    capabilities = Column(JSON) # e.g. ["trauma", "icu", "pediatric", "burn", "cardiac", "heat_cooling"]
    is_active = Column(Boolean, default=True)

    resources = relationship("HospitalResource", back_populates="hospital", uselist=False)
    inventories = relationship("Inventory", back_populates="hospital")
    acknowledgements = relationship("HospitalAlertAcknowledgement", back_populates="hospital")

class HospitalResource(Base):
    __tablename__ = "hospital_resources"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), unique=True)
    total_staffed_beds = Column(Integer, default=100)
    available_staffed_beds = Column(Integer, default=25)
    total_icu_beds = Column(Integer, default=20)
    available_icu_beds = Column(Integer, default=5)
    available_doctors = Column(Integer, default=12)
    available_nurses = Column(Integer, default=30)
    cooling_center_capacity = Column(Integer, default=15)
    available_cooling_beds = Column(Integer, default=8)
    ed_capacity_status = Column(String, default="Normal") # Normal, Busy, Severe Surge
    readiness_status = Column(String, default="Ready") # Ready, Preparing, Constrained
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)

    hospital = relationship("Hospital", back_populates="resources")

class Inventory(Base):
    __tablename__ = "inventory"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    item_name = Column(String, index=True)
    category = Column(String) # 'IV Fluids', 'Cooling Gear', 'Medication', 'Oxygen', 'Equipment'
    usable_quantity = Column(Integer, default=100)
    allocated_quantity = Column(Integer, default=10)
    incoming_quantity = Column(Integer, default=0)
    safety_stock = Column(Integer, default=20)
    unit = Column(String, default="units")
    lead_time_days = Column(Integer, default=1)
    expiry_date = Column(String, nullable=True)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)

    hospital = relationship("Hospital", back_populates="inventories")

class WeatherForecast(Base):
    __tablename__ = "weather_forecasts"
    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String, default="Pune Metropolitan Region")
    latitude = Column(Float, default=18.5204)
    longitude = Column(Float, default=73.8567)
    forecast_time = Column(DateTime, default=datetime.datetime.utcnow)
    temperature_c = Column(Float)
    humidity_pct = Column(Float)
    heat_index_c = Column(Float)
    heat_risk_category = Column(String) # Normal, Warning, High Risk
    source = Column(String, default="Simulated Live Weather")
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)

class HeatAlert(Base):
    __tablename__ = "heat_alerts"
    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    severity = Column(String) # Warning, High Risk
    radius_km = Column(Float, default=1.5)
    forecast_window_hours = Column(Integer, default=24)
    temperature_c = Column(Float)
    humidity_pct = Column(Float)
    heat_index_c = Column(Float)
    status = Column(String, default="Active") # Active, Resolved
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class HospitalAlertAcknowledgement(Base):
    __tablename__ = "hospital_alert_acknowledgements"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    alert_id = Column(Integer, ForeignKey("heat_alerts.id"))
    acknowledged = Column(Boolean, default=False)
    readiness_status = Column(String, default="Pending Review")
    checklist_status = Column(JSON, default=dict)
    acknowledged_at = Column(DateTime, nullable=True)

    hospital = relationship("Hospital", back_populates="acknowledgements")

class AdmissionHistory(Base):
    __tablename__ = "admission_history"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    temperature_c = Column(Float)
    humidity_pct = Column(Float)
    heat_index_c = Column(Float)
    is_heatwave = Column(Boolean, default=False)
    admissions_count = Column(Integer)
    heat_related_count = Column(Integer)

class DemandForecast(Base):
    __tablename__ = "demand_forecasts"
    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("heat_alerts.id"), nullable=True)
    forecast_period_hours = Column(Integer) # 6, 12, 24
    baseline_admissions = Column(Float)
    predicted_admissions = Column(Float)
    predicted_additional_patients = Column(Float)
    percentage_increase = Column(Float, nullable=True)
    baseline_zero_warning = Column(Boolean, default=False)
    model_confidence_pct = Column(Float, default=88.5)
    contributing_factors = Column(JSON)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class StockRecommendation(Base):
    __tablename__ = "stock_recommendations"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    item_name = Column(String)
    category = Column(String)
    current_usable_stock = Column(Integer)
    confirmed_incoming_stock = Column(Integer)
    forecast_consumption = Column(Integer)
    recommended_stock = Column(Integer)
    shortage_quantity = Column(Integer)
    lead_time_days = Column(Integer)
    priority = Column(String) # High, Medium, Low
    review_status = Column(String, default="Recommended") # Recommended, Reviewed, Ordered

class Ambulance(Base):
    __tablename__ = "ambulances"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_code = Column(String, unique=True, index=True)
    crew_leader = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    status = Column(String, default="Available") # Available, En Route, Busy
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)

class EmergencyRequest(Base):
    __tablename__ = "emergency_requests"
    id = Column(Integer, primary_key=True, index=True)
    ambulance_code = Column(String)
    current_lat = Column(Float)
    current_lng = Column(Float)
    patient_age = Column(Integer)
    patient_gender = Column(String)
    reported_condition = Column(Text)
    urgency_level = Column(String) # Critical, High, Medium, Low
    is_heat_illness = Column(Boolean, default=False)
    required_capabilities = Column(JSON)
    destination_hospital_id = Column(Integer, ForeignKey("hospitals.id"), nullable=True)
    status = Column(String, default="Pending") # Pending, Requested, Accepted, Declined
    eta_minutes = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class HospitalAcceptance(Base):
    __tablename__ = "hospital_acceptances"
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("emergency_requests.id"))
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    response = Column(String) # Accepted, Declined
    decline_reason = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    recipient_role = Column(String)
    recipient_id = Column(String, nullable=True)
    title = Column(String)
    message = Column(Text)
    severity = Column(String, default="Info") # Info, Warning, Urgent
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    user_role = Column(String)
    user_name = Column(String)
    action = Column(String)
    details = Column(Text)

class StandardizedResourceRecord(Base):
    __tablename__ = "standardized_resource_records"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    resource_type = Column(String, index=True) # staffed_beds, icu_beds, doctors, nurses, cooling_beds, inventory_item, equipment
    resource_name = Column(String)
    total_capacity = Column(Integer, default=0)
    available_quantity = Column(Integer, default=0)
    data_source = Column(String, default="MANUAL_ENTRY") # ERP_FHIR, ERP_EPIC, ERP_CERNER, EXCEL_IMPORT, CSV_IMPORT, MANUAL_ENTRY, WEBHOOK
    freshness_status = Column(String, default="LIVE") # LIVE, RECENT, STALE, MANUAL
    validation_status = Column(String, default="VALID") # VALID, WARNING, ERROR
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)
    raw_metadata = Column(JSON, nullable=True)

class ERPConnectorConfig(Base):
    __tablename__ = "erp_connector_configs"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"), unique=True)
    system_type = Column(String, default="FHIR_R4") # FHIR_R4, EPIC_EHR, CERNER_EHR, CUSTOM_WEBHOOK, FILE_BATCH
    endpoint_url = Column(String, nullable=True)
    auth_type = Column(String, default="Bearer") # Bearer, Basic, OAuth2, APIKey, None
    auth_token = Column(String, nullable=True)
    sync_frequency_minutes = Column(Integer, default=15)
    is_active = Column(Boolean, default=True)
    last_sync_status = Column(String, default="IDLE") # SUCCESS, FAILED, IDLE, RUNNING
    last_sync_time = Column(DateTime, nullable=True)
    last_error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class DataImportBatchLog(Base):
    __tablename__ = "data_import_batch_logs"
    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id"))
    file_name = Column(String)
    file_type = Column(String) # CSV, XLSX, XLS, ERP_SYNC
    total_rows = Column(Integer, default=0)
    imported_rows = Column(Integer, default=0)
    skipped_rows = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    imported_by = Column(String, default="Hospital Staff")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    error_details = Column(JSON, nullable=True)

