
/**
 * server.js — MTAIIRUS Multi-Institute Proxy + Admin Panel
 *
 * ENV vars (set in Render dashboard):
 *   ADMIN_PASSWORD   — admin login password  (default: admin123  ← CHANGE THIS)
 *   JWT_SECRET       — secret for auth tokens (default: change-me-please)
 *   PORT             — port (default: 3000)
 */

const express      = require("express");
const cookieParser = require("cookie-parser");
const bcrypt       = require("bcryptjs");
const jwt          = require("jsonwebtoken");
const { createProxyMiddleware } = require("http-proxy-middleware");
const Datastore    = require("nedb-promises");
const path         = require("path");
const fs           = require("fs");

// ── Config ────────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT          || 3000;
const JWT_SECRET    = process.env.JWT_SECRET    || "change-me-please";
const ADMIN_PASS    = process.env.ADMIN_PASSWORD || "admin123";
const DB_DIR        = path.join(__dirname, "data");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── Database (flat JSON files via NeDB) ───────────────────────────────────────
const domainsDB   = Datastore.create({ filename: path.join(DB_DIR, "domains.db"),   autoload: true });
const institutesDB= Datastore.create({ filename: path.join(DB_DIR, "institutes.db"),autoload: true });
const logsDB      = Datastore.create({ filename: path.join(DB_DIR, "logs.db"),      autoload: true });

// Seed default institute on first run
async function seed() {
  const existing = await institutesDB.findOne({ name: "kgs" });
  if (!existing) {
    await institutesDB.insert({
      name:   "kgs",
      label:  "KGS",
      target: "https://mtaiiruskgs.lovable.app",
      active: true,
      createdAt: new Date(),
    });
    console.log("[DB] Seeded default institute: kgs");
  }
}
seed();

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Auth helpers ──────────────────────────────────────────────────────────────
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASS, 10);

function signToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "8h" });
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    if (req.headers.accept?.includes("application/json")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.redirect("/admin/login");
  }
}

// ── Domain check middleware (for proxy routes) ────────────────────────────────
async function checkDomain(req, res, next) {
  const origin  = req.headers.origin  || "";
  const referer = req.headers.referer || "";

  // Extract hostname from origin or referer
  function extractHost(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }

  const host = extractHost(origin) || extractHost(referer);

  // Allow requests with no origin (e.g. direct curl / server-to-server)
  if (!host) return next();

  const allowed = await domainsDB.findOne({ domain: host, active: true });
  if (!allowed) {
    await logsDB.insert({
      type:      "blocked",
      domain:    host || "unknown",
      institute: req.params.institute,
      path:      req.path,
      ip:        req.ip,
      at:        new Date(),
    });
    return res.status(403).json({
      error:   "Domain not allowed",
      domain:  host,
      message: "Contact admin to whitelist your domain.",
    });
  }

  // Log allowed request
  await logsDB.insert({
    type:      "allowed",
    domain:    host,
    institute: req.params.institute,
    path:      req.path,
    ip:        req.ip,
    at:        new Date(),
  });

  next();
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN API ROUTES
// ═══════════════════════════════════════════════════════════════════

// Login
app.post("/admin/api/login", async (req, res) => {
  const { password } = req.body;
  if (!bcrypt.compareSync(password, ADMIN_HASH)) {
    return res.status(401).json({ error: "Wrong password" });
  }
  const token = signToken();
  res.cookie("token", token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 });
  res.json({ ok: true, token });
});

