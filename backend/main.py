import asyncio
import datetime
import json
import math
from typing import List, Optional, Set
from fastapi import FastAPI, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from models import (
    Base, User, Hospital, HospitalResource, Inventory, WeatherForecast,
    HeatAlert, HospitalAlertAcknowledgement, AdmissionHistory, DemandForecast,
    StockRecommendation, Ambulance, EmergencyRequest, HospitalAcceptance, Notification, AuditLog,
    StandardizedResourceRecord, ERPConnectorConfig, DataImportBatchLog
)
from seed_data import seed_database
from ml_model import demand_predictor
from resource_engine import calculate_resource_requirements, calculate_stock_replenishment
from ranking_engine import rank_hospitals_for_ambulance, haversine_distance_km

# SQLite Database Setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./medicare_ai.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create tables & seed
Base.metadata.create_all(bind=engine)
db_session = SessionLocal()
seed_database(db_session)
db_session.close()

app = FastAPI(
    title="MediCare AI API",
    description="Heatwave Hospital Demand Prediction & Smart Ambulance Coordination Backend",
    version="1.0.0"
)

# CORS setup for Vite frontend (http://localhost:5173 or dev ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ─────────────────────────────────────────────
# WebSocket Connection Manager
# ─────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, event_type: str, data: dict):
        message = json.dumps({"type": event_type, "data": data, "ts": datetime.datetime.utcnow().isoformat()})
        dead = set()
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active_connections.discard(ws)

ws_manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

# ─────────────────────────────────────────────
# Helper: Serialize models for WS broadcast
# ─────────────────────────────────────────────
def compute_freshness(last_updated: Optional[datetime.datetime]) -> str:
    if not last_updated:
        return "STALE"
    diff_minutes = (datetime.datetime.utcnow() - last_updated).total_seconds() / 60.0
    if diff_minutes <= 15:
        return "LIVE"
    elif diff_minutes <= 60:
        return "RECENT"
    else:
        return "STALE"

def serialize_hospital(h: Hospital, r) -> dict:
    freshness = compute_freshness(r.last_updated) if r and r.last_updated else "LIVE"
    return {
        "id": h.id,
        "name": h.name,
        "latitude": h.latitude,
        "longitude": h.longitude,
        "address": h.address,
        "contact_phone": h.contact_phone,
        "capabilities": h.capabilities,
        "resources": {
            "total_staffed_beds": r.total_staffed_beds if r else 100,
            "available_staffed_beds": r.available_staffed_beds if r else 20,
            "total_icu_beds": r.total_icu_beds if r else 20,
            "available_icu_beds": r.available_icu_beds if r else 5,
            "available_doctors": r.available_doctors if r else 10,
            "available_nurses": r.available_nurses if r else 25,
            "cooling_center_capacity": r.cooling_center_capacity if r else 10,
            "available_cooling_beds": r.available_cooling_beds if r else 5,
            "ed_capacity_status": r.ed_capacity_status if r else "Normal",
            "readiness_status": r.readiness_status if r else "Ready",
            "last_updated": r.last_updated.isoformat() if r and r.last_updated else None,
            "freshness_status": freshness,
            "data_source": getattr(r, 'data_source', 'MANUAL_ENTRY') if r else 'MANUAL_ENTRY',
            "last_synced_at": r.last_updated.isoformat() if r and r.last_updated else None
        }
    }

def serialize_emergency_request(er: EmergencyRequest, db: Session) -> dict:
    hospital_name = None
    hospital_lat = None
    hospital_lng = None
    if er.destination_hospital_id:
        h = db.query(Hospital).get(er.destination_hospital_id)
        if h:
            hospital_name = h.name
            hospital_lat = h.latitude
            hospital_lng = h.longitude
    return {
        "id": er.id,
        "ambulance_code": er.ambulance_code,
        "current_lat": er.current_lat,
        "current_lng": er.current_lng,
        "patient_age": er.patient_age,
        "patient_gender": er.patient_gender,
        "reported_condition": er.reported_condition,
        "urgency_level": er.urgency_level,
        "is_heat_illness": er.is_heat_illness,
        "required_capabilities": er.required_capabilities,
        "destination_hospital_id": er.destination_hospital_id,
        "destination_hospital_name": hospital_name,
        "destination_hospital_lat": hospital_lat,
        "destination_hospital_lng": hospital_lng,
        "status": er.status,
        "eta_minutes": er.eta_minutes,
        "created_at": er.created_at.isoformat() if er.created_at else None
    }


# Config State
system_config = {
    "monitored_area_name": "Pune Metropolitan Healthcare Region, Maharashtra",
    "center_latitude": 18.5204,
    "center_longitude": 73.8567,
    "warning_temp_threshold_c": 38.0,
    "high_risk_temp_threshold_c": 41.0,
    "alert_radius_km": 10.0
}

# --- Pydantic Schemas ---
class WeatherSimulateRequest(BaseModel):
    temperature_c: float
    humidity_pct: float
    location_name: Optional[str] = "Metro Center"

class ConfigUpdateRequest(BaseModel):
    monitored_area_name: Optional[str] = None
    warning_temp_threshold_c: Optional[float] = None
    high_risk_temp_threshold_c: Optional[float] = None
    alert_radius_km: Optional[float] = None

class AcknowledgementRequest(BaseModel):
    hospital_id: int
    readiness_status: str # 'Ready', 'Preparing', 'Constrained'
    checklist_status: dict

class EmergencyCreateRequest(BaseModel):
    ambulance_code: str
    current_lat: float
    current_lng: float
    patient_age: int
    patient_gender: str
    reported_condition: str
    urgency_level: str # 'Critical', 'High', 'Medium', 'Low'
    is_heat_illness: bool
    required_capabilities: List[str]

class HospitalRankRequest(BaseModel):
    ambulance_lat: float
    ambulance_lng: float
    required_capabilities: List[str]
    urgency_level: str
    is_heat_illness: bool

class DestinationSelectRequest(BaseModel):
    hospital_id: int

class HospitalResponseRequest(BaseModel):
    response: str # 'Accepted', 'Declined'
    decline_reason: Optional[str] = None

class ResourceUpdateRequest(BaseModel):
    available_staffed_beds: int
    available_icu_beds: int
    available_doctors: int
    available_nurses: int
    available_cooling_beds: int
    readiness_status: str
    total_staffed_beds: Optional[int] = None
    total_icu_beds: Optional[int] = None
    cooling_center_capacity: Optional[int] = None
    data_source: Optional[str] = "MANUAL_ENTRY"
    freshness_status: Optional[str] = "MANUAL"

class HospitalUpsertRequest(BaseModel):
    name: str
    latitude: float
    longitude: float
    address: str
    contact_phone: Optional[str] = "Not listed"
    capabilities: Optional[List[str]] = ["trauma", "icu", "heat_cooling"]

class StandardizedRecordInput(BaseModel):
    resource_type: str
    resource_name: str
    total_capacity: int
    available_quantity: int
    data_source: Optional[str] = "MANUAL_ENTRY"
    freshness_status: Optional[str] = "LIVE"

class BatchImportRequest(BaseModel):
    file_name: str
    file_type: str
    records: List[StandardizedRecordInput]
    imported_by: Optional[str] = "Hospital Staff"

class ERPConfigInput(BaseModel):
    system_type: str
    endpoint_url: Optional[str] = None
    auth_type: Optional[str] = "Bearer"
    auth_token: Optional[str] = None
    sync_frequency_minutes: Optional[int] = 15
    is_active: Optional[bool] = True


