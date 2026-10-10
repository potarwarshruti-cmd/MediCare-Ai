import { useState, useEffect, useCallback } from 'react';
import type { WeatherData } from '../types';

export interface HourlyForecastItem {
  time: string;
  temperature_c: number;
  humidity_pct: number;
  heat_index_c: number;
}

export interface LiveWeatherState {
  weather: WeatherData | null;
  hourlyForecast: HourlyForecastItem[];
  status: 'idle' | 'loading' | 'success' | 'error';
  errorMessage: string | null;
  refetch: () => void;
}

/**
 * Calculates Heat Index in Celsius using the standard NWS Rothfusz regression algorithm.
 */
export function calculateHeatIndexC(tempC: number, humidityPct: number): number {
  if (tempC < 26.7) {
    return Math.round(tempC * 10) / 10;
  }

  const T = tempC * 1.8 + 32; // Convert to Fahrenheit for NWS formula
  const RH = humidityPct;

  let hiF =
    -42.379 +
    2.04901523 * T +
    10.14333127 * RH -
    0.22475541 * T * RH -
    0.00683783 * T * T -
    0.05481717 * RH * RH +
    0.00122874 * T * T * RH +
    0.00085282 * T * RH * RH -
    0.00000199 * T * T * RH * RH;

  // Adjustments
  if (RH < 13 && T >= 80 && T <= 112) {
    const adj = ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    hiF -= adj;
  } else if (RH > 85 && T >= 80 && T <= 87) {
    const adj = ((RH - 85) / 10) * ((87 - T) / 5);
    hiF += adj;
  }

  const hiC = (hiF - 32) / 1.8;
  return Math.round(hiC * 10) / 10;
}

/**
 * Custom hook to fetch real-time weather and hourly forecast from Open-Meteo API.
 */
export function useLiveWeather(
  latitude: number | null,
  longitude: number | null,
  warningThresholdC = 38.0,
  highRiskThresholdC = 41.0,
  autoRefreshMinutes = 5
): LiveWeatherState {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    if (latitude == null || longitude == null || (latitude === 0 && longitude === 0)) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m&hourly=temperature_2m,relative_humidity_2m&forecast_days=1&timezone=auto`;
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });

      if (!res.ok) {
        throw new Error(`Open-Meteo API returned status ${res.status}`);
      }

      const data = await res.json();
      const currentTemp = data.current?.temperature_2m ?? 30.0;
      const currentHum = data.current?.relative_humidity_2m ?? 50.0;
      const heatIndex = calculateHeatIndexC(currentTemp, currentHum);

      let category: 'Normal' | 'Warning' | 'High Risk' = 'Normal';
      if (currentTemp >= highRiskThresholdC || heatIndex >= 42.0) {
        category = 'High Risk';
      } else if (currentTemp >= warningThresholdC || heatIndex >= 38.0) {
        category = 'Warning';
      }

      const weatherObj: WeatherData = {
        location_name: `GPS Location (${latitude.toFixed(3)}°, ${longitude.toFixed(3)}°)`,
        temperature_c: Math.round(currentTemp * 10) / 10,
        humidity_pct: Math.round(currentHum),
        heat_index_c: heatIndex,
        heat_risk_category: category,
        last_updated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        source: 'Open-Meteo Live Weather API',
      };

      // Hourly items (up to 24 hours)
      const hourlyTimes: string[] = data.hourly?.time || [];
      const hourlyTemps: number[] = data.hourly?.temperature_2m || [];
      const hourlyHums: number[] = data.hourly?.relative_humidity_2m || [];

      const parsedHourly: HourlyForecastItem[] = hourlyTimes.slice(0, 24).map((t, idx) => {
        const temp = hourlyTemps[idx] ?? currentTemp;
        const hum = hourlyHums[idx] ?? currentHum;
        return {
          time: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          temperature_c: Math.round(temp * 10) / 10,
          humidity_pct: Math.round(hum),
          heat_index_c: calculateHeatIndexC(temp, hum),
        };
      });

      setWeather(weatherObj);
      setHourlyForecast(parsedHourly);
      setStatus('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus('error');
      setErrorMessage(`Failed to fetch real-time weather from Open-Meteo API: ${msg}`);
    }
  }, [latitude, longitude, warningThresholdC, highRiskThresholdC]);

  useEffect(() => {
    fetchWeather();
    if (autoRefreshMinutes > 0) {
      const interval = setInterval(fetchWeather, autoRefreshMinutes * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchWeather, autoRefreshMinutes]);

  return {
    weather,
    hourlyForecast,
    status,
    errorMessage,
    refetch: fetchWeather,
  };
}
