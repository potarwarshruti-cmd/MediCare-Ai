import math
import datetime

def haversine_distance_km(lat1, lon1, lat2, lon2):
    R = 6371.0 # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)

def rank_hospitals_for_ambulance(
    ambulance_lat: float,
    ambulance_lng: float,
    required_capabilities: list,
    urgency_level: str,
    is_heat_illness: bool,
    hospitals: list
):
    """
    Ranks registered hospitals based on 5 weighted criteria:
    1. Clinical Capability fit (35%)
    2. Confirmed Acceptance / Readiness status (25%)
    3. Bed & ICU Availability (20%)
    4. Estimated Travel Time (15%)
    5. Data Freshness (5%)
    """
    ranked_list = []

    for h in hospitals:
        # Distance & ETA calculation (approx 30 km/h average emergency speed)
        dist_km = haversine_distance_km(ambulance_lat, ambulance_lng, h["latitude"], h["longitude"])
        eta_min = math.ceil((dist_km / 30.0) * 60.0) + 2 # Add 2 min dispatch overhead

        # 1. Capabilities match score (0 to 100)
        h_caps = set(h.get("capabilities", []))
        req_caps = set(required_capabilities)
        if is_heat_illness:
            req_caps.add("heat_cooling")
        
        if req_caps:
            matched = len(h_caps.intersection(req_caps))
            cap_score = (matched / len(req_caps)) * 100.0
        else:
            cap_score = 100.0

        # 2. Readiness / Acceptance Status (0 to 100)
        res = h.get("resources", {})
        readiness = res.get("readiness_status", "Ready")
        if readiness == "Ready":
            readiness_score = 100.0
        elif readiness == "Preparing":
            readiness_score = 70.0
        else:
            readiness_score = 30.0

        # 3. Bed & ICU Availability Score (0 to 100)
        avail_beds = res.get("available_staffed_beds", 0)
        avail_icu = res.get("available_icu_beds", 0)
        
        if urgency_level in ["Critical", "High"]:
            bed_score = min(100.0, (avail_icu * 15.0) + (avail_beds * 2.0))
        else:
            bed_score = min(100.0, avail_beds * 4.0)

        # 4. Travel Time Score (100 for 0 min, dropping with distance)
        travel_score = max(0.0, 100.0 - (eta_min * 3.5))

        # 5. Data Freshness (minutes since last update)
        last_upd = res.get("last_updated")
        if isinstance(last_upd, str):
            try:
                last_upd = datetime.datetime.fromisoformat(last_upd)
            except Exception:
                last_upd = datetime.datetime.utcnow()
        elif not last_upd:
            last_upd = datetime.datetime.utcnow()

        minutes_ago = (datetime.datetime.utcnow() - last_upd).total_seconds() / 60.0
        if minutes_ago <= 15:
            freshness_score = 100.0
            freshness_label = "Live (Updated < 15m ago)"
        elif minutes_ago <= 60:
            freshness_score = 70.0
            freshness_label = f"Fresh ({int(minutes_ago)}m ago)"
        else:
            freshness_score = 40.0
            freshness_label = f"Stale ({int(minutes_ago // 60)}h ago)"

        # Composite score
        total_score = round(
            (cap_score * 0.35) +
            (readiness_score * 0.25) +
            (bed_score * 0.20) +
            (travel_score * 0.15) +
            (freshness_score * 0.05),
            1
        )

        # Generate human-readable recommendation reasons
        reasons = []
        if cap_score == 100.0:
            reasons.append("100% Clinical capability match for patient condition")
        if is_heat_illness and "heat_cooling" in h_caps:
            reasons.append("Dedicated Heatwave Cooling Ward available")
        if avail_icu > 3 and urgency_level == "Critical":
            reasons.append(f"{avail_icu} ICU beds immediately available")
        if eta_min <= 10:
            reasons.append(f"Fastest route: {eta_min} min travel time ({dist_km} km)")
        if readiness == "Ready":
            reasons.append("Hospital confirmed ready to accept incoming emergencies")

        ranked_list.append({
            "hospital_id": h["id"],
            "name": h["name"],
            "latitude": h["latitude"],
            "longitude": h["longitude"],
            "address": h.get("address", ""),
            "contact_phone": h.get("contact_phone", ""),
            "capabilities": h.get("capabilities", []),
            "distance_km": dist_km,
            "eta_minutes": eta_min,
            "available_staffed_beds": avail_beds,
            "available_icu_beds": avail_icu,
            "available_cooling_beds": res.get("available_cooling_beds", 0),
            "available_doctors": res.get("available_doctors", 0),
            "readiness_status": readiness,
            "data_freshness_label": freshness_label,
            "match_score": total_score,
            "recommendation_reasons": reasons
        })

    # Sort descending by match score
    ranked_list.sort(key=lambda x: x["match_score"], reverse=True)
    return ranked_list