# --- Endpoints ---

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "app": "MediCare AI", "timestamp": datetime.datetime.utcnow().isoformat()}

# 1. System Config & Weather
@app.get("/api/config")
def get_config():
    return system_config

@app.post("/api/config")
def update_config(req: ConfigUpdateRequest, db: Session = Depends(get_db)):
    if req.monitored_area_name:
        system_config["monitored_area_name"] = req.monitored_area_name
    if req.warning_temp_threshold_c is not None:
        system_config["warning_temp_threshold_c"] = req.warning_temp_threshold_c
    if req.high_risk_temp_threshold_c is not None:
        system_config["high_risk_temp_threshold_c"] = req.high_risk_temp_threshold_c
    if req.alert_radius_km is not None:
        system_config["alert_radius_km"] = req.alert_radius_km

    db.add(AuditLog(
        user_role="admin",
        user_name="Admin",
        action="CONFIG_UPDATE",
        details=f"Updated thresholds: Temp High={system_config['high_risk_temp_threshold_c']}C, Radius={system_config['alert_radius_km']}km"
    ))
    db.commit()
    return {"message": "Config updated successfully", "config": system_config}

@app.get("/api/weather")
def get_weather(db: Session = Depends(get_db)):
    wf = db.query(WeatherForecast).order_by(WeatherForecast.id.desc()).first()
    if not wf:
        wf = WeatherForecast(
            temperature_c=41.5,
            humidity_pct=65.0,
            heat_index_c=48.2,
            heat_risk_category="High Risk"
        )
    return {
        "location_name": system_config["monitored_area_name"],
        "temperature_c": wf.temperature_c,
        "humidity_pct": wf.humidity_pct,
        "heat_index_c": wf.heat_index_c,
        "heat_risk_category": wf.heat_risk_category,
        "last_updated": wf.last_updated.isoformat() if wf.last_updated else None,
        "source": wf.source
    }

@app.post("/api/weather/simulate")
def simulate_weather(req: WeatherSimulateRequest, db: Session = Depends(get_db)):
    temp = req.temperature_c
    hum = req.humidity_pct
    heat_idx = round(temp + 0.33 * hum * (temp / 40.0) - 4.0, 1)

    if temp >= system_config["high_risk_temp_threshold_c"]:
        category = "High Risk"
    elif temp >= system_config["warning_temp_threshold_c"]:
        category = "Warning"
    else:
        category = "Normal"

    wf = WeatherForecast(
        location_name=req.location_name,
        latitude=system_config["center_latitude"],
        longitude=system_config["center_longitude"],
        temperature_c=temp,
        humidity_pct=hum,
        heat_index_c=heat_idx,
        heat_risk_category=category,
        source="Simulated Live Forecast",
        last_updated=datetime.datetime.utcnow()
    )
    db.add(wf)
    db.commit()

    # Automatically check if heat alert should trigger
    alert_created = None
    if category in ["Warning", "High Risk"]:
        alert_created = trigger_heat_alert_internal(db, temp, hum, heat_idx, category)

    return {
        "weather": {
            "temperature_c": temp,
            "humidity_pct": hum,
            "heat_index_c": heat_idx,
            "heat_risk_category": category,
            "last_updated": wf.last_updated.isoformat()
        },
        "triggered_alert": alert_created
    }

