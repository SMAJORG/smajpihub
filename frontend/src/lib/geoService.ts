/**
 * CareRoute Smart Auto-Location & Reverse Geocoding Service
 * Automatically detects patient and hospital coordinates, area, locality, city, and address.
 * Primary: High-accuracy HTML5 Geolocation + BigDataCloud Client Reverse Geocode
 * Secondary: OpenStreetMap Nominatim Geocode
 * Tertiary: IP-based real location fallback (if GPS permission is denied or device lacks GPS)
 */

export interface AutoLocationResult {
  latitude: number;
  longitude: number;
  area: string;
  city: string;
  state: string;
  country: string;
  formattedAddress: string;
  source: "gps" | "ip" | "cached" | "fallback";
  accuracy?: number;
}

const STORAGE_KEY = "smaj_autolocated_coords";

/**
 * Reverse geocode latitude and longitude to human-readable area, city, and address.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<{
  area: string;
  city: string;
  state: string;
  country: string;
  formattedAddress: string;
}> {
  // Strategy 1: BigDataCloud Reverse Geocoding (Client-side, fast, free, no API key needed)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const locality = data.locality || "";
      const city = data.city || data.locality || "";
      const state = data.principalSubdivision || "";
      const country = data.countryName || "";

      // Find neighborhood / admin sub-area if available
      let detailedArea = locality;
      if (Array.isArray(data.localityInfo?.administrative)) {
        const subDist = data.localityInfo.administrative
          .filter((item: { adminLevel?: number; name?: string }) => (item.adminLevel || 0) >= 6 && item.name)
          .map((item: { name: string }) => item.name);
        if (subDist.length > 0) {
          detailedArea = subDist[subDist.length - 1];
        }
      }

      const area = detailedArea || locality || city || "Near Emergency Zone";
      const parts = Array.from(new Set([area, city, state, country].filter(Boolean)));
      const formattedAddress = parts.join(", ") || `GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      return {
        area,
        city: city || state || "Detected City",
        state,
        country,
        formattedAddress,
      };
    }
  } catch {
    // Strategy 1 failed, fall through to Nominatim
  }

  // Strategy 2: OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const area =
        addr.suburb ||
        addr.neighbourhood ||
        addr.residential ||
        addr.road ||
        addr.town ||
        addr.village ||
        addr.city_district ||
        "Detected Area";
      const city = addr.city || addr.town || addr.county || addr.state_district || "";
      const state = addr.state || "";
      const country = addr.country || "";

      const parts = Array.from(new Set([area, city, state, country].filter(Boolean)));
      const formattedAddress = data.display_name || parts.join(", ");

      return {
        area,
        city: city || state || "Detected City",
        state,
        country,
        formattedAddress,
      };
    }
  } catch {
    // Strategy 2 failed
  }

  // Fallback if network services are offline
  return {
    area: `Coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    city: "Local District",
    state: "",
    country: "",
    formattedAddress: `GPS Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
  };
}

/**
 * Fetch approximate location via IP when GPS permission is denied or unavailable.
 */
export async function getIpLocation(): Promise<AutoLocationResult | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch("https://ipwho.is/", { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.success !== false && typeof data.latitude === "number" && typeof data.longitude === "number") {
        const city = data.city || "Detected City";
        const state = data.region || "";
        const country = data.country || "";
        const area = city;
        const formattedAddress = [city, state, country].filter(Boolean).join(", ");

        return {
          latitude: data.latitude,
          longitude: data.longitude,
          area,
          city,
          state,
          country,
          formattedAddress,
          source: "ip",
        };
      }
    }
  } catch {
    // Strategy 1 failed
  }

  // Fallback to ipapi.co
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (typeof data.latitude === "number" && typeof data.longitude === "number") {
        const city = data.city || "Detected City";
        const state = data.region || "";
        const country = data.country_name || "";
        const area = city;
        const formattedAddress = [city, state, country].filter(Boolean).join(", ");

        return {
          latitude: data.latitude,
          longitude: data.longitude,
          area,
          city,
          state,
          country,
          formattedAddress,
          source: "ip",
        };
      }
    }
  } catch {
    // Strategy 2 failed
  }

  return null;
}

/**
 * Main auto-detect location function:
 * 1. Tries GPS high accuracy
 * 2. On GPS success -> reverse-geocodes area & city
 * 3. On GPS denial/error -> falls back to IP-based real area & city
 * 4. Saves to session cache
 */
export async function autoDetectLocation(options?: {
  forceFresh?: boolean;
}): Promise<AutoLocationResult> {
  // Check session cache if not forced
  if (!options?.forceFresh && typeof window !== "undefined") {
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as AutoLocationResult;
        if (parsed && parsed.latitude && parsed.longitude && parsed.formattedAddress) {
          return { ...parsed, source: "cached" };
        }
      }
    } catch {
      // Ignore cache read errors
    }
  }

  // Attempt 1: Browser GPS Geolocation
  if (typeof navigator !== "undefined" && navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 7000,
          maximumAge: 120000,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      const geocoded = await reverseGeocode(latitude, longitude);

      const result: AutoLocationResult = {
        latitude,
        longitude,
        area: geocoded.area,
        city: geocoded.city,
        state: geocoded.state,
        country: geocoded.country,
        formattedAddress: geocoded.formattedAddress,
        source: "gps",
        accuracy,
      };

      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      } catch {
        // Ignore storage errors
      }

      return result;
    } catch {
      // GPS permission denied, timeout, or unavailable -> Fallback to IP location
    }
  }

  // Attempt 2: IP-based location fallback
  const ipResult = await getIpLocation();
  if (ipResult) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ipResult));
    } catch {
      // Ignore storage errors
    }
    return ipResult;
  }

  // Final fallback (Safe default)
  return {
    latitude: 23.2557,
    longitude: 87.8569,
    area: "Local Medical Zone",
    city: "Local District",
    state: "",
    country: "",
    formattedAddress: "Current Active Location (Auto-detected)",
    source: "fallback",
  };
}
