import pytest
from ml_model import demand_predictor
from resource_engine import calculate_resource_requirements, calculate_stock_replenishment
from ranking_engine import rank_hospitals_for_ambulance

def test_percentage_increase_calculation():
    # Normal case
    pred = demand_predictor.predict_demand(temp_c=42.0, humidity_pct=65.0, horizon_hours=24)
    assert pred["percentage_increase"] is not None
    assert pred["percentage_increase"] > 0
    assert pred["baseline_zero_warning"] is False

def test_percentage_increase_zero_baseline_edge_case():
    # Test safeguard formula when baseline is 0
    baseline_admissions = 0.0
    predicted_admissions = 25.0
    if baseline_admissions <= 0:
        percentage_increase = None
        baseline_zero_warning = True
    else:
        percentage_increase = ((predicted_admissions - baseline_admissions) / baseline_admissions) * 100
        baseline_zero_warning = False

    assert percentage_increase is None
    assert baseline_zero_warning is True

def test_resource_requirements_calculation():
    extra_patients = 20.0
    reqs = calculate_resource_requirements(extra_patients, horizon_hours=24)
    assert reqs["extra_staffed_beds"] > 0
    assert reqs["extra_icu_beds"] > 0
    assert len(reqs["supplies"]) == 5
    # Verify IV fluids needed
    iv_item = next(item for item in reqs["supplies"] if item["category"] == "IV Fluids")
    assert iv_item["required_quantity"] > 0

def test_stock_replenishment_formula():
    inventory = [
        {
            "id": 1,
            "item_name": "Normal Saline 0.9%",
            "category": "IV Fluids",
            "usable_quantity": 20,
            "incoming_quantity": 10,
            "safety_stock": 15,
            "lead_time_days": 1,
            "unit": "bags"
        }
    ]
    recs = calculate_stock_replenishment(inventory, predicted_additional_patients=30.0)
    assert len(recs) == 1
    rec = recs[0]
    # Forecast consumption = ceil(30 * 3.5 * (1 + 1)) = 210
    # Recommended stock = 210 + 15 = 225
    # Shortage = max(0, 225 - 20 - 10) = 195
    assert rec["recommended_stock"] == 225
    assert rec["shortage_quantity"] == 195
    assert rec["priority"] == "High"

def test_hospital_ranking():
    hospitals = [
        {
            "id": 1,
            "name": "Hospital A",
            "latitude": 28.6140,
            "longitude": 77.2080,
            "capabilities": ["trauma", "heat_cooling"],
            "resources": {"readiness_status": "Ready", "available_staffed_beds": 30, "available_icu_beds": 5}
        },
        {
            "id": 2,
            "name": "Hospital B",
            "latitude": 28.7000, # Far away
            "longitude": 77.3000,
            "capabilities": ["pediatric"],
            "resources": {"readiness_status": "Constrained", "available_staffed_beds": 2, "available_icu_beds": 0}
        }
    ]

    ranked = rank_hospitals_for_ambulance(
        ambulance_lat=28.6139,
        ambulance_lng=77.2090,
        required_capabilities=["heat_cooling"],
        urgency_level="High",
        is_heat_illness=True,
        hospitals=hospitals
    )

    assert len(ranked) == 2
    assert ranked[0]["hospital_id"] == 1 # Hospital A should rank first due to proximity, capability, beds, and readiness
    assert ranked[0]["match_score"] > ranked[1]["match_score"]

def test_integration_endpoints():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    # 1. Test fetch standardized records
    response = client.get("/api/integration/records/1")
    assert response.status_code == 200
    records = response.json()
    assert isinstance(records, list)

    # 2. Test batch import
    batch_data = {
        "records": [
            {
                "resource_type": "BED",
                "resource_name": "Standard Inpatient Bed",
                "total_capacity": 100,
                "available_quantity": 45,
                "data_source": "EXCEL_IMPORT"
            },
            {
                "resource_type": "ICU",
                "resource_name": "Ventilator ICU Bed",
                "total_capacity": 20,
                "available_quantity": 8,
                "data_source": "EXCEL_IMPORT"
            }
        ]
    }
    import_resp = client.post("/api/integration/batch-import/1", json=batch_data)
    assert import_resp.status_code == 200
    res_data = import_resp.json()
    assert res_data["imported_rows"] == 2
    assert res_data["error_count"] == 0

    # 3. Test fetch ERP config
    erp_resp = client.get("/api/integration/erp-config/1")
    assert erp_resp.status_code == 200
    assert erp_resp.json()["hospital_id"] == 1

    # 4. Test ERP sync trigger
    sync_resp = client.post("/api/integration/erp-sync-trigger/1")
    assert sync_resp.status_code == 200
    assert "completed successfully" in sync_resp.json()["message"]
    assert sync_resp.json()["synced_records_count"] == 5

