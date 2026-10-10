import math

def calculate_resource_requirements(additional_patients: float, horizon_hours: int = 24):
    """
    Computes expected resource demand based on clinical heatwave protocols.
    Assumes ~40% of extra heatwave patients require IV rehydration, 25% require active cooling beds,
    and 15% require ICU care.
    """
    factor = horizon_hours / 24.0
    
    extra_staffed_beds = math.ceil(additional_patients * 0.85)
    extra_icu_beds = math.ceil(additional_patients * 0.15)
    extra_cooling_beds = math.ceil(additional_patients * 0.35)
    
    additional_doctors = math.ceil(additional_patients / 8.0)
    additional_nurses = math.ceil(additional_patients / 3.0)

    # Supplies required per patient per 24h
    iv_fluid_bags_needed = math.ceil(additional_patients * 3.5 * factor) # 3.5 bags (1000ml) per heat stroke/exhaustion patient
    ors_packets_needed = math.ceil(additional_patients * 4.0 * factor)
    cooling_blankets_needed = math.ceil(additional_patients * 0.4 * factor)
    ice_packs_needed = math.ceil(additional_patients * 5.0 * factor)
    oxygen_cylinders_needed = math.ceil(additional_patients * 0.25 * factor)

    return {
        "extra_staffed_beds": extra_staffed_beds,
        "extra_icu_beds": extra_icu_beds,
        "extra_cooling_beds": extra_cooling_beds,
        "additional_doctors": additional_doctors,
        "additional_nurses": additional_nurses,
        "supplies": [
            {"item_name": "Normal Saline 0.9% (1000ml IV)", "category": "IV Fluids", "required_quantity": iv_fluid_bags_needed, "unit": "bags"},
            {"item_name": "Oral Rehydration Salts (ORS)", "category": "Medication", "required_quantity": ors_packets_needed, "unit": "packets"},
            {"item_name": "Hydrogel Cooling Blankets", "category": "Cooling Gear", "required_quantity": cooling_blankets_needed, "unit": "units"},
            {"item_name": "Instant Cold Ice Packs", "category": "Cooling Gear", "required_quantity": ice_packs_needed, "unit": "packs"},
            {"item_name": "Medical Oxygen (Type D Cylinder)", "category": "Oxygen", "required_quantity": oxygen_cylinders_needed, "unit": "cylinders"}
        ]
    }

def calculate_stock_replenishment(inventory_items: list, predicted_additional_patients: float):
    """
    Formulas:
    Recommended stock = Forecast consumption during replenishment + Safety stock
    Additional quantity to replenish = max(0, Recommended stock - Current usable stock - Confirmed incoming stock)
    """
    recommendations = []
    
    # Consumption factor per patient for each category
    consumption_map = {
        "IV Fluids": 3.5,
        "Medication": 4.0,
        "Cooling Gear": 2.5,
        "Oxygen": 0.3,
        "Equipment": 0.5
    }

    for item in inventory_items:
        cat = item.get("category", "Medication")
        rate = consumption_map.get(cat, 2.0)
        
        forecast_consumption = math.ceil(predicted_additional_patients * rate * (item.get("lead_time_days", 1) + 1))
        usable = item.get("usable_quantity", 0)
        incoming = item.get("incoming_quantity", 0)
        safety = item.get("safety_stock", 20)

        recommended_stock = forecast_consumption + safety
        shortage = max(0, recommended_stock - usable - incoming)

        if shortage > 50:
            priority = "High"
        elif shortage > 0:
            priority = "Medium"
        else:
            priority = "Low"

        recommendations.append({
            "item_id": item.get("id"),
            "item_name": item.get("item_name"),
            "category": cat,
            "current_usable_stock": usable,
            "confirmed_incoming_stock": incoming,
            "forecast_consumption": forecast_consumption,
            "safety_stock": safety,
            "recommended_stock": recommended_stock,
            "shortage_quantity": shortage,
            "lead_time_days": item.get("lead_time_days", 1),
            "priority": priority,
            "unit": item.get("unit", "units"),
            "review_status": "Shortage Action Needed" if shortage > 0 else "Sufficient Stock"
        })

    return recommendations
