// ─────────────────────────────────────────────────────────────────────────────
// Meta Pixel helper — wraps window.fbq safely and handles event deduplication
// ─────────────────────────────────────────────────────────────────────────────
//
// Usage anywhere in your app:
//   import { trackLead, trackPageView, track } from "./fbpixel";
//
//   // On waitlist submit:
//   trackLead({ email: "user@example.com", content_name: "Waitlist" });
//
// The eventID is used to deduplicate the browser Pixel call with the
// server-side Conversions API call, so Meta counts each conversion once.

// Generate a unique event ID for dedup between Pixel + CAPI
function makeEventId() {
  return `ev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// Safe wrapper — does nothing if Pixel hasn't loaded yet
function fbq(...args) {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq(...args);
  }
}

// Send event to CAPI endpoint on your server
async function sendToCAPI(eventName, eventId, userData = {}, customData = {}) {
  try {
    await fetch("/api/fb-capi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_name: eventName,
        event_id: eventId,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: window.location.href,
        user_data: {
          em: userData.email || null,
          fn: userData.firstName || null,
          ln: userData.lastName || null,
          client_user_agent: navigator.userAgent,
        },
        custom_data: customData,
      }),
    });
  } catch (err) {
    // Silent fail — Pixel will still report client-side
    console.warn("CAPI request failed:", err);
  }
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

export function trackPageView() {
  const eventId = makeEventId();
  fbq("track", "PageView", {}, { eventID: eventId });
  sendToCAPI("PageView", eventId);
}

export function trackLead(data = {}) {
  const eventId = makeEventId();
  fbq("track", "Lead", {
    content_name: data.content_name || "Waitlist",
    content_category: data.content_category || "Signup",
  }, { eventID: eventId });
  sendToCAPI("Lead", eventId, data, {
    content_name: data.content_name || "Waitlist",
  });
}

export function trackCompleteRegistration(data = {}) {
  const eventId = makeEventId();
  fbq("track", "CompleteRegistration", {
    content_name: data.content_name || "Account Created",
  }, { eventID: eventId });
  sendToCAPI("CompleteRegistration", eventId, data, {
    content_name: data.content_name || "Account Created",
  });
}

// Generic custom event
export function track(eventName, data = {}) {
  const eventId = makeEventId();
  fbq("track", eventName, data, { eventID: eventId });
  sendToCAPI(eventName, eventId, {}, data);
}
