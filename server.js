/**
 * server.js — MTAIIRUS Multi-Institute Proxy
 *
 * Environment variables (set in Render dashboard):
 *   ADMIN_PASSWORD  — admin login password     (default: admin123)
 *   JWT_SECRET      — JWT signing secret        (default: change-me-please)
 *   PORT            — server port               (default: 3000)
 */

const express      = require("express");
const cookieParser = require("cookie-parser");

const { db, seedDefaults }  = require("./src/db");
const { requireAdmin }      = require("./src/middleware/auth");
const { cors }              = require("./src/middleware/cors");
const { adminPanel }        = require("./src/views/adminPanel");
const { loginPage }         = require("./src/views/loginPage");

const authRoutes       = require("./src/routes/auth");
const domainRoutes     = require("./src/routes/domains");
const instituteRoutes  = require("./src/routes/institutes");
const logRoutes        = require("./src/routes/logs");
const statsRoutes      = require("./src/routes/stats");
const proxyRoutes      = require("./src/routes/proxy");

const PORT = process.env.PORT || 3000;

const app = express();

// ── Global middleware ──────────────────────────────────────────────
app.use(cors);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Public ────────────────────────────────────────────────────────
app.get("/",        (_req, res) => res.redirect("/admin"));
app.get("/health",  (_req, res) => res.json({ status: "ok", version: "2.0.0", ts: new Date() }));

// ── Admin UI pages ────────────────────────────────────────────────
app.get("/admin/login",  (_req, res) => res.send(loginPage()));
app.get("/admin",         requireAdmin, (_req, res) => res.send(adminPanel()));
app.get("/admin/*",       requireAdmin, (_req, res) => res.send(adminPanel()));

// ── Admin API (protected) ─────────────────────────────────────────
app.use("/admin/api",           authRoutes);          // login/logout (no auth guard)
app.use("/admin/api/domains",   requireAdmin, domainRoutes);
app.use("/admin/api/institutes",requireAdmin, instituteRoutes);
app.use("/admin/api/logs",      requireAdmin, logRoutes);
app.use("/admin/api/stats",     requireAdmin, statsRoutes);

// ── Proxy routes ──────────────────────────────────────────────────
app.use("/api", proxyRoutes);

// ── 404 ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    hint:  "Use /api/{institute_name}/your-path  •  Admin at /admin",
  });
});

// ── Start ─────────────────────────────────────────────────────────
seedDefaults().then(() => {
  app.listen(PORT, () => {
    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║      MTAIIRUS Proxy Server v2.0          ║");
    console.log("╠══════════════════════════════════════════╣");
    console.log(`║  Port    : ${PORT.toString().padEnd(30)}║`);
    console.log(`║  Admin   : http://localhost:${PORT}/admin    ║`);
    console.log(`║  Proxy   : /api/{institute}/...          ║`);
    console.log(`║  Health  : /health                       ║`);
    console.log("╚══════════════════════════════════════════╝\n");
  });
});
