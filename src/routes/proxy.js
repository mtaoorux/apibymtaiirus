const router = require("express").Router({ mergeParams: true });
const { createProxyMiddleware } = require("http-proxy-middleware");
const { db } = require("../db");
const { checkDomain } = require("../middleware/domainCheck");

/**
 * /api/:institute/*
 *
 * 1. checkDomain  — verify caller is whitelisted
 * 2. Look up institute in DB
 * 3. Strip /api/:institute prefix and forward to target
 */
router.use("/:institute", checkDomain, async (req, res, next) => {
  const { institute } = req.params;

  const cfg = await db.institutes.findOne({ name: institute, active: true });
  if (!cfg) {
    return res.status(404).json({
      error:   `Institute "${institute}" not found or disabled`,
      hint:    "Check /admin/institutes to see active institutes",
    });
  }

  createProxyMiddleware({
    target:       cfg.target,
    changeOrigin: true,
    // Strip /api/{institute} → forward the rest as-is to target
    pathRewrite: (path) => {
      const stripped = path.replace(`/api/${institute}`, "");
      return stripped || "/";
    },
    on: {
      proxyReq: (proxyReq, req) => {
        // Tell the backend which institute was requested
        proxyReq.setHeader("X-Institute", institute);
        // Forward real client IP
        const clientIp = req.headers["x-forwarded-for"] || req.ip || "";
        proxyReq.setHeader("X-Forwarded-For", clientIp);

        console.log(
          `[PROXY] [${institute.toUpperCase()}] ${req.method} ${req.originalUrl}  →  ${cfg.target}${proxyReq.path}`
        );
      },
      proxyRes: (proxyRes, req) => {
        // Re-open CORS on the proxied response
        proxyRes.headers["access-control-allow-origin"]  = req.headers.origin || "*";
        proxyRes.headers["access-control-allow-methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
      },
      error: (err, _req, res) => {
        console.error(`[PROXY ERROR] [${institute}]`, err.message);
        res.status(502).json({
          error:     "Bad Gateway",
          institute,
          target:    cfg.target,
          detail:    err.message,
        });
      },
    },
  })(req, res, next);
});

module.exports = router;
