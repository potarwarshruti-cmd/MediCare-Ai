# MediCare AI — Heatwave Hospital Demand Prediction & Smart Ambulance Coordination

**Hackathon Problem Statement Solution: HC-02 (Predicting Hospital Demand During Extreme Heat)**

MediCare AI is a full-stack, AI-powered web application that integrates two connected systems to manage heatwave health emergencies:
1. **System B — Climate-Based Early Warning & Resource Prediction:** Analyzes weather forecasts, detects abnormal heat, alerts hospitals within a configurable 1.5 km warning radius, predicts percentage increase in patient admissions using Random Forest Machine Learning, estimates extra resource requirements, and generates stock replenishment recommendations.
2. **System A — Smart Ambulance-to-Hospital Coordination:** Enables emergency ambulance crews to view nearby hospitals on an interactive map, check live staffed beds, ICU capacity, doctors, cooling facilities, and data freshness, rank suitable hospitals using AI multi-criteria optimization, request destination acceptance, and dispatch real-time incoming-patient alerts.

---

## 🚀 Key Features & Workflow Integration

### System B — Climate-Based Early Warning & Resource Planning
- **Abnormal Heat Detection:** Configurable temperature & humidity thresholds (Default Warning: 38.0°C, High Risk: 41.0°C). Calculates Heat Index dynamically.
- **1.5 km Warning Radius:** Visualized on Leaflet / Google Maps with distance calculation & configurable radius expansion/contraction (0.5 km to 5.0 km).
- **AI Patient Admission Demand Forecasting:**
  - Forecast horizons: 6, 12, and 24 hours.
  - Formula: $\text{Admission Increase (\%)} = \frac{\text{Predicted admissions} - \text{Baseline admissions}}{\text{Baseline admissions}} \times 100$
  - Baseline zero edge-case handling with clear visual warning.
  - Model evaluation comparing Random Forest ML vs Historical Average Baseline (MAE & RMSE metrics).
- **Clinical Resource Requirements:** Calculates additional staffed beds, ICU beds, doctors, nurses, cooling beds, IV fluids (0.9% Normal Saline), Oral Rehydration Salts (ORS), hydrogel cooling blankets, ice packs, and oxygen cylinders required.
- **AI Stock Replenishment Recommendations:**
  - $\text{Recommended Stock} = \text{Forecast Consumption} + \text{Safety Stock}$
  - $\text{Additional Quantity to Replenish} = \max(0, \text{Recommended Stock} - \text{Usable Stock} - \text{Incoming Stock})$
  - Shortage priority classification (High, Medium, Low).
- **Hospital Preparedness Checklist:** Readiness status tracking (Ready, Preparing, Constrained) with staff verification.

### System A — Smart Ambulance-to-Hospital Coordination
- **Ambulance Emergency Dispatch Form:** Capture patient age, gender, clinical condition, urgency level, heatwave illness flag, and required clinical capabilities.
- **Interactive Geo-Spatial Map:** Visualizes registered hospitals, ambulance GPS location, 1.5 km warning circle, and transport polylines.
- **Multi-Criteria Hospital Ranking Algorithm:** Ranks hospitals by:
  1. Clinical Capability match (35%)
  2. Confirmed Readiness status (25%)
  3. Staffed Bed & ICU Availability (20%)
  4. Estimated Travel Time (15%)
  5. Data Freshness (5%)
- **Real-Time Request & Hospital Acceptance:** Live workstation for hospital staff to accept or decline incoming transport requests with reasons.

---

## 🛠️ Technology Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Recharts (Analytics), Leaflet & React-Leaflet (Interactive Geo-Maps with Google Maps JS API fallback).
- **Backend:** Python 3.11, FastAPI, SQLAlchemy ORM, SQLite (out-of-the-box zero-config, PostgreSQL/Supabase ready), Pydantic v2.
- **AI/ML:** Scikit-Learn (Random Forest Regressor), Pandas, NumPy.
- **Testing:** Pytest unit test suite for mathematical formulas and ranking algorithms.

---

## 📁 Repository Structure

```
medicare-ai/
├── backend/
│   ├── main.py                  # FastAPI REST API & Demo Scenario Controller
│   ├── models.py                # SQLAlchemy ORM Schemas (15 Database Entities)
│   ├── ml_model.py              # Scikit-Learn Random Forest Demand Predictor
│   ├── resource_engine.py       # Resource Requirement & Stock Calculation Engine
│   ├── ranking_engine.py        # Multi-Criteria Hospital Ranking Algorithm
│   ├── seed_data.py             # Database Seeder (5+ Hospitals, Resources, Weather)
│   ├── test_app.py              # Pytest Unit Test Suite
│   └── requirements.txt         # Python Dependencies
├── frontend/
│   ├── src/
│   │   ├── components/          # Header, InteractiveMap, DemoGuideBanner
│   │   ├── views/               # 10 UI Screens matching all Hackathon roles
│   │   ├── services/api.ts      # API Client Service
│   │   ├── types.ts             # TypeScript Type Definitions
│   │   ├── App.tsx              # Main Application Controller
│   │   └── index.css            # Tailwind CSS styling
│   └── package.json
├── .env.example                 # Environment variables template
└── README.md                    # Project Documentation
```

---

## ⚙️ Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ (Node v22 installed)
- **Python**: v3.10+ (Python 3.11 installed)

### 2. Running the Backend Server
```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
- The backend runs at: `http://localhost:8000`
- Interactive API Documentation (Swagger): `http://localhost:8000/docs`

### 3. Running Backend Unit Tests
```bash
cd backend
python -m pytest test_app.py
```

### 4. Running the Frontend Application
```bash
cd frontend
npm install
npm run dev
```
- Access the web app at: `http://localhost:5173`

---

## 🎬 10-Step Hackathon Demo Scenario

The application includes a prominent **"Run 10-Step Demo"** floating banner and step-by-step controller that executes the entire end-to-end hackathon workflow:

1. **Heat Forecast:** Temperature rises to **42.5°C** (70% Humidity), crossing the High Risk threshold.
2. **1.5 km Alert Radius:** System identifies hospitals within the 1.5 km warning circle and issues urgent alerts.
3. **AI Surge Prediction:** Model forecasts a **+88% patient admission surge** over normal baseline.
4. **Resource Shortages:** System calculates required IV fluids, ORS packets & cooling blankets, highlighting shortages.
5. **Hospital Readiness:** Hospital staff acknowledges the alert, completes the preparedness checklist, and sets status to **Ready**.
6. **Ambulance Dispatch Form:** Ambulance unit `AMB-101` submits an emergency request for a 62yo Male with severe Heat Stroke.
7. **AI Hospital Ranking:** Multi-criteria engine ranks nearby hospitals, placing Metro City Central at #1.
8. **Destination Request:** Ambulance personnel selects Metro City Central and requests transport.
9. **Hospital Acceptance:** Hospital staff receives the real-time alert and accepts the incoming patient.
10. **Live Database Sync:** Live bed capacity, inventory, notifications, and audit log history are updated.

---

## 📜 License & Compliance

Developed for Hackathon Problem Statement **HC-02**. All simulated data is clearly labeled as synthetic for demonstration purposes.
