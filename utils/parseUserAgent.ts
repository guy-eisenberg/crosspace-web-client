export function parseUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase();

  // Detect device type
  let deviceType = "Desktop";

  if (ua.includes("iphone")) {
    deviceType = "Iphone";
  } else if (ua.includes("ipad")) {
    deviceType = "Ipad";
  } else if (ua.includes("android") && ua.includes("mobile")) {
    deviceType = "Android";
  } else if (ua.includes("android")) {
    deviceType = "Android-Tablet";
  } else if (ua.includes("macintosh") || ua.includes("mac os x")) {
    deviceType = "Mac";
  } else if (ua.includes("windows")) {
    deviceType = "Windows";
  } else if (ua.includes("linux") || ua.includes("x11")) {
    deviceType = "Linux";
  } else if (ua.includes("tv") || ua.includes("smarttv")) {
    deviceType = "Tv";
  } else if (ua.includes("mobile") || ua.includes("phone")) {
    deviceType = "Mobile";
  }

  // Detect browser and version
  let browser = "Unknown";
  let version = "";

  // Check for specific browsers (order matters for accuracy)
  if (ua.includes("edg/") || ua.includes("edge/")) {
    browser = "Edge";
    const match = ua.match(/edg?\/(\d+(?:\.\d+)*)/);
    version = match ? match[1] : "";
  } else if (ua.includes("opr/") || ua.includes("opera/")) {
    browser = "Opera";
    const match = ua.match(/opr\/(\d+(?:\.\d+)*)/);
    version = match ? match[1] : "";
  } else if (ua.includes("chrome/") && !ua.includes("chromium/")) {
    browser = "Chrome";
    const match = ua.match(/chrome\/(\d+(?:\.\d+)*)/);
    version = match ? match[1] : "";
  } else if (ua.includes("firefox/")) {
    browser = "Firefox";
    const match = ua.match(/firefox\/(\d+(?:\.\d+)*)/);
    version = match ? match[1] : "";
  } else if (ua.includes("safari/") && !ua.includes("chrome/")) {
    browser = "Safari";
    const match = ua.match(/version\/(\d+(?:\.\d+)*)/);
    version = match ? match[1] : "";
  } else if (ua.includes("msie") || ua.includes("trident/")) {
    browser = "Ie";
    const ieMatch = ua.match(/msie (\d+(?:\.\d+)*)/);
    const tridentMatch = ua.match(/rv:(\d+(?:\.\d+)*)/);
    version = ieMatch ? ieMatch[1] : tridentMatch ? tridentMatch[1] : "";
  } else if (ua.includes("chromium/")) {
    browser = "Chromium";
    const match = ua.match(/chromium\/(\d+(?:\.\d+)*)/);
    version = match ? match[1] : "";
  }

  // Add version to browser name if available
  if (version) {
    browser = `${browser}-${version}`;
  }

  return `${deviceType}: ${browser}`;
}
