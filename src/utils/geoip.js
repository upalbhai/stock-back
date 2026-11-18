/**
 * IP Geolocation utility using ip-api.com (free, no key required).
 * Includes in-memory cache (1 hour TTL) and graceful fallback.
 */

const CACHE = new Map();          // IP -> { data, timestamp }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|::1|localhost|0\.0\.0\.0|fc|fd|fe80)/;

const FALLBACK = { city: "Unknown", region: "", country: "Unknown" };

export function getCachedLocation(ip) {
  if (!ip || PRIVATE_IP.test(ip)) return { ...FALLBACK };
  const cleanIp = ip.replace(/^::ffff:/, "");
  if (PRIVATE_IP.test(cleanIp)) return { ...FALLBACK };
  const cached = CACHE.get(cleanIp);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data };
  }
  return null;
}

/**
 * Resolve an IP address to { city, region, country }.
 * Returns FALLBACK for private/local IPs or if the API is unreachable.
 */
export async function resolveLocation(ip) {
  if (!ip || PRIVATE_IP.test(ip)) {
    return { ...FALLBACK };
  }

  // Strip IPv6-mapped IPv4 prefix
  const cleanIp = ip.replace(/^::ffff:/, "");
  if (PRIVATE_IP.test(cleanIp)) {
    return { ...FALLBACK };
  }

  // Check cache
  const cached = CACHE.get(cleanIp);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { ...cached.data };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500); // 1.5s max timeout

    const res = await fetch(`http://ip-api.com/json/${cleanIp}?fields=city,regionName,country,status`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { ...FALLBACK };
    }

    const json = await res.json();

    if (json.status !== "success") {
      return { ...FALLBACK };
    }

    const data = {
      city: json.city || "Unknown",
      region: json.regionName || "",
      country: json.country || "Unknown"
    };

    // Cache result
    CACHE.set(cleanIp, { data, timestamp: Date.now() });

    // Evict old entries periodically
    if (CACHE.size > 500) {
      const now = Date.now();
      for (const [key, val] of CACHE) {
        if (now - val.timestamp > CACHE_TTL) CACHE.delete(key);
      }
    }

    return data;
  } catch (err) {
    // Fail silently with fallback
    return { ...FALLBACK };
  }
}
