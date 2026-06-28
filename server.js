/**
 * server.js — MTAIIRUS Multi-Institute Proxy (single-file, no import bugs)
 *
 * ENV vars (Render dashboard):
 *   ADMIN_PASSWORD  — admin password   (default: admin123)
 *   JWT_SECRET      — JWT secret       (default: change-me-please)
 *   PORT            — port             (default: 3000)
 */

const express      = require("express");
const cookieParser = require("cookie-parser");
const bcrypt       = require("bcryptjs");
const jwt          = require("jsonwebtoken");
const Datastore    = require("nedb-promises");
const path         = require("path");
const fs           = require("fs");
const { createProxyMiddleware } = require("http-proxy-middleware");

// ── Config ────────────────────────────────────────────────────────
const PORT       = process.env.PORT           || 3000;
const JWT_SECRET = process.env.JWT_SECRET     || "change-me-please";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";
const DB_DIR     = path.join(__dirname, "data");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── DB ────────────────────────────────────────────────────────────
const domainsDB    = Datastore.create({ filename: path.join(DB_DIR, "domains.db"),    autoload: true });
const institutesDB = Datastore.create({ filename: path.join(DB_DIR, "institutes.db"), autoload: true });
const logsDB       = Datastore.create({ filename: path.join(DB_DIR, "logs.db"),       autoload: true });

async function seedDefaults() {
  const existing = await institutesDB.findOne({ name: "kgs" });
  if (!existing) {
    await institutesDB.insert({ name: "kgs", label: "KGS", target: "https://mtaiiruskgs.lovable.app", active: true, createdAt: new Date() });
    console.log("[DB] Seeded: kgs → https://mtaiiruskgs.lovable.app");
  }
}

// ── Auth helpers ──────────────────────────────────────────────────
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASS, 10);

function requireAdmin(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || "").replace("Bearer ", "") || req.query?.token || "";
  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    const isApi = req.originalUrl.includes("/admin/api") || (req.headers.accept || "").includes("application/json");
    return isApi
      ? res.status(401).json({ error: "Unauthorized", hint: "Login at /admin/login" })
      : res.redirect("/admin/login");
  }
}