app.post("/admin/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

// ── Domains ───────────────────────────────────────────────────────
app.get   ("/admin/api/domains",     requireAdmin, async (req, res) => {
  const docs = await domainsDB.find({}).sort({ createdAt: -1 });
  res.json(docs);
});

app.post  ("/admin/api/domains",     requireAdmin, async (req, res) => {
  const { domain, note } = req.body;
  if (!domain) return res.status(400).json({ error: "domain required" });
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim().toLowerCase();
  const exists = await domainsDB.findOne({ domain: clean });
  if (exists) return res.status(409).json({ error: "Domain already exists" });
  const doc = await domainsDB.insert({ domain: clean, note: note || "", active: true, createdAt: new Date() });
  res.json(doc);
});

app.patch ("/admin/api/domains/:id", requireAdmin, async (req, res) => {
  const { active, note } = req.body;
  const update = {};
  if (active !== undefined) update.active = active;
  if (note   !== undefined) update.note   = note;
  await domainsDB.update({ _id: req.params.id }, { $set: update });
  res.json({ ok: true });
});

app.delete("/admin/api/domains/:id", requireAdmin, async (req, res) => {
  await domainsDB.remove({ _id: req.params.id });
  res.json({ ok: true });
});

// ── Institutes ────────────────────────────────────────────────────
app.get   ("/admin/api/institutes",     requireAdmin, async (req, res) => {
  res.json(await institutesDB.find({}).sort({ createdAt: -1 }));
});

app.post  ("/admin/api/institutes",     requireAdmin, async (req, res) => {
  const { name, label, target } = req.body;
  if (!name || !target) return res.status(400).json({ error: "name + target required" });
  const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const exists = await institutesDB.findOne({ name: clean });
  if (exists) return res.status(409).json({ error: "Institute name already exists" });
  const doc = await institutesDB.insert({ name: clean, label: label || clean, target, active: true, createdAt: new Date() });
  res.json(doc);
});

app.patch ("/admin/api/institutes/:id", requireAdmin, async (req, res) => {
  const { active, label, target } = req.body;
  const update = {};
  if (active !== undefined) update.active = active;
  if (label  !== undefined) update.label  = label;
  if (target !== undefined) update.target = target;
  await institutesDB.update({ _id: req.params.id }, { $set: update });
  res.json({ ok: true });
});

app.delete("/admin/api/institutes/:id", requireAdmin, async (req, res) => {
  await institutesDB.remove({ _id: req.params.id });
  res.json({ ok: true });
});

// ── Logs ──────────────────────────────────────────────────────────
app.get("/admin/api/logs", requireAdmin, async (req, res) => {
  const docs = await logsDB.find({}).sort({ at: -1 });
  // cap at 200
  res.json(docs.slice(0, 200));
});

app.delete("/admin/api/logs", requireAdmin, async (req, res) => {
  await logsDB.remove({}, { multi: true });
  res.json({ ok: true });
});

// ── Stats ─────────────────────────────────────────────────────────
app.get("/admin/api/stats", requireAdmin, async (req, res) => {
  const [domains, institutes, logs] = await Promise.all([
    domainsDB.count({ active: true }),
    institutesDB.count({ active: true }),
    logsDB.find({}),
  ]);
  const allowed = logs.filter(l => l.type === "allowed").length;
  const blocked = logs.filter(l => l.type === "blocked").length;
  res.json({ activeDomains: domains, activeInstitutes: institutes, allowed, blocked });
});

// ── Admin UI (served as HTML) ─────────────────────────────────────
app.get("/admin/login", (req, res) => {
  res.send(adminLoginHTML());
});

app.get("/admin", requireAdmin, (req, res) => {
  res.send(adminPanelHTML());
});

app.get("/admin/*", requireAdmin, (req, res) => {
  res.send(adminPanelHTML());
});

// ═══════════════════════════════════════════════════════════════════
//  PROXY ROUTES  /api/:institute/*
// ═══════════════════════════════════════════════════════════════════

app.get("/health", (req, res) =>
  res.json({ status: "ok", version: "2.0.0" })
);

app.use("/api/:institute", checkDomain, async (req, res, next) => {
  const { institute } = req.params;
  const cfg = await institutesDB.findOne({ name: institute, active: true });

  if (!cfg) {
    return res.status(404).json({
      error: `Institute "${institute}" not found or disabled.`,
    });
  }

  createProxyMiddleware({
    target: cfg.target,
    changeOrigin: true,
    pathRewrite: (path) => path.replace(`/api/${institute}`, "") || "/",
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("X-Institute", institute);
        const ip = req.headers["x-forwarded-for"] || req.ip;
        proxyReq.setHeader("X-Forwarded-For", ip);
        console.log(`[PROXY][${institute}] ${req.method} → ${cfg.target}${proxyReq.path}`);
      },
      error: (err, _req, res) => {
        res.status(502).json({ error: "Bad Gateway", detail: err.message });
      },
    },
  })(req, res, next);
});

