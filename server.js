
/**
 * server.js — MTAIIRUS Multi-Institute Proxy
 *
 * ENV vars (set in Render dashboard):
 *   ADMIN_PASSWORD  — admin login password  (default: admin123  ← CHANGE THIS)
 *   JWT_SECRET      — JWT signing secret    (default: change-me-please)
 *   PORT            — server port           (default: 3000)
 */

const express      = require("express");
const cookieParser = require("cookie-parser");

const { seedDefaults }  = require("./src/db");
const { requireAdmin }  = require("./src/middleware/auth");
const corsMiddleware    = require("./src/middleware/cors");
const { adminPanel }    = require("./src/views/adminPanel");
const { loginPage }     = require("./src/views/loginPage");

const authRoutes       = require("./src/routes/auth");
const domainRoutes     = require("./src/routes/domains");
const instituteRoutes  = require("./src/routes/institutes");
const logRoutes        = require("./src/routes/logs");
const statsRoutes      = require("./src/routes/stats");
const proxyRoutes      = require("./src/routes/proxy");

const PORT = process.env.PORT || 3000;
const app  = express();

// ── Global middleware ─────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Public routes ─────────────────────────────────────────────────
app.get("/",       (_req, res) => res.redirect("/admin"));
app.get("/health", (_req, res) => res.json({ status: "ok", version: "2.0.0", ts: new Date() }));

// ── Admin UI (browser pages) ──────────────────────────────────────
app.get("/admin/login", (_req, res) => res.send(loginPage()));
app.get("/admin",       requireAdmin, (_req, res) => res.send(adminPanel()));
app.get("/admin/*",     requireAdmin, (_req, res) => res.send(adminPanel()));

// ── Admin API — auth (public: login / logout) ─────────────────────
app.use("/admin/api", authRoutes);

// ── Admin API — protected routes (requireAdmin applied per-router) ─
const adminRouter = express.Router();
adminRouter.use(requireAdmin);
adminRouter.use("/domains",    domainRoutes);
adminRouter.use("/institutes", instituteRoutes);
adminRouter.use("/logs",       logRoutes);
adminRouter.use("/stats",      statsRoutes);
app.use("/admin/api", adminRouter);

// ── Proxy ─────────────────────────────────────────────────────────
app.use("/api", proxyRoutes);

// ── 404 ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: "Not found",
    hint:  "Proxy: /api/{institute}/your-path  •  Admin: /admin",
  });
});

// ── Boot ──────────────────────────────────────────────────────────
seedDefaults().then(() => {
  app.listen(PORT, () => {
    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║      MTAIIRUS Proxy Server v2.0          ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log(`║  Port  : ${String(PORT).padEnd(32)}║`);
    console.log(`║  Admin : http://localhost:${PORT}/admin       ║`);
    console.log(`║  Proxy : /api/{institute}/...            ║`);
    console.log("╚══════════════════════════════════════════╝\n");
  });
});
