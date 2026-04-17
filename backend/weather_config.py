# InFin City-Center Coordinates & Weather Thresholds

CITIES = {
    "Chennai": {"lat": 13.0827, "lon": 80.2707},
    "Bangalore": {"lat": 12.9716, "lon": 77.5946},
    "Hyderabad": {"lat": 17.3850, "lon": 78.4867},
    "Mumbai": {"lat": 19.0760, "lon": 72.8777},
    "Delhi": {"lat": 28.6139, "lon": 77.2090}
}

# Thresholds for automated claim triggering
THRESHOLDS = {
    "heavy_rain_mm": 35.0,  # mm in last hour (Updated to 35mm per user spec)
    "flood_mm": 50.0,       # severe flooding
    "heatwave_c": 42.0,     # severe heat
    "aqi_threshold": 300.0, # AQI (Placeholder)
    "low_visibility_km": 1.0, # dangerous for travel
    "severe_storm": ["Thunderstorm", "Tornado", "Squall"]
}

# DVS Pass Condition
DVS_PASS_THRESHOLD = 0.70

# DVS Formula Weights
DVS_WEIGHTS = {
    "source_agreement": 0.60,
    "threshold_breach": 0.40
}

# Trust scoring weights (for internal trust indicator only)
TRUST_WEIGHTS = {
    "temp_variance_penalty": 0.1, # Penalty per degree of difference
    "rain_variance_penalty": 0.2, # Penalty per mm of difference
    "condition_mismatch_penalty": 0.3 # Penalty if base condition differs
}
