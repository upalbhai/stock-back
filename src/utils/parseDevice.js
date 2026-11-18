/**
 * Lightweight User-Agent parser — no dependencies.
 * Returns { browser, os, deviceType, deviceName }.
 */

const BROWSERS = [
  { name: "Edge",    regex: /Edg(?:e|A|iOS)?\/(\d+)/ },
  { name: "Opera",   regex: /(?:OPR|Opera)\/(\d+)/ },
  { name: "Chrome",  regex: /Chrome\/(\d+)/ },
  { name: "Firefox", regex: /Firefox\/(\d+)/ },
  { name: "Safari",  regex: /Version\/(\d+).*Safari/ },
  { name: "IE",      regex: /(?:MSIE |Trident.*rv:)(\d+)/ }
];

const OS_LIST = [
  { name: "iOS",     regex: /iPhone|iPad|iPod/ },
  { name: "Android", regex: /Android/ },
  { name: "macOS",   regex: /Mac OS X|Macintosh/ },
  { name: "Windows", regex: /Windows NT/ },
  { name: "Linux",   regex: /Linux/ },
  { name: "ChromeOS",regex: /CrOS/ }
];

export function parseDevice(userAgent) {
  if (!userAgent) {
    return {
      browser: "Unknown",
      os: "Unknown",
      deviceType: "unknown",
      deviceName: "Unknown device"
    };
  }

  // Detect browser
  let browser = "Unknown Browser";
  for (const b of BROWSERS) {
    const match = userAgent.match(b.regex);
    if (match) {
      browser = `${b.name} ${match[1]}`;
      break;
    }
  }

  // Detect OS
  let os = "Unknown OS";
  for (const o of OS_LIST) {
    if (o.regex.test(userAgent)) {
      os = o.name;
      break;
    }
  }

  // Detect device type
  let deviceType = "desktop";
  if (/Mobi|Android.*Mobile|iPhone|iPod/.test(userAgent)) {
    deviceType = "mobile";
  } else if (/iPad|Android(?!.*Mobile)|Tablet/.test(userAgent)) {
    deviceType = "tablet";
  }

  const deviceName = `${browser} on ${os}`;

  return { browser, os, deviceType, deviceName };
}