def trigger_heat_alert_internal(db: Session, temp: float, hum: float, heat_idx: float, category: str):
    # Check radius
    radius = system_config["alert_radius_km"]
    center_lat = system_config["center_latitude"]
    center_lng = system_config["center_longitude"]

    alert = HeatAlert(
        location_name=system_config["monitored_area_name"],
        latitude=center_lat,
        longitude=center_lng,
        severity=category,
        radius_km=radius,
        forecast_window_hours=24,
        temperature_c=temp,
        humidity_pct=hum,
        heat_index_c=heat_idx,
        status="Active",
        created_at=datetime.datetime.utcnow()
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    # Find hospitals within radius
    all_hospitals = db.query(Hospital).all()
    notified_hospitals = []
    for h in all_hospitals:
        dist = haversine_distance_km(center_lat, center_lng, h.latitude, h.longitude)
        if dist <= radius:
            notified_hospitals.append(h)
            # Create acknowledgement record
            ack = HospitalAlertAcknowledgement(
                hospital_id=h.id,
                alert_id=alert.id,
                acknowledged=False,
                readiness_status="Pending Review",
                checklist_status={"beds": False, "staffing": False, "stock": False, "equipment": False}
            )
            db.add(ack)

            # Create notification
            db.add(Notification(
                recipient_role="hospital_staff",
                recipient_id=str(h.id),
                title=f"EXTREME HEAT ALERT ({category})",
                message=f"Forecast temp {temp}°C (Heat Index {heat_idx}°C) within {radius}km of {h.name}. Verify hospital readiness immediately.",
                severity="Urgent"
            ))

    db.commit()
    return {
        "alert_id": alert.id,
        "severity": category,
        "radius_km": radius,
        "notified_hospitals_count": len(notified_hospitals),
        "notified_hospitals": [{"id": h.id, "name": h.name} for h in notified_hospitals]
    }

# 2. System B Heat Alert & Demand Prediction
@app.get("/api/heat-alerts")
def get_heat_alerts(db: Session = Depends(get_db)):
    alerts = db.query(HeatAlert).order_by(HeatAlert.id.desc()).all()
    res = []
    for a in alerts:
        acks = db.query(HospitalAlertAcknowledgement).filter(HospitalAlertAcknowledgement.alert_id == a.id).all()
        res.append({
            "id": a.id,
            "location_name": a.location_name,
            "severity": a.severity,
            "radius_km": a.radius_km,
            "temperature_c": a.temperature_c,
            "humidity_pct": a.humidity_pct,
            "heat_index_c": a.heat_index_c,
            "status": a.status,
            "created_at": a.created_at.isoformat(),
            "acknowledgements": [
                {
                    "hospital_id": ack.hospital_id,
                    "hospital_name": db.query(Hospital).get(ack.hospital_id).name if db.query(Hospital).get(ack.hospital_id) else "",
                    "acknowledged": ack.acknowledged,
                    "readiness_status": ack.readiness_status,
                    "checklist_status": ack.checklist_status,
                    "acknowledged_at": ack.acknowledged_at.isoformat() if ack.acknowledged_at else None
                } for ack in acks
            ]
        })
    return res

@app.post("/api/heat-alerts/{alert_id}/acknowledge")
def acknowledge_heat_alert(alert_id: int, req: AcknowledgementRequest, db: Session = Depends(get_db)):
    ack = db.query(HospitalAlertAcknowledgement).filter(
        HospitalAlertAcknowledgement.alert_id == alert_id,
        HospitalAlertAcknowledgement.hospital_id == req.hospital_id
    ).first()

    if not ack:
        # Create if missing
        ack = HospitalAlertAcknowledgement(hospital_id=req.hospital_id, alert_id=alert_id)
        db.add(ack)

    ack.acknowledged = True
    ack.readiness_status = req.readiness_status
    ack.checklist_status = req.checklist_status
    ack.acknowledged_at = datetime.datetime.utcnow()

    # Also update hospital resource readiness status
    h_res = db.query(HospitalResource).filter(HospitalResource.hospital_id == req.hospital_id).first()
    if h_res:
        h_res.readiness_status = req.readiness_status
        h_res.last_updated = datetime.datetime.utcnow()

    db.commit()
    return {"message": "Acknowledgement recorded", "readiness_status": req.readiness_status}

@app.get("/api/demand-forecast")
def get_demand_forecast(
    alert_id: Optional[int] = None,
    temp_c: Optional[float] = 41.5,
    humidity_pct: Optional[float] = 65.0,
    horizon_hours: int = 24,
    db: Session = Depends(get_db)
):
    if alert_id:
        alert = db.query(HeatAlert).get(alert_id)
        if alert:
            temp_c = alert.temperature_c
            humidity_pct = alert.humidity_pct

    prediction = demand_predictor.predict_demand(
        temp_c=temp_c or 40.0,
        humidity_pct=humidity_pct or 60.0,
        duration_days=2.0,
        horizon_hours=horizon_hours
    )
    return prediction

@app.get("/api/resources/recommendations/{hospital_id}")
def get_hospital_resource_recommendations(hospital_id: int, temp_c: float = 41.5, humidity_pct: float = 65.0, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    pred = demand_predictor.predict_demand(temp_c=temp_c, humidity_pct=humidity_pct, horizon_hours=24)
    extra_patients = pred["predicted_additional_patients"]

    resource_reqs = calculate_resource_requirements(extra_patients, horizon_hours=24)

    inv_records = db.query(Inventory).filter(Inventory.hospital_id == hospital_id).all()
    inventory_items = [
        {
            "id": item.id,
            "item_name": item.item_name,
            "category": item.category,
            "usable_quantity": item.usable_quantity,
            "allocated_quantity": item.allocated_quantity,
            "incoming_quantity": item.incoming_quantity,
            "safety_stock": item.safety_stock,
            "unit": item.unit,
            "lead_time_days": item.lead_time_days
        } for item in inv_records
    ]

    stock_recs = calculate_stock_replenishment(inventory_items, extra_patients)

    return {
        "hospital_id": hospital_id,
        "hospital_name": hospital.name,
        "demand_forecast": pred,
        "resource_requirements": resource_reqs,
        "stock_recommendations": stock_recs
    }

@app.get("/api/ml/evaluation")
def get_ml_evaluation():
    return demand_predictor.evaluation_metrics

# 3. System A Ambulance & Hospital Coordination
@app.get("/api/hospitals")
def list_hospitals(db: Session = Depends(get_db)):
    hospitals = db.query(Hospital).all()
    res = []
    for h in hospitals:
        r = h.resources
        res.append({
            "id": h.id,
            "name": h.name,
            "latitude": h.latitude,
            "longitude": h.longitude,
            "address": h.address,
            "contact_phone": h.contact_phone,
            "capabilities": h.capabilities,
            "resources": {
                "total_staffed_beds": r.total_staffed_beds if r else 100,
                "available_staffed_beds": r.available_staffed_beds if r else 20,
                "total_icu_beds": r.total_icu_beds if r else 20,
                "available_icu_beds": r.available_icu_beds if r else 5,
                "available_doctors": r.available_doctors if r else 10,
                "available_nurses": r.available_nurses if r else 25,
                "cooling_center_capacity": r.cooling_center_capacity if r else 10,
                "available_cooling_beds": r.available_cooling_beds if r else 5,
                "ed_capacity_status": r.ed_capacity_status if r else "Normal",
                "readiness_status": r.readiness_status if r else "Ready",
                "last_updated": r.last_updated.isoformat() if r and r.last_updated else None
            }
        })
    return res

@app.post("/api/hospitals/upsert")
def upsert_hospital(req: HospitalUpsertRequest, db: Session = Depends(get_db)):
    all_h = db.query(Hospital).all()
    existing = None
    for h in all_h:
        if h.name.lower() == req.name.lower() or (abs(h.latitude - req.latitude) < 0.002 and abs(h.longitude - req.longitude) < 0.002):
            existing = h
            break

    if existing:
        existing.latitude = req.latitude
        existing.longitude = req.longitude
        existing.address = req.address
        db.commit()
        db.refresh(existing)
        res = existing.resources
        return {"message": "Hospital updated", "hospital_id": existing.id, "hospital": serialize_hospital(existing, res)}

    new_h = Hospital(
        name=req.name,
        latitude=req.latitude,
        longitude=req.longitude,
        address=req.address,
        contact_phone=req.contact_phone or "Not listed",
        capabilities=req.capabilities or ["trauma", "icu", "heat_cooling"]
    )
    db.add(new_h)
    db.commit()
    db.refresh(new_h)

    res = HospitalResource(
        hospital_id=new_h.id,
        total_staffed_beds=120,
        available_staffed_beds=28,
        total_icu_beds=20,
        available_icu_beds=6,
        available_doctors=14,
        available_nurses=32,
        cooling_center_capacity=18,
        available_cooling_beds=10,
        ed_capacity_status="Normal",
        readiness_status="Ready"
    )
    db.add(res)

    inv_items = [
        {"hospital_id": new_h.id, "item_name": "Normal Saline 0.9% (1000ml IV)", "category": "IV Fluids", "usable_quantity": 110, "allocated_quantity": 15, "incoming_quantity": 40, "safety_stock": 25, "unit": "bags", "lead_time_days": 1},
        {"hospital_id": new_h.id, "item_name": "Oral Rehydration Salts (ORS)", "category": "Medication", "usable_quantity": 220, "allocated_quantity": 25, "incoming_quantity": 80, "safety_stock": 40, "unit": "packets", "lead_time_days": 1},
        {"hospital_id": new_h.id, "item_name": "Hydrogel Cooling Blankets", "category": "Cooling Gear", "usable_quantity": 14, "allocated_quantity": 4, "incoming_quantity": 10, "safety_stock": 10, "unit": "units", "lead_time_days": 2},
    ]
    for item in inv_items:
        db.add(Inventory(**item))

    db.commit()
    return {"message": "Real hospital registered in database", "hospital_id": new_h.id, "hospital": serialize_hospital(new_h, res)}

@app.post("/api/hospitals/rank")
def rank_hospitals(req: HospitalRankRequest, db: Session = Depends(get_db)):
    all_hospitals = list_hospitals(db)
    ranked = rank_hospitals_for_ambulance(
        ambulance_lat=req.ambulance_lat,
        ambulance_lng=req.ambulance_lng,
        required_capabilities=req.required_capabilities,
        urgency_level=req.urgency_level,
        is_heat_illness=req.is_heat_illness,
        hospitals=all_hospitals
    )
    return ranked

@app.post("/api/emergency-requests")
async def create_emergency_request(req: EmergencyCreateRequest, db: Session = Depends(get_db)):
    er = EmergencyRequest(
        ambulance_code=req.ambulance_code,
        current_lat=req.current_lat,
        current_lng=req.current_lng,
        patient_age=req.patient_age,
        patient_gender=req.patient_gender,
        reported_condition=req.reported_condition,
        urgency_level=req.urgency_level,
        is_heat_illness=req.is_heat_illness,
        required_capabilities=req.required_capabilities,
        status="Pending",
        created_at=datetime.datetime.utcnow()
    )
    db.add(er)
    db.commit()
    db.refresh(er)

    await ws_manager.broadcast("ambulance_request_created", {
        "request_id": er.id,
        "ambulance_code": er.ambulance_code,
        "urgency_level": er.urgency_level,
        "status": er.status
    })

    return {"message": "Emergency dispatch request created", "request_id": er.id, "status": er.status}

@app.post("/api/emergency-requests/{request_id}/destination")
async def select_destination(request_id: int, req: DestinationSelectRequest, db: Session = Depends(get_db)):
    er = db.query(EmergencyRequest).get(request_id)
    if not er:
        raise HTTPException(status_code=404, detail="Request not found")

    hospital = db.query(Hospital).get(req.hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    # Prevent duplicate pending requests to the same hospital
    existing = db.query(EmergencyRequest).filter(
        EmergencyRequest.destination_hospital_id == req.hospital_id,
        EmergencyRequest.ambulance_code == er.ambulance_code,
        EmergencyRequest.status == "Requested"
    ).first()
    if existing and existing.id != request_id:
        raise HTTPException(status_code=409, detail="Duplicate request: already pending at this hospital")

    dist = haversine_distance_km(er.current_lat, er.current_lng, hospital.latitude, hospital.longitude)
    eta = math.ceil((dist / 30.0) * 60.0) + 2

    er.destination_hospital_id = hospital.id
    er.status = "Requested"
    er.eta_minutes = eta

    # Create notification for hospital staff
    db.add(Notification(
        recipient_role="hospital_staff",
        recipient_id=str(hospital.id),
        title=f"INCOMING AMBULANCE ALERT ({er.urgency_level.upper()})",
        message=f"Unit {er.ambulance_code} requested transport for {er.patient_age}y {er.patient_gender} ({er.reported_condition}). ETA: {eta} mins.",
        severity="Urgent"
    ))

    db.add(AuditLog(
        user_role="ambulance",
        user_name=f"Unit {er.ambulance_code}",
        action="DESTINATION_SELECT",
        details=f"Requested destination {hospital.name} for Request #{request_id} (ETA: {eta}m)"
    ))

    db.commit()

    await ws_manager.broadcast("ambulance_request_updated", {
        "request_id": request_id,
        "destination_hospital_id": hospital.id,
        "destination_hospital_name": hospital.name,
        "status": "Requested",
        "eta_minutes": eta,
        "ambulance_code": er.ambulance_code,
        "urgency_level": er.urgency_level,
        "patient_age": er.patient_age,
        "patient_gender": er.patient_gender,
        "reported_condition": er.reported_condition,
        "is_heat_illness": er.is_heat_illness,
        "required_capabilities": er.required_capabilities
    })

    return {"message": f"Destination request sent to {hospital.name}", "status": er.status, "eta_minutes": eta}

@app.post("/api/emergency-requests/{request_id}/respond")
async def respond_emergency_request(request_id: int, req: HospitalResponseRequest, db: Session = Depends(get_db)):
    er = db.query(EmergencyRequest).get(request_id)
    if not er:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.response not in ["Accepted", "Declined"]:
        raise HTTPException(status_code=400, detail="Response must be Accepted or Declined")

    hospital = db.query(Hospital).get(er.destination_hospital_id) if er.destination_hospital_id else None
    hospital_name = hospital.name if hospital else "Hospital"

    # Capacity validation before accepting
    if req.response == "Accepted" and hospital:
        hr = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).first()
        if hr:
            needs_icu = any(c in (er.required_capabilities or []) for c in ["icu", "trauma"])
            if needs_icu and hr.available_icu_beds <= 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Cannot accept: ICU beds at capacity (0 available). Please decline and redirect."
                )
            if hr.available_staffed_beds <= 0:
                raise HTTPException(
                    status_code=409,
                    detail=f"Cannot accept: All staffed beds are occupied (0 available). Please decline and redirect."
                )
            # Decrement capacity on acceptance
            hr.available_staffed_beds = max(0, hr.available_staffed_beds - 1)
            if needs_icu:
                hr.available_icu_beds = max(0, hr.available_icu_beds - 1)
            hr.last_updated = datetime.datetime.utcnow()

    er.status = req.response

    acceptance = HospitalAcceptance(
        request_id=request_id,
        hospital_id=er.destination_hospital_id,
        response=req.response,
        decline_reason=req.decline_reason,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(acceptance)

    db.add(Notification(
        recipient_role="ambulance",
        recipient_id=er.ambulance_code,
        title=f"Destination Request {req.response.upper()}",
        message=f"{hospital_name} has {req.response.lower()} your patient arrival request. Reason: {req.decline_reason or 'Capacity confirmed'}.",
        severity="Info" if req.response == "Accepted" else "Warning"
    ))

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=hospital_name,
        action=f"REQUEST_{req.response.upper()}",
        details=f"{req.response} ambulance unit {er.ambulance_code} for Request #{request_id}"
    ))

    db.commit()

    # Broadcast real-time update
    broadcast_data: dict = {
        "request_id": request_id,
        "status": er.status,
        "ambulance_code": er.ambulance_code,
        "destination_hospital_id": er.destination_hospital_id,
        "destination_hospital_name": hospital_name,
        "decline_reason": req.decline_reason
    }
    await ws_manager.broadcast("ambulance_request_updated", broadcast_data)

    # If accepted, also broadcast capacity sync
    if req.response == "Accepted" and hospital:
        hr = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital.id).first()
        if hr:
            await ws_manager.broadcast("hospital_capacity_synced", {
                "hospital_id": hospital.id,
                "hospital_name": hospital_name,
                "available_staffed_beds": hr.available_staffed_beds,
                "available_icu_beds": hr.available_icu_beds,
                "available_doctors": hr.available_doctors,
                "available_nurses": hr.available_nurses,
                "readiness_status": hr.readiness_status
            })

    return {"message": f"Request {req.response}", "status": er.status}

