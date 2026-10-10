import { useState, useCallback } from 'react';

export type GeoStatus =
  | 'idle'
  | 'requesting'
  | 'success'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'error';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy: number; // metres
}

export interface GeolocationState {
  status: GeoStatus;
  coords: GeoCoords | null;
  errorMessage: string | null;
  requestLocation: () => void;
}

/**
 * useGeolocation — Requests the device's real GPS position via the
 * browser Geolocation API. Returns explicit permission/loading/error states.
 *
 * Never silently falls back to a hardcoded location.
 */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      setErrorMessage(
        'Geolocation is not supported by this browser. Please use a modern browser or switch to a device with GPS support.'
      );
      return;
    }

    setStatus('requesting');
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus('success');
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setStatus('denied');
            setErrorMessage(
              'Location permission was denied. Please enable location access in your browser settings and try again.'
            );
            break;
          case error.POSITION_UNAVAILABLE:
            setStatus('unavailable');
            setErrorMessage(
              'Your current location is unavailable. Ensure GPS is enabled on your device and that you are not in airplane mode.'
            );
            break;
          case error.TIMEOUT:
            setStatus('timeout');
            setErrorMessage(
              'Location request timed out. You may be in a weak signal area. Please try again.'
            );
            break;
          default:
            setStatus('error');
            setErrorMessage(`An unexpected geolocation error occurred: ${error.message}`);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }, []);

  return { status, coords, errorMessage, requestLocation };
}
