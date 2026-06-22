const { db } = require("../db");

/**
 * Checks incoming requests against the domain whitelist.
 *
 * Rules:
 *  - No Origin / Referer header (server-to-server, curl) → PASS
 *  - Origin/Referer hostname found in DB with active:true   → PASS + log
 *  - Otherwise                                              → 403 + log
 */
async function checkDomain(req, res, next) {
  const origin  = req.headers.origin  || "";
  const referer = req.headers.referer || "";

  function extractHost(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
  }

  const host = extractHost(origin) || extractHost(referer) || "";

  // Allow direct / server-to-server calls
  if (!host) return next();

  const allowed = await db.domains.findOne({ domain: host, active: true });

  const logEntry = {
    type:      allowed ? "allowed" : "blocked",
    domain:    host,
    institute: req.params.institute || "",
    method:    req.method,
    path:      req.originalUrl,
    ip:        req.headers["x-forwarded-for"] || req.ip || "",
    at:        new Date(),
  };
  await db.logs.insert(logEntry);

  if (!allowed) {
    return res.status(403).json({
      error:   "Domain not whitelisted",
      domain:  host,
      message: "Ask the admin to whitelist your domain at /admin",
    });
  }

  next();
}

module.exports = { checkDomain };