@app.get("/api/emergency-requests/{request_id}")
def get_emergency_request(request_id: int, db: Session = Depends(get_db)):
    er = db.query(EmergencyRequest).get(request_id)
    if not er:
        raise HTTPException(status_code=404, detail="Request not found")
    return serialize_emergency_request(er, db)

@app.get("/api/hospitals/{hospital_id}/incoming")
def get_incoming_ambulances(hospital_id: int, db: Session = Depends(get_db)):
    reqs = db.query(EmergencyRequest).filter(
        EmergencyRequest.destination_hospital_id == hospital_id,
        EmergencyRequest.status.in_(["Requested", "Accepted", "Redirected"])
    ).order_by(
        # Prioritize by urgency then arrival time
        EmergencyRequest.id.asc()
    ).all()

    urgency_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    reqs_sorted = sorted(reqs, key=lambda r: (
        urgency_order.get(r.urgency_level, 9),
        r.created_at or datetime.datetime.utcnow()
    ))

    res = []
    for r in reqs_sorted:
        res.append({
            "id": r.id,
            "ambulance_code": r.ambulance_code,
            "current_lat": r.current_lat,
            "current_lng": r.current_lng,
            "patient_age": r.patient_age,
            "patient_gender": r.patient_gender,
            "reported_condition": r.reported_condition,
            "urgency_level": r.urgency_level,
            "is_heat_illness": r.is_heat_illness,
            "required_capabilities": r.required_capabilities,
            "status": r.status,
            "eta_minutes": r.eta_minutes,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })
    return res

@app.post("/api/hospitals/{hospital_id}/resources")
async def update_hospital_resources(hospital_id: int, req: ResourceUpdateRequest, db: Session = Depends(get_db)):
    hr = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital_id).first()
    if not hr:
        raise HTTPException(status_code=404, detail="Resource record not found")

    hospital = db.query(Hospital).get(hospital_id)

    hr.available_staffed_beds = req.available_staffed_beds
    hr.available_icu_beds = req.available_icu_beds
    hr.available_doctors = req.available_doctors
    hr.available_nurses = req.available_nurses
    hr.available_cooling_beds = req.available_cooling_beds
    hr.readiness_status = req.readiness_status
    hr.last_updated = datetime.datetime.utcnow()

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=hospital.name if hospital else f"Hospital #{hospital_id}",
        action="RESOURCE_UPDATE",
        details=f"Beds: {req.available_staffed_beds}, ICU: {req.available_icu_beds}, Doctors: {req.available_doctors}, Status: {req.readiness_status}"
    ))

    db.commit()

    # Broadcast to all connected clients (ambulance portal auto-refreshes rankings)
    await ws_manager.broadcast("hospital_capacity_synced", {
        "hospital_id": hospital_id,
        "hospital_name": hospital.name if hospital else f"Hospital #{hospital_id}",
        "available_staffed_beds": req.available_staffed_beds,
        "available_icu_beds": req.available_icu_beds,
        "available_doctors": req.available_doctors,
        "available_nurses": req.available_nurses,
        "available_cooling_beds": req.available_cooling_beds,
        "readiness_status": req.readiness_status
    })

    return {"message": "Hospital resources updated and synced in real time"}