app.listen(PORT, () => {
  console.log(`\n🚀  MTAIIRUS Proxy v2 running on port ${PORT}`);
  console.log(`    Admin panel: http://localhost:${PORT}/admin`);
  console.log(`    Proxy:       http://localhost:${PORT}/api/{institute}/...\n`);
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN UI HTML
// ═══════════════════════════════════════════════════════════════════

function adminLoginHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Login — MTAIIRUS Proxy</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);font-family:'Segoe UI',sans-serif}
  .card{background:#1e1e2e;border:1px solid #313244;border-radius:16px;padding:40px 36px;width:100%;max-width:400px;box-shadow:0 24px 64px #0008}
  h1{color:#cdd6f4;font-size:22px;margin-bottom:6px;text-align:center}
  p{color:#6c7086;font-size:13px;text-align:center;margin-bottom:30px}
  label{display:block;color:#a6adc8;font-size:12px;font-weight:600;margin-bottom:6px;letter-spacing:.5px}
  input{width:100%;padding:12px 14px;background:#313244;border:1px solid #45475a;border-radius:8px;
        color:#cdd6f4;font-size:15px;outline:none;transition:.2s}
  input:focus{border-color:#89b4fa;box-shadow:0 0 0 3px #89b4fa22}
  button{width:100%;margin-top:20px;padding:13px;background:linear-gradient(135deg,#89b4fa,#cba6f7);
         border:none;border-radius:8px;color:#1e1e2e;font-weight:700;font-size:15px;cursor:pointer;transition:.2s}
  button:hover{opacity:.9;transform:translateY(-1px)}
  .err{color:#f38ba8;font-size:13px;text-align:center;margin-top:12px;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>🔐 Admin Login</h1>
  <p>MTAIIRUS Proxy Control Panel</p>
  <label>PASSWORD</label>
  <input type="password" id="pw" placeholder="Enter admin password" onkeydown="if(event.key==='Enter')login()">
  <button onclick="login()">Sign In</button>
  <div class="err" id="err">Wrong password. Try again.</div>
</div>
<script>
async function login(){
  const pw=document.getElementById('pw').value;
  const r=await fetch('/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
  if(r.ok){location.href='/admin';}
  else{const e=document.getElementById('err');e.style.display='block';}
}
</script>
</body></html>`;
}

function adminPanelHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Panel — MTAIIRUS Proxy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e2e;color:#cdd6f4;font-family:'Segoe UI',sans-serif;min-height:100vh}

/* Layout */
.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:#181825;border-right:1px solid #313244;padding:24px 0;display:flex;flex-direction:column}
.logo{padding:0 20px 24px;border-bottom:1px solid #313244;margin-bottom:16px}
.logo h2{font-size:16px;color:#89b4fa;font-weight:700}
.logo p{font-size:11px;color:#6c7086;margin-top:2px}
.nav a{display:flex;align-items:center;gap:10px;padding:11px 20px;color:#a6adc8;text-decoration:none;font-size:14px;font-weight:500;transition:.15s;border-left:3px solid transparent}
.nav a:hover{color:#cdd6f4;background:#313244}
.nav a.active{color:#89b4fa;border-left-color:#89b4fa;background:#1e1e2e}
.main{margin-left:220px;padding:30px}

/* Header */
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.page-header h1{font-size:22px;font-weight:700}
.page-header p{color:#6c7086;font-size:13px;margin-top:2px}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px}
.stat{background:#181825;border:1px solid #313244;border-radius:12px;padding:20px}
.stat .val{font-size:32px;font-weight:700;color:#89b4fa}
.stat .lbl{font-size:12px;color:#6c7086;margin-top:4px;font-weight:600;letter-spacing:.5px}

/* Card */
.card{background:#181825;border:1px solid #313244;border-radius:12px;margin-bottom:24px}
.card-head{padding:18px 20px;border-bottom:1px solid #313244;display:flex;justify-content:space-between;align-items:center}
.card-head h3{font-size:15px;font-weight:600}

/* Table */
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:11px;font-weight:700;color:#6c7086;letter-spacing:.6px;border-bottom:1px solid #313244;text-transform:uppercase}
td{padding:12px 16px;font-size:13px;border-bottom:1px solid #1e1e2e}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1e1e2e55}

/* Badge */
.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700}
.badge.on{background:#a6e3a155;color:#a6e3a1}
.badge.off{background:#f38ba855;color:#f38ba8}
.badge.allowed{background:#89b4fa33;color:#89b4fa}
.badge.blocked{background:#f38ba833;color:#f38ba8}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
.btn:hover{opacity:.85;transform:translateY(-1px)}
.btn-primary{background:linear-gradient(135deg,#89b4fa,#cba6f7);color:#1e1e2e}
.btn-sm{padding:5px 10px;font-size:12px}
.btn-danger{background:#f38ba822;color:#f38ba8;border:1px solid #f38ba844}
.btn-warn{background:#fab38722;color:#fab387;border:1px solid #fab38744}
.btn-muted{background:#31324488;color:#a6adc8;border:1px solid #45475a55}

/* Modal */
.modal-bg{position:fixed;inset:0;background:#0008;display:none;align-items:center;justify-content:center;z-index:100}
.modal-bg.show{display:flex}
.modal{background:#1e1e2e;border:1px solid #313244;border-radius:16px;padding:28px;width:100%;max-width:440px;box-shadow:0 24px 64px #000a}
.modal h3{font-size:17px;margin-bottom:20px}
label{display:block;color:#a6adc8;font-size:11px;font-weight:700;letter-spacing:.5px;margin-bottom:6px;margin-top:14px}
input,textarea{width:100%;padding:10px 13px;background:#313244;border:1px solid #45475a;border-radius:8px;color:#cdd6f4;font-size:14px;outline:none}
input:focus,textarea:focus{border-color:#89b4fa}
.modal-foot{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}

/* Toast */
.toast{position:fixed;bottom:24px;right:24px;background:#a6e3a1;color:#1e1e2e;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px;opacity:0;transform:translateY(10px);transition:.3s;z-index:999}
.toast.err{background:#f38ba8}
.toast.show{opacity:1;transform:translateY(0)}

/* Tabs */
.tabs{display:flex;gap:4px;padding:16px 20px 0}
.tab{padding:8px 16px;border-radius:8px 8px 0 0;font-size:13px;font-weight:600;cursor:pointer;color:#6c7086;background:transparent;border:none;transition:.15s}
.tab.active{color:#89b4fa;background:#1e1e2e}
.tab-content{display:none}
.tab-content.active{display:block}

/* Empty */
.empty{text-align:center;padding:40px;color:#6c7086;font-size:14px}

/* Logout */
.logout-btn{margin-top:auto;padding:11px 20px;color:#f38ba8;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;border:none;background:none;width:100%}
.logout-btn:hover{background:#313244}
</style>
</head>
<body>

<!-- Sidebar -->
<div class="sidebar">
  <div class="logo">
    <h2>⚡ MTAIIRUS</h2>
    <p>Proxy Admin Panel</p>
  </div>
  <nav class="nav">
    <a href="#" class="active" onclick="showPage('dashboard',this)">📊 Dashboard</a>
    <a href="#" onclick="showPage('domains',this)">🌐 Domains</a>
    <a href="#" onclick="showPage('institutes',this)">🏫 Institutes</a>
    <a href="#" onclick="showPage('logs',this)">📋 Logs</a>
  </nav>
  <button class="logout-btn" onclick="logout()">🚪 Logout</button>
</div>

<!-- Main -->
<div class="main">

  <!-- Dashboard -->
  <div id="page-dashboard">
    <div class="page-header">
      <div><h1>Dashboard</h1><p>Proxy overview and stats</p></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="val" id="s-domains">—</div><div class="lbl">ACTIVE DOMAINS</div></div>
      <div class="stat"><div class="val" id="s-institutes">—</div><div class="lbl">INSTITUTES</div></div>
      <div class="stat"><div class="val" id="s-allowed">—</div><div class="lbl">ALLOWED REQUESTS</div></div>
      <div class="stat"><div class="val" id="s-blocked">—</div><div class="lbl">BLOCKED REQUESTS</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>📡 KGS Endpoints (Quick Reference)</h3></div>
      <table>
        <thead><tr><th>Label</th><th>Example URL</th></tr></thead>
        <tbody>
          <tr><td>All batches</td><td><code style="color:#a6e3a1;font-size:12px">/api/kgs/data/batches.json</code></td></tr>
          <tr><td>Today's classes</td><td><code style="color:#a6e3a1;font-size:12px">/api/kgs/api/send.php?action=today&id=1119</code></td></tr>
          <tr><td>Classroom subjects</td><td><code style="color:#a6e3a1;font-size:12px">/api/kgs/api/send.php?action=classroom&id=1119</code></td></tr>
          <tr><td>Lessons</td><td><code style="color:#a6e3a1;font-size:12px">/api/kgs/api/send.php?action=lesson&id=1</code></td></tr>
          <tr><td>Video stream</td><td><code style="color:#a6e3a1;font-size:12px">/api/kgs/api/send.php?action=video&id=1</code></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Domains -->
  <div id="page-domains" style="display:none">
    <div class="page-header">
      <div><h1>Allowed Domains</h1><p>Only whitelisted domains can call the proxy</p></div>
      <button class="btn btn-primary" onclick="openAddDomain()">+ Add Domain</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Domain</th><th>Note</th><th>Status</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody id="domains-tbody"><tr><td colspan="5" class="empty">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Institutes -->
  <div id="page-institutes" style="display:none">
    <div class="page-header">
      <div><h1>Institutes</h1><p>Manage proxy routing targets</p></div>
      <button class="btn btn-primary" onclick="openAddInstitute()">+ Add Institute</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Name</th><th>Label</th><th>Target URL</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="institutes-tbody"><tr><td colspan="5" class="empty">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

  <!-- Logs -->
  <div id="page-logs" style="display:none">
    <div class="page-header">
      <div><h1>Request Logs</h1><p>Last 200 proxy requests</p></div>
      <button class="btn btn-danger btn-sm" onclick="clearLogs()">🗑 Clear Logs</button>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Type</th><th>Domain</th><th>Institute</th><th>Path</th><th>IP</th><th>Time</th></tr></thead>
        <tbody id="logs-tbody"><tr><td colspan="6" class="empty">Loading...</td></tr></tbody>
      </table>
    </div>
  </div>

</div>

<!-- Add Domain Modal -->
<div class="modal-bg" id="modal-domain">
  <div class="modal">
    <h3>🌐 Add Allowed Domain</h3>
    <label>DOMAIN</label>
    <input id="d-domain" placeholder="e.g. myapp.com or localhost">
    <label>NOTE (optional)</label>
    <input id="d-note" placeholder="e.g. Production frontend">
    <div class="modal-foot">
      <button class="btn btn-muted" onclick="closeModal('modal-domain')">Cancel</button>
      <button class="btn btn-primary" onclick="addDomain()">Add Domain</button>
    </div>
  </div>
</div>

<!-- Add Institute Modal -->
<div class="modal-bg" id="modal-institute">
  <div class="modal">
    <h3>🏫 Add Institute</h3>
    <label>NAME (used in URL)</label>
    <input id="i-name" placeholder="e.g. harvard">
    <label>LABEL</label>
    <input id="i-label" placeholder="e.g. Harvard University">
    <label>TARGET URL</label>
    <input id="i-target" placeholder="e.g. https://api.harvard.edu">
    <div class="modal-foot">
      <button class="btn btn-muted" onclick="closeModal('modal-institute')">Cancel</button>
      <button class="btn btn-primary" onclick="addInstitute()">Add Institute</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
// ── State ──────────────────────────────────────────────────────────
let currentPage = 'dashboard';

// ── Navigation ─────────────────────────────────────────────────────
function showPage(name, el) {
  document.querySelectorAll('[id^=page-]').forEach(p => p.style.display='none');
  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-'+name).style.display='block';
  if(el) el.classList.add('active');
  currentPage = name;
  if(name==='dashboard')   loadStats();
  if(name==='domains')     loadDomains();
  if(name==='institutes')  loadInstitutes();
  if(name==='logs')        loadLogs();
}

// ── Toast ──────────────────────────────────────────────────────────
function toast(msg, err=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err?' err':'');
  setTimeout(()=> t.className='toast', 2800);
}

// ── API helper ─────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const d = await r.json();
  if(!r.ok) throw new Error(d.error || 'Error');
  return d;
}

// ── Stats ──────────────────────────────────────────────────────────
async function loadStats() {
  const s = await api('GET','/admin/api/stats');
  document.getElementById('s-domains').textContent     = s.activeDomains;
  document.getElementById('s-institutes').textContent  = s.activeInstitutes;
  document.getElementById('s-allowed').textContent     = s.allowed;
  document.getElementById('s-blocked').textContent     = s.blocked;
}

// ── Domains ────────────────────────────────────────────────────────
async function loadDomains() {
  const list = await api('GET','/admin/api/domains');
  const tb = document.getElementById('domains-tbody');
  if(!list.length){ tb.innerHTML='<tr><td colspan="5" class="empty">No domains yet. Add one above.</td></tr>'; return; }
  tb.innerHTML = list.map(d => \`
    <tr>
      <td><b>\${d.domain}</b></td>
      <td style="color:#6c7086">\${d.note||'—'}</td>
      <td><span class="badge \${d.active?'on':'off'}">\${d.active?'Active':'Disabled'}</span></td>
      <td style="color:#6c7086;font-size:12px">\${new Date(d.createdAt).toLocaleDateString()}</td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="toggleDomain('\${d._id}',\${!d.active})">\${d.active?'Disable':'Enable'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDomain('\${d._id}')">Delete</button>
      </td>
    </tr>\`).join('');
}

function openAddDomain(){ document.getElementById('d-domain').value=''; document.getElementById('d-note').value=''; document.getElementById('modal-domain').classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }

async function addDomain(){
  const domain = document.getElementById('d-domain').value.trim();
  const note   = document.getElementById('d-note').value.trim();
  if(!domain){ toast('Enter a domain',true); return; }
  try{
    await api('POST','/admin/api/domains',{domain,note});
    closeModal('modal-domain');
    toast('✅ Domain added');
    loadDomains();
  }catch(e){ toast(e.message,true); }
}

async function toggleDomain(id, active){
  await api('PATCH',\`/admin/api/domains/\${id}\`,{active});
  toast(active?'✅ Domain enabled':'⚠️ Domain disabled');
  loadDomains();
}

async function deleteDomain(id){
  if(!confirm('Delete this domain?')) return;
  await api('DELETE',\`/admin/api/domains/\${id}\`);
  toast('🗑 Domain removed');
  loadDomains();
}

// ── Institutes ─────────────────────────────────────────────────────
async function loadInstitutes(){
  const list = await api('GET','/admin/api/institutes');
  const tb = document.getElementById('institutes-tbody');
  if(!list.length){ tb.innerHTML='<tr><td colspan="5" class="empty">No institutes yet.</td></tr>'; return; }
  tb.innerHTML = list.map(i => \`
    <tr>
      <td><code style="color:#cba6f7">/api/\${i.name}</code></td>
      <td>\${i.label}</td>
      <td style="color:#6c7086;font-size:12px">\${i.target}</td>
      <td><span class="badge \${i.active?'on':'off'}">\${i.active?'Active':'Disabled'}</span></td>
      <td>
        <button class="btn btn-warn btn-sm" onclick="toggleInstitute('\${i._id}',\${!i.active})">\${i.active?'Disable':'Enable'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteInstitute('\${i._id}')">Delete</button>
      </td>
    </tr>\`).join('');
}

function openAddInstitute(){ ['i-name','i-label','i-target'].forEach(id=>document.getElementById(id).value=''); document.getElementById('modal-institute').classList.add('show'); }

async function addInstitute(){
  const name   = document.getElementById('i-name').value.trim();
  const label  = document.getElementById('i-label').value.trim();
  const target = document.getElementById('i-target').value.trim();
  if(!name||!target){ toast('Name and target required',true); return; }
  try{
    await api('POST','/admin/api/institutes',{name,label,target});
    closeModal('modal-institute');
    toast('✅ Institute added');
    loadInstitutes();
  }catch(e){ toast(e.message,true); }
}

async function toggleInstitute(id, active){
  await api('PATCH',\`/admin/api/institutes/\${id}\`,{active});
  toast(active?'✅ Enabled':'⚠️ Disabled');
  loadInstitutes();
}

async function deleteInstitute(id){
  if(!confirm('Delete this institute?')) return;
  await api('DELETE',\`/admin/api/institutes/\${id}\`);
  toast('🗑 Institute removed');
  loadInstitutes();
}

// ── Logs ───────────────────────────────────────────────────────────
async function loadLogs(){
  const list = await api('GET','/admin/api/logs');
  const tb = document.getElementById('logs-tbody');
  if(!list.length){ tb.innerHTML='<tr><td colspan="6" class="empty">No logs yet.</td></tr>'; return; }
  tb.innerHTML = list.map(l => \`
    <tr>
      <td><span class="badge \${l.type}">\${l.type}</span></td>
      <td>\${l.domain||'—'}</td>
      <td><code style="font-size:12px">\${l.institute||'—'}</code></td>
      <td style="font-size:12px;color:#6c7086">\${l.path||'—'}</td>
      <td style="font-size:12px;color:#6c7086">\${l.ip||'—'}</td>
      <td style="font-size:12px;color:#6c7086">\${new Date(l.at).toLocaleTimeString()}</td>
    </tr>\`).join('');
}

async function clearLogs(){
  if(!confirm('Clear all logs?')) return;
  await api('DELETE','/admin/api/logs');
  toast('🗑 Logs cleared');
  loadLogs();
}

// ── Logout ─────────────────────────────────────────────────────────
async function logout(){
  await api('POST','/admin/api/logout');
  location.href = '/admin/login';
}

// ── Init ───────────────────────────────────────────────────────────
loadStats();
</script>
</body></html>`;
}