// ── Domain check ──────────────────────────────────────────────────
async function checkDomain(req, res, next) {
  function extractHost(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
  const host = extractHost(req.headers.origin || "") || extractHost(req.headers.referer || "");
  if (!host) return next(); // server-to-server / curl — allow

  const allowed = await domainsDB.findOne({ domain: host, active: true });
  await logsDB.insert({ type: allowed ? "allowed" : "blocked", domain: host, institute: req.params.institute || "", method: req.method, path: req.originalUrl, ip: req.headers["x-forwarded-for"] || req.ip || "", at: new Date() });

  if (!allowed) return res.status(403).json({ error: "Domain not whitelisted", domain: host, message: "Contact admin to whitelist your domain at /admin" });
  next();
}

// ── App ───────────────────────────────────────────────────────────
const app = express();

app.use(function cors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin",      req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods",     "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers",     "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ═════════════════════════════════════════════════════════════════
// PUBLIC
// ═════════════════════════════════════════════════════════════════
app.get("/",       (_req, res) => res.redirect("/admin"));
app.get("/health", (_req, res) => res.json({ status: "ok", version: "2.0.0", ts: new Date() }));

// ═════════════════════════════════════════════════════════════════
// ADMIN UI
// ═════════════════════════════════════════════════════════════════
app.get("/admin/login", (_req, res) => res.send(loginPageHTML()));
app.get("/admin",       requireAdmin, (_req, res) => res.send(adminPanelHTML()));
app.get("/admin/*",     requireAdmin, (_req, res) => res.send(adminPanelHTML()));

// ═════════════════════════════════════════════════════════════════
// ADMIN API — AUTH (public)
// ═════════════════════════════════════════════════════════════════
app.post("/admin/api/login", (req, res) => {
  const { password } = req.body;
  if (!password || !bcrypt.compareSync(password, ADMIN_HASH))
    return res.status(401).json({ error: "Incorrect password" });
  const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
  const isHttps = req.headers["x-forwarded-proto"] === "https";
  res.cookie("token", token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000, sameSite: "lax", secure: isHttps });
  res.json({ ok: true, token });
});

app.post("/admin/api/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════
// ADMIN API — PROTECTED
// ═════════════════════════════════════════════════════════════════

// ── Stats ─────────────────────────────────────────────────────────
app.get("/admin/api/stats", requireAdmin, async (_req, res) => {
  try {
    const [activeDomains, activeInstitutes, allLogs] = await Promise.all([
      domainsDB.count({ active: true }),
      institutesDB.count({ active: true }),
      logsDB.find({}),
    ]);
    const allowed = allLogs.filter(l => l.type === "allowed").length;
    const blocked = allLogs.filter(l => l.type === "blocked").length;
    const domainCounts = {};
    allLogs.forEach(l => { if (l.domain) domainCounts[l.domain] = (domainCounts[l.domain] || 0) + 1; });
    const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([domain, count]) => ({ domain, count }));
    res.json({ activeDomains, activeInstitutes, allowed, blocked, total: allowed + blocked, topDomains });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Domains ───────────────────────────────────────────────────────
app.get("/admin/api/domains", requireAdmin, async (_req, res) => {
  try { res.json(await domainsDB.find({}).sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/api/domains", requireAdmin, async (req, res) => {
  try {
    let { domain, note } = req.body;
    if (!domain) return res.status(400).json({ error: "domain is required" });
    domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ error: "Invalid domain" });
    if (await domainsDB.findOne({ domain })) return res.status(409).json({ error: `"${domain}" already exists` });
    res.status(201).json(await domainsDB.insert({ domain, note: note?.trim() || "", active: true, createdAt: new Date() }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/admin/api/domains/:id", requireAdmin, async (req, res) => {
  try {
    const { active, note } = req.body;
    const update = {};
    if (active !== undefined) update.active = Boolean(active);
    if (note   !== undefined) update.note   = note.trim();
    await domainsDB.update({ _id: req.params.id }, { $set: update });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/api/domains/:id", requireAdmin, async (req, res) => {
  try { await domainsDB.remove({ _id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Institutes ────────────────────────────────────────────────────
app.get("/admin/api/institutes", requireAdmin, async (_req, res) => {
  try { res.json(await institutesDB.find({}).sort({ createdAt: -1 })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/admin/api/institutes", requireAdmin, async (req, res) => {
  try {
    let { name, label, target } = req.body;
    if (!name || !target) return res.status(400).json({ error: "name and target are required" });
    name = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    try { new URL(target); } catch { return res.status(400).json({ error: "target must be a valid URL" }); }
    if (await institutesDB.findOne({ name })) return res.status(409).json({ error: `"${name}" already exists` });
    res.status(201).json(await institutesDB.insert({ name, label: label?.trim() || name, target: target.replace(/\/$/, ""), active: true, createdAt: new Date() }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/admin/api/institutes/:id", requireAdmin, async (req, res) => {
  try {
    const { active, label, target } = req.body;
    const update = {};
    if (active !== undefined) update.active = Boolean(active);
    if (label  !== undefined) update.label  = label.trim();
    if (target !== undefined) update.target = target.replace(/\/$/, "");
    await institutesDB.update({ _id: req.params.id }, { $set: update });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/api/institutes/:id", requireAdmin, async (req, res) => {
  try { await institutesDB.remove({ _id: req.params.id }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Logs ──────────────────────────────────────────────────────────
app.get("/admin/api/logs", requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.type)      filter.type      = req.query.type;
    if (req.query.domain)    filter.domain     = req.query.domain;
    if (req.query.institute) filter.institute  = req.query.institute;
    const docs = await logsDB.find(filter).sort({ at: -1 });
    res.json(docs.slice(0, 200));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/admin/api/logs", requireAdmin, async (_req, res) => {
  try { await logsDB.remove({}, { multi: true }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ═════════════════════════════════════════════════════════════════
// PROXY  /api/:institute/*
// ═════════════════════════════════════════════════════════════════
app.use("/api/:institute", checkDomain, async (req, res, next) => {
  const { institute } = req.params;
  const cfg = await institutesDB.findOne({ name: institute, active: true });
  if (!cfg) return res.status(404).json({ error: `Institute "${institute}" not found or disabled` });

  createProxyMiddleware({
    target:       cfg.target,
    changeOrigin: true,
    pathRewrite:  (p) => p.replace(`/api/${institute}`, "") || "/",
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("X-Institute", institute);
        proxyReq.setHeader("X-Forwarded-For", req.headers["x-forwarded-for"] || req.ip || "");
        console.log(`[PROXY][${institute}] ${req.method} → ${cfg.target}${proxyReq.path}`);
      },
      proxyRes: (proxyRes, req) => {
        proxyRes.headers["access-control-allow-origin"] = req.headers.origin || "*";
      },
      error: (err, _req, res) => {
        res.status(502).json({ error: "Bad Gateway", detail: err.message });
      },
    },
  })(req, res, next);
});

// ═════════════════════════════════════════════════════════════════
// 404
// ═════════════════════════════════════════════════════════════════
app.use((_req, res) => res.status(404).json({ error: "Not found", hint: "Admin: /admin  •  Proxy: /api/{institute}/..." }));

// ═════════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════════
seedDefaults().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀  MTAIIRUS Proxy v2.0 running on port ${PORT}`);
    console.log(`    Admin : http://localhost:${PORT}/admin`);
    console.log(`    Proxy : http://localhost:${PORT}/api/{institute}/...\n`);
  });
});

// ═════════════════════════════════════════════════════════════════
// HTML VIEWS
// ═════════════════════════════════════════════════════════════════
function loginPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Login — MTAIIRUS Proxy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#0f1117,#161b27,#0f1117);font-family:'Segoe UI',sans-serif}
.card{background:#161b27;border:1px solid #2a3347;border-radius:20px;padding:44px 40px;
  width:100%;max-width:400px;box-shadow:0 32px 80px rgba(0,0,0,.6)}
.logo{text-align:center;margin-bottom:32px}
.logo .icon{font-size:40px;margin-bottom:10px}
.logo h1{font-size:22px;font-weight:800;background:linear-gradient(135deg,#3b82f6,#8b5cf6);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo p{color:#64748b;font-size:13px;margin-top:4px}
label{display:block;font-size:11px;font-weight:700;color:#64748b;letter-spacing:.5px;
  text-transform:uppercase;margin-bottom:7px}
input[type=password]{width:100%;padding:13px 14px;background:#1e2535;border:1px solid #2a3347;
  border-radius:10px;color:#e2e8f0;font-size:15px;outline:none;transition:.2s}
input[type=password]:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2)}
.btn{width:100%;margin-top:22px;padding:14px;
  background:linear-gradient(135deg,#3b82f6,#8b5cf6);
  border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;transition:.2s}
.btn:hover{opacity:.9;transform:translateY(-1px)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.error{margin-top:14px;padding:11px 14px;background:#ef444420;border:1px solid #ef444440;
  border-radius:8px;color:#ef4444;font-size:13px;text-align:center;display:none}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="icon">⚡</div>
    <h1>MTAIIRUS Proxy</h1>
    <p>Admin Control Panel</p>
  </div>
  <label>Admin Password</label>
  <input type="password" id="pw" placeholder="Enter password" autofocus
    onkeydown="if(event.key==='Enter')login()">
  <button class="btn" id="btn" onclick="login()">Sign In →</button>
  <div class="error" id="err">❌ Wrong password. Try again.</div>
</div>
<script>
async function login(){
  const pw=document.getElementById('pw').value;
  const btn=document.getElementById('btn');
  if(!pw)return;
  btn.disabled=true;btn.textContent='Signing in…';
  document.getElementById('err').style.display='none';
  try{
    const r=await fetch('/admin/api/login',{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({password:pw})
    });
    if(r.ok){const d=await r.json();try{localStorage.setItem('_at',d.token);}catch(e){}location.href='/admin';}
    else{document.getElementById('err').style.display='block';btn.disabled=false;btn.textContent='Sign In →';}
  }catch{
    document.getElementById('err').textContent='❌ Server error.';
    document.getElementById('err').style.display='block';
    btn.disabled=false;btn.textContent='Sign In →';
  }
}
</script>
</body></html>`;
}

function adminPanelHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — MTAIIRUS Proxy</title>
<style>
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0f1117;--surface:#161b27;--surface2:#1e2535;--border:#2a3347;
  --text:#e2e8f0;--muted:#64748b;
  --blue:#3b82f6;--purple:#8b5cf6;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--cyan:#06b6d4;
}
body{background:var(--bg);color:var(--text);font-family:'Segoe UI',sans-serif;min-height:100vh;display:flex}
.sidebar{width:240px;min-height:100vh;background:var(--surface);border-right:1px solid var(--border);
  display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0}
.logo{padding:24px 20px;border-bottom:1px solid var(--border)}
.logo .brand{font-size:18px;font-weight:800;background:linear-gradient(135deg,var(--blue),var(--purple));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo .sub{font-size:11px;color:var(--muted);margin-top:3px}
.nav{flex:1;padding:12px 0}
.nav-item{display:flex;align-items:center;gap:10px;padding:11px 20px;color:var(--muted);
  font-size:13.5px;font-weight:500;cursor:pointer;border-left:3px solid transparent;transition:.15s}
.nav-item:hover{color:var(--text);background:var(--surface2)}
.nav-item.active{color:var(--blue);border-left-color:var(--blue);background:var(--surface2)}
.sidebar-footer{padding:16px 20px;border-top:1px solid var(--border)}
.logout-btn{width:100%;padding:9px 14px;background:transparent;border:1px solid var(--border);
  border-radius:8px;color:var(--red);font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
.logout-btn:hover{background:#ef444415;border-color:var(--red)}
.main{margin-left:240px;flex:1;padding:28px 32px;min-height:100vh}
.page{display:none}.page.active{display:block}
.page-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
.page-head h1{font-size:22px;font-weight:700}
.page-head p{color:var(--muted);font-size:13px;margin-top:3px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 22px;position:relative;overflow:hidden}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--c1),var(--c2))}
.stat .val{font-size:34px;font-weight:800}
.stat .lbl{font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.6px;margin-top:6px;text-transform:uppercase}
.card{background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:22px}
.card-head{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.card-head h3{font-size:14px;font-weight:700}
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.6px;text-transform:uppercase;border-bottom:1px solid var(--border)}
td{padding:12px 16px;font-size:13px;border-bottom:1px solid var(--border)}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:var(--surface2)}
code{font-size:12px;background:var(--surface2);padding:2px 7px;border-radius:5px;color:var(--cyan);font-family:monospace}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}
.bg{background:#22c55e20;color:var(--green);border:1px solid #22c55e30}
.br{background:#ef444420;color:var(--red);border:1px solid #ef444430}
.bb{background:#3b82f620;color:var(--blue);border:1px solid #3b82f630}
.bm{background:#64748b20;color:var(--muted);border:1px solid #64748b30}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:8px;border:none;
  font-size:13px;font-weight:600;cursor:pointer;transition:.15s;white-space:nowrap}
.btn:hover{opacity:.85;transform:translateY(-1px)}
.bp{background:linear-gradient(135deg,var(--blue),var(--purple));color:#fff}
.bs{padding:5px 11px;font-size:12px}
.bd{background:#ef444415;color:var(--red);border:1px solid #ef444440}
.bw{background:#f59e0b15;color:var(--yellow);border:1px solid #f59e0b40}
.bmu{background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
.bsuc{background:#22c55e15;color:var(--green);border:1px solid #22c55e40}
.modal-bg{position:fixed;inset:0;background:#00000088;display:none;align-items:center;
  justify-content:center;z-index:200;backdrop-filter:blur(4px)}
.modal-bg.open{display:flex}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;
  padding:28px 30px;width:100%;max-width:460px;box-shadow:0 24px 80px #000a;animation:su .2s ease}
@keyframes su{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.modal h3{font-size:17px;font-weight:700;margin-bottom:20px}
.modal-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}
.fg{margin-bottom:16px}
.fg label{display:block;font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;
  text-transform:uppercase;margin-bottom:6px}
.fg input{width:100%;padding:10px 13px;background:var(--surface2);border:1px solid var(--border);
  border-radius:8px;color:var(--text);font-size:14px;outline:none;transition:.2s}
.fg input:focus{border-color:var(--blue);box-shadow:0 0 0 3px #3b82f620}
.fg .hint{font-size:11px;color:var(--muted);margin-top:5px}
.toast-wrap{position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:999}
.toast{padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;
  box-shadow:0 8px 32px #0006;opacity:0;transform:translateX(20px);transition:.3s;min-width:220px}
.toast.show{opacity:1;transform:translateX(0)}
.tok{background:var(--green);color:#fff}.ter{background:var(--red);color:#fff}.twa{background:var(--yellow);color:#fff}
.empty{text-align:center;padding:48px 20px;color:var(--muted);font-size:14px}
.eu{font-size:11.5px;color:var(--green);font-family:monospace;word-break:break-all}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.db{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.db .dn{min-width:130px;font-size:12px;color:var(--muted)}
.db .dbar{flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden}
.db .df{height:100%;background:linear-gradient(90deg,var(--blue),var(--purple));border-radius:3px}
.db .dc{font-size:12px;font-weight:700;min-width:30px;text-align:right}
</style>
</head>
<body>

<aside class="sidebar">
  <div class="logo">
    <div class="brand">⚡ MTAIIRUS</div>
    <div class="sub">Proxy Admin Panel v2.0</div>
  </div>
  <nav class="nav">
    <div class="nav-item active" onclick="nav('dashboard',this)"><span>📊</span> Dashboard</div>
    <div class="nav-item" onclick="nav('domains',this)"><span>🌐</span> Domains</div>
    <div class="nav-item" onclick="nav('institutes',this)"><span>🏫</span> Institutes</div>
    <div class="nav-item" onclick="nav('logs',this)"><span>📋</span> Request Logs</div>
  </nav>
  <div class="sidebar-footer">
    <button class="logout-btn" onclick="logout()">🚪 Logout</button>
  </div>
</aside>

<main class="main">

  <!-- Dashboard -->
  <section class="page active" id="page-dashboard">
    <div class="page-head">
      <div><h1>Dashboard</h1><p>Proxy overview &amp; statistics</p></div>
      <button class="btn bmu bs" onclick="loadStats()">↻ Refresh</button>
    </div>
    <div class="stats">
      <div class="stat" style="--c1:#3b82f6;--c2:#06b6d4"><div class="val" id="s-domains">—</div><div class="lbl">Active Domains</div></div>
      <div class="stat" style="--c1:#8b5cf6;--c2:#ec4899"><div class="val" id="s-inst">—</div><div class="lbl">Institutes</div></div>
      <div class="stat" style="--c1:#22c55e;--c2:#06b6d4"><div class="val" id="s-allowed">—</div><div class="lbl">Allowed Reqs</div></div>
      <div class="stat" style="--c1:#ef4444;--c2:#f59e0b"><div class="val" id="s-blocked">—</div><div class="lbl">Blocked Reqs</div></div>
    </div>
    <div class="g2">
      <div class="card">
        <div class="card-head"><h3>🔥 Top Requesting Domains</h3></div>
        <div style="padding:18px 20px" id="top-domains"><div class="empty">No requests yet</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>📡 KGS Endpoint Reference</h3></div>
        <table><thead><tr><th>Label</th><th>Path</th></tr></thead><tbody>
          <tr><td>All batches</td><td><span class="eu">/api/kgs/data/batches.json</span></td></tr>
          <tr><td>Today's classes</td><td><span class="eu">/api/kgs/api/send.php?action=today&amp;id=1119</span></td></tr>
          <tr><td>Classroom subjects</td><td><span class="eu">/api/kgs/api/send.php?action=classroom&amp;id=1119</span></td></tr>
          <tr><td>Lessons</td><td><span class="eu">/api/kgs/api/send.php?action=lesson&amp;id=1</span></td></tr>
          <tr><td>Video stream</td><td><span class="eu">/api/kgs/api/send.php?action=video&amp;id=1</span></td></tr>
        </tbody></table>
      </div>
    </div>
  </section>

  <!-- Domains -->
  <section class="page" id="page-domains">
    <div class="page-head">
      <div><h1>Allowed Domains</h1><p>Only whitelisted domains can call the proxy API</p></div>
      <button class="btn bp" onclick="openModal('modal-domain')">+ Add Domain</button>
    </div>
    <div class="card">
      <table><thead><tr><th>Domain</th><th>Note</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody id="domains-body"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </section>

  <!-- Institutes -->
  <section class="page" id="page-institutes">
    <div class="page-head">
      <div><h1>Institutes</h1><p>Each institute routes to a different backend URL</p></div>
      <button class="btn bp" onclick="openModal('modal-inst')">+ Add Institute</button>
    </div>
    <div class="card">
      <table><thead><tr><th>URL Name</th><th>Label</th><th>Target URL</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="inst-body"><tr><td colspan="5" class="empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </section>

  <!-- Logs -->
  <section class="page" id="page-logs">
    <div class="page-head">
      <div><h1>Request Logs</h1><p>Last 200 proxy requests</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn bmu bs" onclick="loadLogs()">↻ Refresh</button>
        <button class="btn bd bs" onclick="clearLogs()">🗑 Clear</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn bmu bs" onclick="filterLogs('')">All</button>
      <button class="btn bsuc bs" onclick="filterLogs('allowed')">✅ Allowed</button>
      <button class="btn bd bs"   onclick="filterLogs('blocked')">🚫 Blocked</button>
    </div>
    <div class="card">
      <table><thead><tr><th>Type</th><th>Domain</th><th>Institute</th><th>Method</th><th>Path</th><th>IP</th><th>Time</th></tr></thead>
        <tbody id="logs-body"><tr><td colspan="7" class="empty">Loading…</td></tr></tbody>
      </table>
    </div>
  </section>

</main>

<!-- Add Domain Modal -->
<div class="modal-bg" id="modal-domain">
  <div class="modal">
    <h3>🌐 Add Allowed Domain</h3>
    <div class="fg"><label>Domain</label><input id="d-domain" placeholder="e.g. myapp.com"><div class="hint">Protocol and paths are stripped automatically</div></div>
    <div class="fg"><label>Note (optional)</label><input id="d-note" placeholder="e.g. Production frontend"></div>
    <div class="modal-foot">
      <button class="btn bmu" onclick="closeModal('modal-domain')">Cancel</button>
      <button class="btn bp" onclick="addDomain()">Add Domain</button>
    </div>
  </div>
</div>

<!-- Add Institute Modal -->
<div class="modal-bg" id="modal-inst">
  <div class="modal">
    <h3>🏫 Add Institute</h3>
    <div class="fg"><label>URL Name</label><input id="i-name" placeholder="e.g. harvard"><div class="hint">Used in /api/harvard/... — lowercase letters, numbers, hyphens only</div></div>
    <div class="fg"><label>Display Label</label><input id="i-label" placeholder="e.g. Harvard University"></div>
    <div class="fg"><label>Target Backend URL</label><input id="i-target" placeholder="e.g. https://api.harvard.edu"></div>
    <div class="modal-foot">
      <button class="btn bmu" onclick="closeModal('modal-inst')">Cancel</button>
      <button class="btn bp" onclick="addInstitute()">Add Institute</button>
    </div>
  </div>
</div>

<div class="toast-wrap" id="toasts"></div>

<script>
let allLogs=[], logFilter='';

function nav(page,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+page).classList.add('active');
  el.classList.add('active');
  if(page==='dashboard')loadStats();
  if(page==='domains')loadDomains();
  if(page==='institutes')loadInstitutes();
  if(page==='logs')loadLogs();
}

function toast(msg,type='ok'){
  const wrap=document.getElementById('toasts');
  const el=document.createElement('div');
  el.className='toast t'+type[0];el.textContent=msg;
  wrap.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),400)},2600);
}

async function api(method,url,body){
  const token=localStorage.getItem('_at')||'';
  const r=await fetch(url,{method,credentials:'include',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':token?'Bearer '+token:''},body:body?JSON.stringify(body):undefined});
  if(r.status===401){localStorage.removeItem('_at');location.href='/admin/login';return;}
  const text=await r.text();
  let d;try{d=JSON.parse(text);}catch{throw new Error('Server error: '+text.slice(0,120));}
  if(!r.ok)throw new Error(d.error||'Request failed');
  return d;
}

function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-bg').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));

async function loadStats(){
  try{
    const s=await api('GET','/admin/api/stats');
    document.getElementById('s-domains').textContent=s.activeDomains;
    document.getElementById('s-inst').textContent=s.activeInstitutes;
    document.getElementById('s-allowed').textContent=s.allowed;
    document.getElementById('s-blocked').textContent=s.blocked;
    const wrap=document.getElementById('top-domains');
    if(!s.topDomains?.length){wrap.innerHTML='<div class="empty">No requests logged yet</div>';return;}
    const max=s.topDomains[0].count;
    wrap.innerHTML=s.topDomains.map(d=>\`<div class="db"><div class="dn">\${d.domain}</div><div class="dbar"><div class="df" style="width:\${Math.round(d.count/max*100)}%"></div></div><div class="dc">\${d.count}</div></div>\`).join('');
  }catch(e){toast(e.message,'er');}
}

async function loadDomains(){
  try{
    const list=await api('GET','/admin/api/domains');
    const tb=document.getElementById('domains-body');
    if(!list.length){tb.innerHTML='<tr><td colspan="5" class="empty">No domains yet — add one above</td></tr>';return;}
    tb.innerHTML=list.map(d=>\`<tr>
      <td><b>\${d.domain}</b></td>
      <td style="color:var(--muted)">\${d.note||'—'}</td>
      <td>\${d.active?'<span class="badge bg">Active</span>':'<span class="badge br">Disabled</span>'}</td>
      <td style="color:var(--muted);font-size:12px">\${new Date(d.createdAt).toLocaleDateString()}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn bs \${d.active?'bw':'bsuc'}" onclick="toggleDomain('\${d._id}',\${!d.active})">\${d.active?'Disable':'Enable'}</button>
        <button class="btn bs bd" onclick="deleteDomain('\${d._id}','\${d.domain}')">Delete</button>
      </div></td>
    </tr>\`).join('');
  }catch(e){toast(e.message,'er');}
}

async function addDomain(){
  const domain=document.getElementById('d-domain').value.trim();
  const note=document.getElementById('d-note').value.trim();
  if(!domain){toast('Enter a domain','er');return;}
  try{await api('POST','/admin/api/domains',{domain,note});closeModal('modal-domain');document.getElementById('d-domain').value='';document.getElementById('d-note').value='';toast('✅ Domain added');loadDomains();loadStats();}
  catch(e){toast(e.message,'er');}
}
async function toggleDomain(id,active){
  try{await api('PATCH',\`/admin/api/domains/\${id}\`,{active});toast(active?'✅ Enabled':'⚠️ Disabled',active?'ok':'wa');loadDomains();loadStats();}
  catch(e){toast(e.message,'er');}
}
async function deleteDomain(id,name){
  if(!confirm(\`Delete "\${name}"?\`))return;
  try{await api('DELETE',\`/admin/api/domains/\${id}\`);toast('🗑 Removed');loadDomains();loadStats();}
  catch(e){toast(e.message,'er');}
}

async function loadInstitutes(){
  try{
    const list=await api('GET','/admin/api/institutes');
    const tb=document.getElementById('inst-body');
    if(!list.length){tb.innerHTML='<tr><td colspan="5" class="empty">No institutes yet</td></tr>';return;}
    tb.innerHTML=list.map(i=>\`<tr>
      <td><code>/api/\${i.name}</code></td>
      <td>\${i.label}</td>
      <td style="color:var(--muted);font-size:12px">\${i.target}</td>
      <td>\${i.active?'<span class="badge bg">Active</span>':'<span class="badge br">Disabled</span>'}</td>
      <td><div style="display:flex;gap:6px">
        <button class="btn bs \${i.active?'bw':'bsuc'}" onclick="toggleInst('\${i._id}',\${!i.active})">\${i.active?'Disable':'Enable'}</button>
        <button class="btn bs bd" onclick="deleteInst('\${i._id}','\${i.name}')">Delete</button>
      </div></td>
    </tr>\`).join('');
  }catch(e){toast(e.message,'er');}
}
async function addInstitute(){
  const name=document.getElementById('i-name').value.trim();
  const label=document.getElementById('i-label').value.trim();
  const target=document.getElementById('i-target').value.trim();
  if(!name||!target){toast('Name and target required','er');return;}
  try{await api('POST','/admin/api/institutes',{name,label,target});closeModal('modal-inst');['i-name','i-label','i-target'].forEach(id=>document.getElementById(id).value='');toast('✅ Institute added');loadInstitutes();}
  catch(e){toast(e.message,'er');}
}
async function toggleInst(id,active){
  try{await api('PATCH',\`/admin/api/institutes/\${id}\`,{active});toast(active?'✅ Enabled':'⚠️ Disabled',active?'ok':'wa');loadInstitutes();}
  catch(e){toast(e.message,'er');}
}
async function deleteInst(id,name){
  if(!confirm(\`Delete institute "\${name}"?\`))return;
  try{await api('DELETE',\`/admin/api/institutes/\${id}\`);toast('🗑 Removed');loadInstitutes();}
  catch(e){toast(e.message,'er');}
}

async function loadLogs(){
  try{allLogs=await api('GET','/admin/api/logs');renderLogs();}
  catch(e){toast(e.message,'er');}
}
function filterLogs(type){logFilter=type;renderLogs();}
function renderLogs(){
  const filtered=logFilter?allLogs.filter(l=>l.type===logFilter):allLogs;
  const tb=document.getElementById('logs-body');
  if(!filtered.length){tb.innerHTML='<tr><td colspan="7" class="empty">No logs yet</td></tr>';return;}
  tb.innerHTML=filtered.map(l=>\`<tr>
    <td>\${l.type==='allowed'?'<span class="badge bg">allowed</span>':'<span class="badge br">blocked</span>'}</td>
    <td><b>\${l.domain||'—'}</b></td>
    <td><code>\${l.institute||'—'}</code></td>
    <td><span class="badge bm">\${l.method||'GET'}</span></td>
    <td style="font-size:11.5px;color:var(--muted)">\${(l.path||'—').slice(0,50)}</td>
    <td style="font-size:11.5px;color:var(--muted)">\${l.ip||'—'}</td>
    <td style="font-size:11.5px;color:var(--muted)">\${new Date(l.at).toLocaleTimeString()}</td>
  </tr>\`).join('');
}
async function clearLogs(){
  if(!confirm('Clear all logs?'))return;
  try{await api('DELETE','/admin/api/logs');allLogs=[];renderLogs();loadStats();toast('🗑 Logs cleared');}
  catch(e){toast(e.message,'er');}
}

async function logout(){
  await fetch('/admin/api/logout',{method:'POST',credentials:'include'});
  location.href='/admin/login';
}

loadStats();
</script>
</body></html>`;
}