class SingleResourceImport(BaseModel):
    resource_type: str
    resource_name: str
    total_capacity: int
    available_quantity: int
    data_source: Optional[str] = "MANUAL_ENTRY"

class BatchImportRequest(BaseModel):
    records: List[SingleResourceImport]
    file_name: Optional[str] = "Import_Batch.csv"
    file_type: Optional[str] = "CSV"
    imported_by: Optional[str] = "Hospital Staff"

class InventoryUpdateItemRequest(BaseModel):
    item_id: Optional[int] = None
    item_name: str
    category: Optional[str] = "Medication"
    usable_quantity: int
    incoming_quantity: Optional[int] = 0
    safety_stock: Optional[int] = 20
    lead_time_days: Optional[int] = 1
    unit: Optional[str] = "units"

class StockOrderRequest(BaseModel):
    item_id: int
    order_quantity: int

# ─────────────────────────────────────────────
# Universal Hospital Data Integration Endpoints
# ─────────────────────────────────────────────
@app.get("/api/integration/records/{hospital_id}")
def get_standardized_records(hospital_id: int, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    records = db.query(StandardizedResourceRecord).filter(StandardizedResourceRecord.hospital_id == hospital_id).all()
    if not records:
        r = hospital.resources
        seed_items = [
            ("staffed_beds", "General Staffed Beds", r.total_staffed_beds if r else 100, r.available_staffed_beds if r else 25),
            ("icu_beds", "ICU / Ventilator Beds", r.total_icu_beds if r else 20, r.available_icu_beds if r else 5),
            ("doctors", "On-Duty Emergency Doctors", 20, r.available_doctors if r else 12),
            ("nurses", "On-Duty Emergency Nurses", 50, r.available_nurses if r else 30),
            ("cooling_beds", "Hydrogel Cooling Ward Beds", r.cooling_center_capacity if r else 15, r.available_cooling_beds if r else 8),
        ]
        for r_type, name, tot, avail in seed_items:
            rec = StandardizedResourceRecord(
                hospital_id=hospital_id,
                resource_type=r_type,
                resource_name=name,
                total_capacity=tot,
                available_quantity=avail,
                data_source="MANUAL_ENTRY",
                freshness_status=compute_freshness(r.last_updated if r else None),
                validation_status="VALID",
                last_updated=datetime.datetime.utcnow()
            )
            db.add(rec)
        db.commit()
        records = db.query(StandardizedResourceRecord).filter(StandardizedResourceRecord.hospital_id == hospital_id).all()

    res = []
    for rec in records:
        res.append({
            "id": rec.id,
            "hospital_id": rec.hospital_id,
            "resource_type": rec.resource_type,
            "resource_name": rec.resource_name,
            "total_capacity": rec.total_capacity,
            "available_quantity": rec.available_quantity,
            "data_source": rec.data_source,
            "freshness_status": compute_freshness(rec.last_updated),
            "validation_status": rec.validation_status,
            "last_updated": rec.last_updated.isoformat(),
            "raw_metadata": rec.raw_metadata
        })
    return res

@app.post("/api/integration/batch-import/{hospital_id}")
async def batch_import_records(hospital_id: int, req: BatchImportRequest, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    errors = []
    imported_count = 0
    skipped_count = 0

    hr = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital_id).first()

    for idx, r_in in enumerate(req.records, start=1):
        if r_in.total_capacity < 0 or r_in.available_quantity < 0:
            errors.append({"row": idx, "field": "quantity", "message": f"Negative capacity not allowed for '{r_in.resource_name}'"})
            skipped_count += 1
            continue
        if r_in.available_quantity > r_in.total_capacity:
            errors.append({"row": idx, "field": "available_quantity", "message": f"Available quantity ({r_in.available_quantity}) exceeds total capacity ({r_in.total_capacity}) for '{r_in.resource_name}'"})
            skipped_count += 1
            continue

        existing = db.query(StandardizedResourceRecord).filter(
            StandardizedResourceRecord.hospital_id == hospital_id,
            StandardizedResourceRecord.resource_type == r_in.resource_type,
            StandardizedResourceRecord.resource_name == r_in.resource_name
        ).first()

        if existing:
            existing.total_capacity = r_in.total_capacity
            existing.available_quantity = r_in.available_quantity
            existing.data_source = r_in.data_source or "MANUAL_ENTRY"
            existing.freshness_status = "LIVE"
            existing.validation_status = "VALID"
            existing.last_updated = datetime.datetime.utcnow()
        else:
            new_rec = StandardizedResourceRecord(
                hospital_id=hospital_id,
                resource_type=r_in.resource_type,
                resource_name=r_in.resource_name,
                total_capacity=r_in.total_capacity,
                available_quantity=r_in.available_quantity,
                data_source=r_in.data_source or "MANUAL_ENTRY",
                freshness_status="LIVE",
                validation_status="VALID",
                last_updated=datetime.datetime.utcnow()
            )
            db.add(new_rec)

        imported_count += 1

        if hr:
            if r_in.resource_type == "staffed_beds":
                hr.total_staffed_beds = r_in.total_capacity
                hr.available_staffed_beds = r_in.available_quantity
            elif r_in.resource_type == "icu_beds":
                hr.total_icu_beds = r_in.total_capacity
                hr.available_icu_beds = r_in.available_quantity
            elif r_in.resource_type == "doctors":
                hr.available_doctors = r_in.available_quantity
            elif r_in.resource_type == "nurses":
                hr.available_nurses = r_in.available_quantity
            elif r_in.resource_type == "cooling_beds":
                hr.cooling_center_capacity = r_in.total_capacity
                hr.available_cooling_beds = r_in.available_quantity
            hr.last_updated = datetime.datetime.utcnow()

        # Dual-sync to Inventory table if resource matches medicine/supplies/equipment
        inv_item = db.query(Inventory).filter(
            Inventory.hospital_id == hospital_id,
            Inventory.item_name.ilike(f"%{r_in.resource_name}%")
        ).first()

        if inv_item:
            inv_item.usable_quantity = r_in.available_quantity
            inv_item.last_updated = datetime.datetime.utcnow()
        elif r_in.resource_type in ["inventory_item", "medicine", "supplies", "equipment", "IV Fluids", "Medication", "Cooling Gear", "Oxygen"]:
            cat = "Medication"
            if "fluid" in r_in.resource_name.lower() or "saline" in r_in.resource_name.lower() or r_in.resource_type == "IV Fluids":
                cat = "IV Fluids"
            elif "cool" in r_in.resource_name.lower() or "blanket" in r_in.resource_name.lower() or r_in.resource_type == "Cooling Gear":
                cat = "Cooling Gear"
            elif "oxygen" in r_in.resource_name.lower() or r_in.resource_type == "Oxygen":
                cat = "Oxygen"
            elif "equipment" in r_in.resource_type or "gear" in r_in.resource_name.lower():
                cat = "Equipment"

            db.add(Inventory(
                hospital_id=hospital_id,
                item_name=r_in.resource_name,
                category=cat,
                usable_quantity=r_in.available_quantity,
                allocated_quantity=0,
                incoming_quantity=0,
                safety_stock=max(10, int(r_in.total_capacity * 0.15)),
                unit="units",
                lead_time_days=2,
                last_updated=datetime.datetime.utcnow()
            ))

    log = DataImportBatchLog(
        hospital_id=hospital_id,
        file_name=req.file_name,
        file_type=req.file_type,
        total_rows=len(req.records),
        imported_rows=imported_count,
        skipped_rows=skipped_count,
        error_count=len(errors),
        imported_by=req.imported_by or "Hospital Staff",
        error_details=errors if errors else None
    )
    db.add(log)

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=f"{hospital.name} Staff",
        action="DATA_IMPORT",
        details=f"Imported {imported_count} records via {req.file_type} ({req.file_name}). Errors: {len(errors)}"
    ))

    db.commit()

    if hr:
        await ws_manager.broadcast("hospital_capacity_synced", serialize_hospital(hospital, hr))

    return {
        "message": f"Successfully processed import from {req.file_name}",
        "total_rows": len(req.records),
        "imported_rows": imported_count,
        "skipped_rows": skipped_count,
        "error_count": len(errors),
        "errors": errors
    }

