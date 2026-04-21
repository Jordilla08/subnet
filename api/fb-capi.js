// ─────────────────────────────────────────────────────────────────────────────
// Conversions API endpoint — receives events from the browser and forwards
// them to Meta's Conversions API with hashed user data for iOS 14.5+ tracking
// ─────────────────────────────────────────────────────────────────────────────
//
// Install location: /api/fb-capi.js  (Vercel auto-detects this as a serverless
// function at https://subnetapp.com/api/fb-capi)
//
// Required env vars in Vercel:
//   META_PIXEL_ID              = your pixel ID (public)
//   META_CAPI_ACCESS_TOKEN     = from Events Manager (KEEP SECRET)

import crypto from "crypto";

// SHA-256 hash user data before sending to Meta (required by CAPI)
function hash(value) {
  if (!value) return undefined;
  return crypto
    .createHash("sha256")
    .update(String(value).toLowerCase().trim())
    .digest("hex");
}

export default async function handler(req, res) {
  // CORS + method guard
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.error("Missing META_PIXEL_ID or META_CAPI_ACCESS_TOKEN env vars");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const body = req.body;

    // Capture client IP (for better CAPI matching)
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.headers["x-real-ip"] ||
      req.connection?.remoteAddress;

    // Build hashed user_data per Meta's CAPI spec
    const userData = {
      em: body.user_data?.em ? [hash(body.user_data.em)] : undefined,
      fn: body.user_data?.fn ? [hash(body.user_data.fn)] : undefined,
      ln: body.user_data?.ln ? [hash(body.user_data.ln)] : undefined,
      client_ip_address: clientIp,
      client_user_agent: body.user_data?.client_user_agent,
    };

    // Strip out undefined values
    Object.keys(userData).forEach(
      (k) => userData[k] === undefined && delete userData[k]
    );

    const payload = {
      data: [
        {
          event_name: body.event_name,
          event_time: body.event_time || Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url,
          action_source: body.action_source || "website",
          user_data: userData,
          custom_data: body.custom_data || {},
        },
      ],
    };

    const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;

    const metaResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error("Meta CAPI error:", data);
      return res.status(500).json({ error: "CAPI forward failed", details: data });
    }

    return res.status(200).json({ success: true, ...data });
  } catch (err) {
    console.error("CAPI handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
