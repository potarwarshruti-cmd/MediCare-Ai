import { useState, useCallback } from 'react';
import type { HospitalData } from '../types';

export type OsmFetchStatus = 'idle' | 'fetching' | 'success' | 'error';

export interface OsmHospital extends HospitalData {
  osm_id: string;
  distance_km: number;
  is_osm_sourced: true;
  capacity_verified: false; // OSM data never includes live bed capacity
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Haversine formula: distance in km between two lat/lng pairs.
 */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate travel time: assumes 40 km/h average speed for emergency vehicles.
 */
function etaMinutes(distKm: number): number {
  return Math.max(2, Math.round((distKm / 40) * 60));
}

/**
 * Derive a readable address from OSM tags.
 */
function osmAddress(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }
  if (tags['addr:suburb'] || tags['addr:city']) {
    parts.push(tags['addr:suburb'] || tags['addr:city']);
  }
  if (tags['addr:state']) parts.push(tags['addr:state']);
  if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
  return parts.length > 0 ? parts.join(', ') : 'Address not listed in OpenStreetMap';
}

let osmIdCounter = 900000; // High range to avoid clash with backend IDs

/**
 * useNearbyHospitals — Fetches real hospitals from the OpenStreetMap
 * Overpass API based on actual device GPS coordinates and a search radius.
 *
 * Bed/ICU capacity is NEVER available from OSM and is clearly marked
 * as "unverified" in every returned record.
 */
export function useNearbyHospitals() {
  const [status, setStatus] = useState<OsmFetchStatus>('idle');
  const [hospitals, setHospitals] = useState<OsmHospital[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const fetchNearby = useCallback(async (
    latitude: number,
    longitude: number,
    radiusKm = 10
  ) => {
    setStatus('fetching');
    setErrorMessage(null);

    const radiusM = radiusKm * 1000;

    // Overpass QL — fetch hospitals (amenity=hospital) by bounding radius
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="hospital"](around:${radiusM},${latitude},${longitude});
        way["amenity"="hospital"](around:${radiusM},${latitude},${longitude});
        relation["amenity"="hospital"](around:${radiusM},${latitude},${longitude});
      );
      out center tags;
    `;

    const OVERPASS_ENDPOINTS = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ];

    let lastError: Error | null = null;

    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
          throw new Error(`Overpass API responded with HTTP ${response.status}`);
        }

        const data = await response.json();
        const elements: OverpassElement[] = data.elements || [];

        const parsed: OsmHospital[] = elements
          .map((el): OsmHospital | null => {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (!lat || !lon) return null;

            const tags = el.tags || {};
            const name = tags['name'] || tags['name:en'] || 'Unnamed Hospital';
            const dist = haversineKm(latitude, longitude, lat, lon);

            return {
              // Use large numeric ID to not collide with backend IDs
              id: osmIdCounter++,
              osm_id: `${el.type}/${el.id}`,
              name,
              latitude: lat,
              longitude: lon,
              address: osmAddress(tags),
              contact_phone: tags['phone'] || tags['contact:phone'] || 'Not listed',
              capabilities: [], // OSM does not expose clinical capabilities
              resources: {
                // All capacity data is UNVERIFIED from OSM
                total_staffed_beds: 0,
                available_staffed_beds: 0,
                total_icu_beds: 0,
                available_icu_beds: 0,
                available_doctors: 0,
                available_nurses: 0,
                cooling_center_capacity: 0,
                available_cooling_beds: 0,
                ed_capacity_status: 'Unverified',
                readiness_status: 'Unverified',
              },
              distance_km: parseFloat(dist.toFixed(2)),
              eta_minutes: etaMinutes(dist),
              match_score: undefined,
              recommendation_reasons: [
                'Source: OpenStreetMap (real location data)',
                'Bed & ICU capacity: UNVERIFIED — contact hospital directly',
              ],
              data_freshness_label: 'OSM Data — Capacity Unverified',
              is_osm_sourced: true,
              capacity_verified: false,
            };
          })
          .filter((h): h is OsmHospital => h !== null)
          .sort((a, b) => a.distance_km - b.distance_km);

        if (parsed.length === 0) {
          setErrorMessage(
            `No hospitals found within ${radiusKm} km of your location in OpenStreetMap. ` +
            `Try increasing the search radius or check if OpenStreetMap has coverage in your area.`
          );
          setStatus('error');
          return;
        }

        setHospitals(parsed);
        setLastFetchedAt(new Date());
        setStatus('success');
        return; // Success — stop trying other endpoints
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // All endpoints failed
    setStatus('error');
    setErrorMessage(
      `Failed to fetch nearby hospitals from OpenStreetMap. ` +
      `Please check your internet connection and try again. ` +
      `(${lastError?.message ?? 'Unknown error'})`
    );
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setHospitals([]);
    setErrorMessage(null);
    setLastFetchedAt(null);
  }, []);

  return {
    status,
    hospitals,
    errorMessage,
    lastFetchedAt,
    fetchNearby,
    reset,
  };
}