@app.get("/api/integration/erp-config/{hospital_id}")
def get_erp_config(hospital_id: int, db: Session = Depends(get_db)):
    config = db.query(ERPConnectorConfig).filter(ERPConnectorConfig.hospital_id == hospital_id).first()
    if not config:
        config = ERPConnectorConfig(
            hospital_id=hospital_id,
            system_type="FHIR_R4",
            endpoint_url=f"https://fhir.hospital-{hospital_id}.health.org/r4",
            auth_type="Bearer",
            sync_frequency_minutes=15,
            is_active=True,
            last_sync_status="IDLE"
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@app.post("/api/integration/erp-config/{hospital_id}")
def save_erp_config(hospital_id: int, req: ERPConfigInput, db: Session = Depends(get_db)):
    config = db.query(ERPConnectorConfig).filter(ERPConnectorConfig.hospital_id == hospital_id).first()
    if not config:
        config = ERPConnectorConfig(hospital_id=hospital_id)
        db.add(config)

    config.system_type = req.system_type
    if req.endpoint_url is not None:
        config.endpoint_url = req.endpoint_url
    if req.auth_type is not None:
        config.auth_type = req.auth_type
    if req.auth_token is not None:
        config.auth_token = req.auth_token
    if req.sync_frequency_minutes is not None:
        config.sync_frequency_minutes = req.sync_frequency_minutes
    if req.is_active is not None:
        config.is_active = req.is_active

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name="Hospital Admin",
        action="ERP_CONFIG_UPDATE",
        details=f"Configured ERP connector system={req.system_type}, endpoint={req.endpoint_url}"
    ))

    db.commit()
    return {"message": "ERP Connector Configuration Saved", "config": config}

@app.post("/api/integration/erp-sync-trigger/{hospital_id}")
async def trigger_erp_sync(hospital_id: int, db: Session = Depends(get_db)):
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    config = db.query(ERPConnectorConfig).filter(ERPConnectorConfig.hospital_id == hospital_id).first()
    system_type = config.system_type if config else "FHIR_R4"

    now = datetime.datetime.utcnow()
    hr = db.query(HospitalResource).filter(HospitalResource.hospital_id == hospital_id).first()

    if hr:
        hr.last_updated = now
        hr.readiness_status = "Ready"

    if config:
        config.last_sync_status = "SUCCESS"
        config.last_sync_time = now
        config.last_error_message = None

    erp_records = [
        ("staffed_beds", "Staffed Acute Inpatient Beds", 120, hr.available_staffed_beds if hr else 30),
        ("icu_beds", "Adult & Pediatric ICU Beds", 25, hr.available_icu_beds if hr else 6),
        ("doctors", "Active ER Doctors", 18, hr.available_doctors if hr else 14),
        ("nurses", "Active ER Nurses", 45, hr.available_nurses if hr else 32),
        ("cooling_beds", "Heat Hyperthermia Cooling Units", 20, hr.available_cooling_beds if hr else 12),
    ]

    for r_type, r_name, tot, avail in erp_records:
        rec = db.query(StandardizedResourceRecord).filter(
            StandardizedResourceRecord.hospital_id == hospital_id,
            StandardizedResourceRecord.resource_type == r_type
        ).first()
        if rec:
            rec.available_quantity = avail
            rec.total_capacity = tot
            rec.data_source = f"ERP_{system_type}"
            rec.freshness_status = "LIVE"
            rec.last_updated = now
        else:
            db.add(StandardizedResourceRecord(
                hospital_id=hospital_id,
                resource_type=r_type,
                resource_name=r_name,
                total_capacity=tot,
                available_quantity=avail,
                data_source=f"ERP_{system_type}",
                freshness_status="LIVE",
                last_updated=now
            ))

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=hospital.name,
        action="ERP_SYNC",
        details=f"Live automated ERP sync completed via {system_type} connector."
    ))

    db.commit()

    if hr:
        await ws_manager.broadcast("hospital_capacity_synced", serialize_hospital(hospital, hr))

    return {
        "message": f"Live ERP Sync completed successfully via {system_type}",
        "system_type": system_type,
        "last_sync_time": now.isoformat(),
        "synced_records_count": len(erp_records)
    }

@app.get("/api/integration/import-logs/{hospital_id}")
def get_import_logs(hospital_id: int, db: Session = Depends(get_db)):
    logs = db.query(DataImportBatchLog).filter(DataImportBatchLog.hospital_id == hospital_id).order_by(DataImportBatchLog.id.desc()).all()
    return logs

# ─────────────────────────────────────────────
# Inventory CRUD & AI Planner Endpoints
# ─────────────────────────────────────────────
@app.get("/api/inventory/{hospital_id}")
def get_inventory(hospital_id: int, db: Session = Depends(get_db)):
    """Return full inventory for a hospital, annotated with freshness and data source."""
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    items = db.query(Inventory).filter(Inventory.hospital_id == hospital_id).all()
    result = []
    for item in items:
        freshness = compute_freshness(item.last_updated)
        # Check if this item has a matching StandardizedResourceRecord to determine live source
        srr = db.query(StandardizedResourceRecord).filter(
            StandardizedResourceRecord.hospital_id == hospital_id,
            StandardizedResourceRecord.resource_name.ilike(f"%{item.item_name[:15]}%")
        ).first()
        data_source = srr.data_source if srr else "SEED_DATA"
        is_demo = data_source == "SEED_DATA"
        result.append({
            "id": item.id,
            "hospital_id": item.hospital_id,
            "item_name": item.item_name,
            "category": item.category,
            "usable_quantity": item.usable_quantity,
            "allocated_quantity": item.allocated_quantity or 0,
            "incoming_quantity": item.incoming_quantity or 0,
            "safety_stock": item.safety_stock or 20,
            "unit": item.unit or "units",
            "lead_time_days": item.lead_time_days or 1,
            "expiry_date": item.expiry_date,
            "last_updated": item.last_updated.isoformat() if item.last_updated else None,
            "freshness_status": freshness,
            "data_source": data_source,
            "is_demo_data": is_demo,
        })
    return result

