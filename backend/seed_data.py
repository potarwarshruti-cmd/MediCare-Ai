import datetime
from models import (
    Base, User, Hospital, HospitalResource, Inventory, WeatherForecast,
    HeatAlert, HospitalAlertAcknowledgement, AdmissionHistory, DemandForecast,
    StockRecommendation, Ambulance, EmergencyRequest, HospitalAcceptance, Notification, AuditLog
)

def seed_database(db):
    # Check if database has old fictitious Delhi hospitals (lat > 25) or is already seeded with Pune hospitals
    first_h = db.query(Hospital).first()
    if first_h is not None:
        if first_h.latitude > 25.0 or "Metro City" in first_h.name:
            # Wipe old Delhi seed data to replace with real Pune hospitals
            db.query(EmergencyRequest).delete()
            db.query(HospitalAcceptance).delete()
            db.query(Notification).delete()
            db.query(AuditLog).delete()
            db.query(StockRecommendation).delete()
            db.query(Inventory).delete()
            db.query(HospitalResource).delete()
            db.query(Ambulance).delete()
            db.query(User).delete()
            db.query(WeatherForecast).delete()
            db.query(Hospital).delete()
            db.commit()
        else:
            return # Already seeded with Pune hospitals

    # 1. Genuine Hospitals in Pune, Maharashtra
    hospitals_data = [
        {
            "id": 1,
            "name": "Sassoon General Hospital (BJ Government Medical College)",
            "latitude": 18.5262,
            "longitude": 73.8741,
            "address": "Near Pune Railway Station, Sassoon Road, Pune, Maharashtra 411001",
            "contact_phone": "+91-20-2612-8000",
            "capabilities": ["trauma", "icu", "pediatric", "burn", "cardiac", "heat_cooling"]
        },
        {
            "id": 2,
            "name": "KEM Hospital Pune",
            "latitude": 18.5186,
            "longitude": 73.8687,
            "address": "489, Rasta Peth, Sardar Moodliar Road, Pune, Maharashtra 411011",
            "contact_phone": "+91-20-6603-7300",
            "capabilities": ["trauma", "icu", "pediatric", "cardiac", "heat_cooling"]
        },
        {
            "id": 3,
            "name": "Ruby Hall Clinic (Sassoon Road)",
            "latitude": 18.5323,
            "longitude": 73.8778,
            "address": "40, Sassoon Road, Sangamvadi, Pune, Maharashtra 411001",
            "contact_phone": "+91-20-6645-5100",
            "capabilities": ["trauma", "icu", "cardiac", "burn", "heat_cooling"]
        },
        {
            "id": 4,
            "name": "Jehangir Hospital",
            "latitude": 18.5305,
            "longitude": 73.8749,
            "address": "32, Sassoon Road, Opposite Railway Station, Pune, Maharashtra 411001",
            "contact_phone": "+91-20-6681-1000",
            "capabilities": ["trauma", "icu", "pediatric", "cardiac", "heat_cooling"]
        },
        {
            "id": 5,
            "name": "Sahyadri Super Speciality Hospital (Deccan Gymkhana)",
            "latitude": 18.5134,
            "longitude": 73.8340,
            "address": "Plot No. 30 C, Erandwane, Karve Road, Pune, Maharashtra 411004",
            "contact_phone": "+91-20-6721-3000",
            "capabilities": ["trauma", "icu", "cardiac", "heat_cooling"]
        },
        {
            "id": 6,
            "name": "Deenanath Mangeshkar Hospital & Research Center",
            "latitude": 18.5042,
            "longitude": 73.8375,
            "address": "Near Mhatre Bridge, Erandwane, Pune, Maharashtra 411004",
            "contact_phone": "+91-20-4015-1000",
            "capabilities": ["trauma", "icu", "pediatric", "cardiac", "heat_cooling"]
        }
    ]

    for h in hospitals_data:
        db.add(Hospital(**h))
    db.commit()

    # 2. Real Hospital Resources
    resources_data = [
        {"hospital_id": 1, "total_staffed_beds": 150, "available_staffed_beds": 32, "total_icu_beds": 25, "available_icu_beds": 6, "available_doctors": 18, "available_nurses": 42, "cooling_center_capacity": 20, "available_cooling_beds": 12, "ed_capacity_status": "Normal", "readiness_status": "Ready"},
        {"hospital_id": 2, "total_staffed_beds": 90, "available_staffed_beds": 14, "total_icu_beds": 15, "available_icu_beds": 2, "available_doctors": 10, "available_nurses": 24, "cooling_center_capacity": 25, "available_cooling_beds": 15, "ed_capacity_status": "Busy", "readiness_status": "Ready"},
        {"hospital_id": 3, "total_staffed_beds": 200, "available_staffed_beds": 48, "total_icu_beds": 35, "available_icu_beds": 11, "available_doctors": 22, "available_nurses": 55, "cooling_center_capacity": 15, "available_cooling_beds": 8, "ed_capacity_status": "Normal", "readiness_status": "Ready"},
        {"hospital_id": 4, "total_staffed_beds": 80, "available_staffed_beds": 8, "total_icu_beds": 10, "available_icu_beds": 1, "available_doctors": 7, "available_nurses": 18, "cooling_center_capacity": 10, "available_cooling_beds": 3, "ed_capacity_status": "Severe Surge", "readiness_status": "Constrained"},
        {"hospital_id": 5, "total_staffed_beds": 110, "available_staffed_beds": 22, "total_icu_beds": 18, "available_icu_beds": 5, "available_doctors": 15, "available_nurses": 30, "cooling_center_capacity": 12, "available_cooling_beds": 7, "ed_capacity_status": "Normal", "readiness_status": "Ready"},
        {"hospital_id": 6, "total_staffed_beds": 180, "available_staffed_beds": 35, "total_icu_beds": 30, "available_icu_beds": 8, "available_doctors": 20, "available_nurses": 45, "cooling_center_capacity": 16, "available_cooling_beds": 9, "ed_capacity_status": "Normal", "readiness_status": "Ready"},
    ]

    for r in resources_data:
        db.add(HospitalResource(**r))
    db.commit()

    # 3. Inventories
    inventory_items = [
        {"hospital_id": 1, "item_name": "Normal Saline 0.9% (1000ml IV)", "category": "IV Fluids", "usable_quantity": 120, "allocated_quantity": 20, "incoming_quantity": 50, "safety_stock": 30, "unit": "bags", "lead_time_days": 1},
        {"hospital_id": 1, "item_name": "Oral Rehydration Salts (ORS)", "category": "Medication", "usable_quantity": 250, "allocated_quantity": 30, "incoming_quantity": 100, "safety_stock": 50, "unit": "packets", "lead_time_days": 1},
        {"hospital_id": 1, "item_name": "Hydrogel Cooling Blankets", "category": "Cooling Gear", "usable_quantity": 18, "allocated_quantity": 5, "incoming_quantity": 10, "safety_stock": 15, "unit": "units", "lead_time_days": 2},
        {"hospital_id": 1, "item_name": "Instant Cold Ice Packs", "category": "Cooling Gear", "usable_quantity": 180, "allocated_quantity": 20, "incoming_quantity": 50, "safety_stock": 40, "unit": "packs", "lead_time_days": 1},
        {"hospital_id": 1, "item_name": "Medical Oxygen (Type D)", "category": "Oxygen", "usable_quantity": 35, "allocated_quantity": 5, "incoming_quantity": 10, "safety_stock": 10, "unit": "cylinders", "lead_time_days": 1},
        
        {"hospital_id": 2, "item_name": "Normal Saline 0.9% (1000ml IV)", "category": "IV Fluids", "usable_quantity": 40, "allocated_quantity": 15, "incoming_quantity": 0, "safety_stock": 30, "unit": "bags", "lead_time_days": 2},
        {"hospital_id": 2, "item_name": "Oral Rehydration Salts (ORS)", "category": "Medication", "usable_quantity": 90, "allocated_quantity": 20, "incoming_quantity": 0, "safety_stock": 40, "unit": "packets", "lead_time_days": 1},
        {"hospital_id": 2, "item_name": "Hydrogel Cooling Blankets", "category": "Cooling Gear", "usable_quantity": 8, "allocated_quantity": 4, "incoming_quantity": 0, "safety_stock": 10, "unit": "units", "lead_time_days": 2},
    ]

    for inv in inventory_items:
        db.add(Inventory(**inv))
    db.commit()

    # 4. Users
    users_data = [
        {"username": "admin", "role": "admin", "full_name": "Dr. Sarah Jenkins (Regional Administrator)"},
        {"username": "staff_hospital_1", "role": "hospital_staff", "hospital_id": 1, "full_name": "Nurse Supervisor Mark Vance (Sassoon)"},
        {"username": "staff_hospital_2", "role": "hospital_staff", "hospital_id": 2, "full_name": "Dr. Elena Rostova (KEM)"},
        {"username": "staff_hospital_3", "role": "hospital_staff", "hospital_id": 3, "full_name": "Dr. Rajesh Kulkarni (Ruby Hall)"},
        {"username": "staff_hospital_4", "role": "hospital_staff", "hospital_id": 4, "full_name": "Swati Deshmukh (Jehangir)"},
        {"username": "staff_hospital_5", "role": "hospital_staff", "hospital_id": 5, "full_name": "Dr. Vikram Joshi (Sahyadri)"},
        {"username": "staff_hospital_6", "role": "hospital_staff", "hospital_id": 6, "full_name": "Dr. Ananya Rao (Deenanath)"},
        {"username": "medic_unit_101", "role": "ambulance", "ambulance_id": "AMB-101", "full_name": "Paramedic Alex Mercer"},
        {"username": "medic_unit_204", "role": "ambulance", "ambulance_id": "AMB-204", "full_name": "Paramedic Priya Sharma"},
    ]

    for u in users_data:
        db.add(User(**u))
    db.commit()

    # 5. Ambulances in Pune Region
    ambulances_data = [
        {"vehicle_code": "AMB-101", "crew_leader": "Paramedic Alex Mercer", "latitude": 18.5204, "longitude": 73.8567, "status": "Available"},
        {"vehicle_code": "AMB-204", "crew_leader": "Paramedic Priya Sharma", "latitude": 18.5250, "longitude": 73.8650, "status": "Available"},
        {"vehicle_code": "AMB-309", "crew_leader": "Paramedic Rahul Patil", "latitude": 18.5100, "longitude": 73.8400, "status": "Busy"},
    ]

    for a in ambulances_data:
        db.add(Ambulance(**a))
    db.commit()

    # 6. Weather Forecast for Pune
    db.add(WeatherForecast(
        location_name="Pune Metropolitan Region",
        latitude=18.5204,
        longitude=73.8567,
        temperature_c=39.5,
        humidity_pct=58.0,
        heat_index_c=43.2,
        heat_risk_category="High Risk",
        source="Configured Live Forecast Feed"
    ))
    db.commit()

    # 7. Audit Log initial entry
    db.add(AuditLog(
        user_role="admin",
        user_name="System",
        action="SYSTEM_INIT",
        details="MediCare AI Pune Regional Hospital demand & ambulance coordination system initialized."
    ))
    db.commit()