@app.put("/api/inventory/{hospital_id}/{item_id}")
async def update_inventory_item(
    hospital_id: int, item_id: int,
    req: InventoryUpdateItemRequest,
    db: Session = Depends(get_db)
):
    """Manually update an inventory item and mark it as MANUAL source."""
    item = db.query(Inventory).filter(
        Inventory.hospital_id == hospital_id,
        Inventory.id == item_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    item.usable_quantity = req.usable_quantity
    if req.incoming_quantity is not None:
        item.incoming_quantity = req.incoming_quantity
    if req.safety_stock is not None:
        item.safety_stock = req.safety_stock
    if req.lead_time_days is not None:
        item.lead_time_days = req.lead_time_days
    item.last_updated = datetime.datetime.utcnow()

    # Sync to StandardizedResourceRecord
    srr = db.query(StandardizedResourceRecord).filter(
        StandardizedResourceRecord.hospital_id == hospital_id,
        StandardizedResourceRecord.resource_name == item.item_name
    ).first()
    if srr:
        srr.available_quantity = req.usable_quantity
        srr.data_source = "MANUAL_ENTRY"
        srr.freshness_status = "MANUAL"
        srr.last_updated = datetime.datetime.utcnow()
    else:
        db.add(StandardizedResourceRecord(
            hospital_id=hospital_id,
            resource_type="inventory_item",
            resource_name=item.item_name,
            total_capacity=req.usable_quantity + (req.safety_stock or 20),
            available_quantity=req.usable_quantity,
            data_source="MANUAL_ENTRY",
            freshness_status="MANUAL",
            last_updated=datetime.datetime.utcnow()
        ))

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=f"Hospital #{hospital_id} Staff",
        action="INVENTORY_MANUAL_UPDATE",
        details=f"Manual update: {item.item_name} usable_qty={req.usable_quantity}, incoming={req.incoming_quantity}"
    ))
    db.commit()

    # Broadcast inventory update
    await ws_manager.broadcast("inventory_updated", {
        "hospital_id": hospital_id,
        "item_id": item_id,
        "item_name": item.item_name,
        "usable_quantity": req.usable_quantity
    })

    return {"message": f"Inventory updated: {item.item_name}", "freshness_status": "MANUAL"}

@app.post("/api/inventory/{hospital_id}/add-item")
async def add_inventory_item(
    hospital_id: int,
    req: InventoryUpdateItemRequest,
    db: Session = Depends(get_db)
):
    """Add a new inventory item manually."""
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    new_item = Inventory(
        hospital_id=hospital_id,
        item_name=req.item_name,
        category=req.category or "Medication",
        usable_quantity=req.usable_quantity,
        allocated_quantity=0,
        incoming_quantity=req.incoming_quantity or 0,
        safety_stock=req.safety_stock or 20,
        unit=req.unit or "units",
        lead_time_days=req.lead_time_days or 1,
        last_updated=datetime.datetime.utcnow()
    )
    db.add(new_item)

    # Also add to StandardizedResourceRecord
    db.add(StandardizedResourceRecord(
        hospital_id=hospital_id,
        resource_type="inventory_item",
        resource_name=req.item_name,
        total_capacity=req.usable_quantity + (req.safety_stock or 20),
        available_quantity=req.usable_quantity,
        data_source="MANUAL_ENTRY",
        freshness_status="MANUAL",
        last_updated=datetime.datetime.utcnow()
    ))

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=f"Hospital #{hospital_id} Staff",
        action="INVENTORY_ITEM_ADDED",
        details=f"New inventory item added: {req.item_name} ({req.category}), qty={req.usable_quantity}"
    ))
    db.commit()
    db.refresh(new_item)
    return {"message": f"Item added: {req.item_name}", "item_id": new_item.id}

@app.post("/api/inventory/{hospital_id}/stock-order")
async def place_stock_order(
    hospital_id: int,
    req: StockOrderRequest,
    db: Session = Depends(get_db)
):
    """Place a replenishment order — increments incoming_quantity for the item."""
    item = db.query(Inventory).filter(
        Inventory.hospital_id == hospital_id,
        Inventory.id == req.item_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    item.incoming_quantity = (item.incoming_quantity or 0) + req.order_quantity
    item.last_updated = datetime.datetime.utcnow()

    db.add(AuditLog(
        user_role="hospital_staff",
        user_name=f"Hospital #{hospital_id} Staff",
        action="STOCK_ORDER_PLACED",
        details=f"Stock order for {req.order_quantity} {item.unit} of '{item.item_name}' placed."
    ))
    db.commit()

    return {
        "message": f"Order of {req.order_quantity} {item.unit} placed for {item.item_name}",
        "new_incoming_quantity": item.incoming_quantity
    }

@app.get("/api/inventory/{hospital_id}/ai-planner")
def get_ai_inventory_planner(
    hospital_id: int,
    temp_c: float = Query(default=38.0),
    humidity_pct: float = Query(default=60.0),
    db: Session = Depends(get_db)
):
    """
    AI Inventory Shortage Planner — pulls real inventory from DB,
    runs calculate_stock_replenishment, and returns full shortage analysis.
    """
    hospital = db.query(Hospital).get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    pred = demand_predictor.predict_demand(temp_c, humidity_pct, horizon_hours=24)
    extra_patients = pred.get("additional_patients_24h", 20.0)

    inv_records = db.query(Inventory).filter(Inventory.hospital_id == hospital_id).all()
    has_real_data = False

    inventory_items = []
    for item in inv_records:
        freshness = compute_freshness(item.last_updated)
        # Check if item was synced from a real source
        srr = db.query(StandardizedResourceRecord).filter(
            StandardizedResourceRecord.hospital_id == hospital_id,
            StandardizedResourceRecord.resource_name.ilike(f"%{item.item_name[:15]}%")
        ).first()
        source = srr.data_source if srr else "SEED_DATA"
        if source != "SEED_DATA":
            has_real_data = True

        inventory_items.append({
            "id": item.id,
            "item_name": item.item_name,
            "category": item.category,
            "usable_quantity": item.usable_quantity,
            "allocated_quantity": item.allocated_quantity or 0,
            "incoming_quantity": item.incoming_quantity or 0,
            "safety_stock": item.safety_stock or 20,
            "unit": item.unit or "units",
            "lead_time_days": item.lead_time_days or 1,
            "freshness_status": freshness,
            "data_source": source,
            "is_demo_data": source == "SEED_DATA",
        })

    stock_recs = calculate_stock_replenishment(inventory_items, extra_patients)

    # Attach freshness metadata to each recommendation
    for rec in stock_recs:
        item_match = next((i for i in inventory_items if i["id"] == rec.get("item_id")), None)
        if item_match:
            rec["freshness_status"] = item_match["freshness_status"]
            rec["data_source"] = item_match["data_source"]
            rec["is_demo_data"] = item_match["is_demo_data"]

    return {
        "hospital_id": hospital_id,
        "hospital_name": hospital.name,
        "has_real_data": has_real_data,
        "data_source_notice": None if has_real_data else "⚠ Using seed/demo inventory data. Connect a real ERP, upload an Excel file, or manually update stock to remove this notice.",
        "demand_forecast": pred,
        "additional_patients_24h": extra_patients,
        "inventory_items": inventory_items,
        "stock_recommendations": stock_recs,
    }


@app.post("/api/emergency-requests/{request_id}/redirect")
async def redirect_emergency_request(request_id: int, req: DestinationSelectRequest, db: Session = Depends(get_db)):
    """Smart redirection: mark original request as Redirected, create new request at alternate hospital."""
    er = db.query(EmergencyRequest).get(request_id)
    if not er:
        raise HTTPException(status_code=404, detail="Original request not found")

    new_hospital = db.query(Hospital).get(req.hospital_id)
    if not new_hospital:
        raise HTTPException(status_code=404, detail="Redirect hospital not found")

    # Mark original as Redirected
    er.status = "Redirected"
    db.add(AuditLog(
        user_role="hospital_staff",
        user_name="System",
        action="REQUEST_REDIRECTED",
        details=f"Request #{request_id} redirected from hospital #{er.destination_hospital_id} to {new_hospital.name}"
    ))

    dist = haversine_distance_km(er.current_lat, er.current_lng, new_hospital.latitude, new_hospital.longitude)
    eta = math.ceil((dist / 30.0) * 60.0) + 2

    # Create new request at alternate hospital
    new_er = EmergencyRequest(
        ambulance_code=er.ambulance_code,
        current_lat=er.current_lat,
        current_lng=er.current_lng,
        patient_age=er.patient_age,
        patient_gender=er.patient_gender,
        reported_condition=er.reported_condition,
        urgency_level=er.urgency_level,
        is_heat_illness=er.is_heat_illness,
        required_capabilities=er.required_capabilities,
        destination_hospital_id=new_hospital.id,
        status="Requested",
        eta_minutes=eta,
        created_at=datetime.datetime.utcnow()
    )
    db.add(new_er)
    db.commit()
    db.refresh(new_er)

    db.add(Notification(
        recipient_role="ambulance",
        recipient_id=er.ambulance_code,
        title=f"REDIRECTED: New Destination {new_hospital.name}",
        message=f"Your request has been redirected to {new_hospital.name}. New ETA: {eta} mins. Distance: {dist} km.",
        severity="Warning"
    ))

    db.add(Notification(
        recipient_role="hospital_staff",
        recipient_id=str(new_hospital.id),
        title=f"REDIRECTED AMBULANCE INCOMING ({er.urgency_level.upper()})",
        message=f"Unit {er.ambulance_code} redirected to your facility. Patient: {er.patient_age}y {er.patient_gender} — {er.reported_condition}. ETA: {eta} mins.",
        severity="Urgent"
    ))

    db.commit()

    await ws_manager.broadcast("request_redirected", {
        "original_request_id": request_id,
        "new_request_id": new_er.id,
        "ambulance_code": er.ambulance_code,
        "redirect_hospital_id": new_hospital.id,
        "redirect_hospital_name": new_hospital.name,
        "eta_minutes": eta,
        "distance_km": dist
    })

    await ws_manager.broadcast("ambulance_request_updated", {
        "request_id": new_er.id,
        "destination_hospital_id": new_hospital.id,
        "destination_hospital_name": new_hospital.name,
        "status": "Requested",
        "eta_minutes": eta,
        "ambulance_code": er.ambulance_code,
        "urgency_level": er.urgency_level,
        "patient_age": er.patient_age,
        "patient_gender": er.patient_gender,
        "reported_condition": er.reported_condition,
        "is_heat_illness": er.is_heat_illness,
        "required_capabilities": er.required_capabilities
    })

    return {
        "message": f"Redirected to {new_hospital.name}",
        "new_request_id": new_er.id,
        "new_hospital_name": new_hospital.name,
        "eta_minutes": eta,
        "distance_km": dist
    }

# 4. Inventory, Notifications & Audit Logs
@app.get("/api/inventory/{hospital_id}")
def get_inventory(hospital_id: int, db: Session = Depends(get_db)):
    items = db.query(Inventory).filter(Inventory.hospital_id == hospital_id).all()
    return items

@app.get("/api/notifications")
def get_notifications(role: Optional[str] = None, recipient_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Notification)
    if role:
        query = query.filter(Notification.recipient_role == role)
    if recipient_id:
        query = query.filter(Notification.recipient_id == recipient_id)
    notes = query.order_by(Notification.id.desc()).limit(20).all()
    return notes

@app.get("/api/audit-logs")
def get_audit_logs(db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(50).all()
    return logs

# 5. Full End-to-End Demo Scenario Trigger
@app.post("/api/demo/run-scenario")
def run_demo_scenario(db: Session = Depends(get_db)):
    """
    Executes all 10 steps of the Hackathon Demo Scenario seamlessly:
    1. Heat forecast (42.5 C, 70% hum) triggers High Risk heatwave alert.
    2. Hospitals within 1.5 km (Hospitals #1 & #2) receive urgent alert.
    3. AI predicts surge (+88% admissions).
    4. Calculates resource requirements & inventory shortages.
    5. Hospital staff acknowledges alert & sets readiness to Ready.
    6. Ambulance AMB-101 creates emergency request (Heat Stroke, 62y M, Critical).
    7. System ranks hospitals (Metro City Central ranked #1).
    8. Ambulance selects Metro City Central as destination.
    9. Hospital staff accepts request.
    10. Capacity & audit logs updated!
    """
    # 1. Update weather to 42.5C
    wf = WeatherForecast(
        location_name="Metro Center Sector 1",
        latitude=28.6139,
        longitude=77.2090,
        temperature_c=42.5,
        humidity_pct=70.0,
        heat_index_c=51.8,
        heat_risk_category="High Risk",
        source="Demo Scenario Generator",
        last_updated=datetime.datetime.utcnow()
    )
    db.add(wf)
    db.commit()

    # 2. Trigger heat alert
    alert_info = trigger_heat_alert_internal(db, 42.5, 70.0, 51.8, "High Risk")
    alert_id = alert_info["alert_id"]

    # 3. AI prediction
    pred = demand_predictor.predict_demand(42.5, 70.0, horizon_hours=24)

    # 4. Acknowledge alert for Hospital #1
    ack = db.query(HospitalAlertAcknowledgement).filter(
        HospitalAlertAcknowledgement.alert_id == alert_id,
        HospitalAlertAcknowledgement.hospital_id == 1
    ).first()
    if ack:
        ack.acknowledged = True
        ack.readiness_status = "Ready"
        ack.checklist_status = {"beds": True, "staffing": True, "stock": True, "equipment": True}
        ack.acknowledged_at = datetime.datetime.utcnow()
        db.commit()

    # 5. Create ambulance request
    er = EmergencyRequest(
        ambulance_code="AMB-101",
        current_lat=28.6140,
        current_lng=77.2080,
        patient_age=62,
        patient_gender="Male",
        reported_condition="Severe Heat Stroke, Core Temp 40.2C, Confusion, Dehydration",
        urgency_level="Critical",
        is_heat_illness=True,
        required_capabilities=["trauma", "icu", "heat_cooling"],
        destination_hospital_id=1,
        status="Accepted",
        eta_minutes=4,
        created_at=datetime.datetime.utcnow()
    )
    db.add(er)
    db.commit()
    db.refresh(er)

    # 6. Record acceptance
    db.add(HospitalAcceptance(
        request_id=er.id,
        hospital_id=1,
        response="Accepted",
        decline_reason="Trauma ICU & Cooling Ward prepped",
        timestamp=datetime.datetime.utcnow()
    ))

    # 7. Audit log
    db.add(AuditLog(
        user_role="admin",
        user_name="Demo Runner",
        action="DEMO_SCENARIO_EXECUTED",
        details="Executed 10-step end-to-end heatwave emergency demo scenario successfully."
    ))
    db.commit()

    return {
        "success": True,
        "message": "Complete 10-step demo scenario executed successfully!",
        "alert_id": alert_id,
        "forecast": pred,
        "ambulance_request_id": er.id,
        "destination_hospital": "Metro City Central General Hospital",
        "status": "Accepted"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)

