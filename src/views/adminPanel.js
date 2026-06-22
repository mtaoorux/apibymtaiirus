
function adminPanel() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin — MTAIIRUS Proxy</title>
<style>
/* ── Reset & Base ───────────────────────────────── */
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box }
:root {
  --bg:       #0f1117;
  --surface:  #161b27;
  --surface2: #1e2535;
  --border:   #2a3347;
  --text:     #e2e8f0;
  --muted:    #64748b;
  --blue:     #3b82f6;
  --purple:   #8b5cf6;
  --green:    #22c55e;
  --red:      #ef4444;
  --yellow:   #f59e0b;
  --cyan:     #06b6d4;
}
body { background:var(--bg); color:var(--text); font-family:'Segoe UI',system-ui,sans-serif; min-height:100vh; display:flex }

/* ── Sidebar ────────────────────────────────────── */
.sidebar {
  width:240px; min-height:100vh; background:var(--surface); border-right:1px solid var(--border);
  display:flex; flex-direction:column; position:fixed; left:0; top:0; bottom:0; z-index:50;
}
.sidebar-logo { padding:24px 20px; border-bottom:1px solid var(--border) }
.sidebar-logo .brand { font-size:18px; font-weight:800; background:linear-gradient(135deg,var(--blue),var(--purple)); -webkit-background-clip:text; -webkit-text-fill-color:transparent }
.sidebar-logo .sub { font-size:11px; color:var(--muted); margin-top:3px }
.nav { flex:1; padding:12px 0 }
.nav-item {
  display:flex; align-items:center; gap:10px; padding:11px 20px;
  color:var(--muted); font-size:13.5px; font-weight:500; cursor:pointer;
  border-left:3px solid transparent; transition:.15s; user-select:none;
}
.nav-item:hover { color:var(--text); background:var(--surface2) }
.nav-item.active { color:var(--blue); border-left-color:var(--blue); background:var(--surface2) }
.nav-item .icon { font-size:16px; width:20px; text-align:center }
.sidebar-footer { padding:16px 20px; border-top:1px solid var(--border) }
.logout-btn {
  width:100%; padding:9px 14px; background:transparent; border:1px solid var(--border);
  border-radius:8px; color:var(--red); font-size:13px; font-weight:600; cursor:pointer; transition:.15s;
}
.logout-btn:hover { background:#ef444415; border-color:var(--red) }

/* ── Main ───────────────────────────────────────── */
.main { margin-left:240px; flex:1; padding:28px 32px; min-height:100vh }
.page { display:none }
.page.active { display:block }

/* ── Page header ────────────────────────────────── */
.page-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px }
.page-head h1 { font-size:22px; font-weight:700 }
.page-head p  { color:var(--muted); font-size:13px; margin-top:3px }

/* ── Stat cards ─────────────────────────────────── */
.stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px }
.stat-card {
  background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:20px 22px;
  position:relative; overflow:hidden;
}
.stat-card::before {
  content:''; position:absolute; top:0; left:0; right:0; height:3px;
  background:linear-gradient(90deg,var(--c1),var(--c2));
}
.stat-card .val { font-size:34px; font-weight:800; line-height:1 }
.stat-card .lbl { font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.6px; margin-top:6px; text-transform:uppercase }
.stat-card .icon { position:absolute; right:16px; top:16px; font-size:28px; opacity:.15 }

/* ── Card ───────────────────────────────────────── */
.card { background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; margin-bottom:22px }
.card-head { padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center }
.card-head h3 { font-size:14px; font-weight:700 }

/* ── Table ───────────────────────────────────────── */
.tbl { width:100%; border-collapse:collapse }
.tbl th { padding:10px 16px; text-align:left; font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.6px; text-transform:uppercase; border-bottom:1px solid var(--border); background:var(--surface) }
.tbl td { padding:12px 16px; font-size:13px; border-bottom:1px solid var(--border) }
.tbl tr:last-child td { border-bottom:none }
.tbl tbody tr:hover td { background:var(--surface2) }
.tbl code { font-size:12px; background:var(--surface2); padding:2px 7px; border-radius:5px; color:var(--cyan); font-family:monospace }

/* ── Badge ───────────────────────────────────────── */
.badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; letter-spacing:.3px }
.badge-green  { background:#22c55e20; color:var(--green);  border:1px solid #22c55e30 }
.badge-red    { background:#ef444420; color:var(--red);    border:1px solid #ef444430 }
.badge-blue   { background:#3b82f620; color:var(--blue);   border:1px solid #3b82f630 }
.badge-yellow { background:#f59e0b20; color:var(--yellow); border:1px solid #f59e0b30 }
.badge-muted  { background:#64748b20; color:var(--muted);  border:1px solid #64748b30 }

/* ── Buttons ─────────────────────────────────────── */
.btn { display:inline-flex; align-items:center; gap:6px; padding:9px 16px; border-radius:8px; border:none; font-size:13px; font-weight:600; cursor:pointer; transition:.15s; white-space:nowrap }
.btn:hover { opacity:.85; transform:translateY(-1px) }
.btn:active { transform:translateY(0) }
.btn-primary { background:linear-gradient(135deg,var(--blue),var(--purple)); color:#fff }
.btn-sm      { padding:5px 11px; font-size:12px }
.btn-danger  { background:#ef444415; color:var(--red);    border:1px solid #ef444440 }
.btn-warn    { background:#f59e0b15; color:var(--yellow); border:1px solid #f59e0b40 }
.btn-muted   { background:var(--surface2); color:var(--muted); border:1px solid var(--border) }
.btn-success { background:#22c55e15; color:var(--green);  border:1px solid #22c55e40 }

/* ── Modal ───────────────────────────────────────── */
.modal-bg { position:fixed; inset:0; background:#00000088; display:none; align-items:center; justify-content:center; z-index:200; backdrop-filter:blur(4px) }
.modal-bg.open { display:flex }
.modal { background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:28px 30px; width:100%; max-width:460px; box-shadow:0 24px 80px #0009; animation:slideUp .2s ease }
@keyframes slideUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
.modal h3 { font-size:17px; font-weight:700; margin-bottom:20px }
.modal-foot { display:flex; gap:10px; justify-content:flex-end; margin-top:24px }
.form-group { margin-bottom:16px }
.form-group label { display:block; font-size:11px; font-weight:700; color:var(--muted); letter-spacing:.5px; text-transform:uppercase; margin-bottom:6px }
.form-group input, .form-group textarea, .form-group select {
  width:100%; padding:10px 13px; background:var(--surface2); border:1px solid var(--border);
  border-radius:8px; color:var(--text); font-size:14px; outline:none; transition:.2s;
}
.form-group input:focus, .form-group textarea:focus { border-color:var(--blue); box-shadow:0 0 0 3px #3b82f620 }
.form-group .hint { font-size:11px; color:var(--muted); margin-top:5px }

/* ── Toast ───────────────────────────────────────── */
.toast-wrap { position:fixed; bottom:24px; right:24px; display:flex; flex-direction:column; gap:8px; z-index:999 }
.toast {
  padding:12px 18px; border-radius:10px; font-size:13px; font-weight:600;
  box-shadow:0 8px 32px #0006; opacity:0; transform:translateX(20px);
  transition:.3s; pointer-events:none; min-width:220px;
}
.toast.show { opacity:1; transform:translateX(0) }
.toast.ok  { background:var(--green); color:#fff }
.toast.err { background:var(--red);   color:#fff }
.toast.warn{ background:var(--yellow);color:#fff }

/* ── Empty state ─────────────────────────────────── */
.empty { text-align:center; padding:48px 20px; color:var(--muted) }
.empty .icon { font-size:36px; margin-bottom:10px }
.empty p { font-size:14px }

/* ── Quick ref table ─────────────────────────────── */
.endpoint-url { font-family:monospace; font-size:11.5px; color:var(--green); word-break:break-all }

/* ── Top domains mini-chart ──────────────────────── */
.domain-bar { display:flex; align-items:center; gap:10px; margin-bottom:8px }
.domain-bar .name { min-width:130px; font-size:12px; color:var(--muted) }
.domain-bar .bar  { flex:1; height:6px; background:var(--surface2); border-radius:3px; overflow:hidden }
.domain-bar .fill { height:100%; background:linear-gradient(90deg,var(--blue),var(--purple)); border-radius:3px }
.domain-bar .cnt  { font-size:12px; font-weight:700; min-width:30px; text-align:right }
</style>
</head>
<body>

<!-- ── Sidebar ─────────────────────────────────────────── -->
<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="brand">⚡ MTAIIRUS</div>
    <div class="sub">Proxy Admin Panel v2.0</div>
  </div>
  <nav class="nav">
    <div class="nav-item active" onclick="nav('dashboard',this)">
      <span class="icon">📊</span> Dashboard
    </div>
    <div class="nav-item" onclick="nav('domains',this)">
      <span class="icon">🌐</span> Domains
    </div>
    <div class="nav-item" onclick="nav('institutes',this)">
      <span class="icon">🏫</span> Institutes
    </div>
    <div class="nav-item" onclick="nav('logs',this)">
      <span class="icon">📋</span> Request Logs
    </div>
  </nav>
  <div class="sidebar-footer">
    <button class="logout-btn" onclick="logout()">🚪 Logout</button>
  </div>
</aside>

<!-- ── Main ───────────────────────────────────────────── -->
<main class="main">

  <!-- Dashboard -->
  <section class="page active" id="page-dashboard">
    <div class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>Proxy overview &amp; statistics</p>
      </div>
      <button class="btn btn-muted btn-sm" onclick="loadStats()">↻ Refresh</button>
    </div>
    <div class="stats">
      <div class="stat-card" style="--c1:#3b82f6;--c2:#06b6d4">
        <div class="val" id="s-domains">—</div>
        <div class="lbl">Active Domains</div>
        <div class="icon">🌐</div>
      </div>
      <div class="stat-card" style="--c1:#8b5cf6;--c2:#ec4899">
        <div class="val" id="s-institutes">—</div>
        <div class="lbl">Institutes</div>
        <div class="icon">🏫</div>
      </div>
      <div class="stat-card" style="--c1:#22c55e;--c2:#06b6d4">
        <div class="val" id="s-allowed">—</div>
        <div class="lbl">Allowed Reqs</div>
        <div class="icon">✅</div>
      </div>
      <div class="stat-card" style="--c1:#ef4444;--c2:#f59e0b">
        <div class="val" id="s-blocked">—</div>
        <div class="lbl">Blocked Reqs</div>
        <div class="icon">🚫</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <!-- Top domains -->
      <div class="card">
        <div class="card-head"><h3>🔥 Top Requesting Domains</h3></div>
        <div style="padding:18px 20px" id="top-domains-wrap">
          <div class="empty"><p>No requests yet</p></div>
        </div>
      </div>
      <!-- Quick ref -->
      <div class="card">
        <div class="card-head"><h3>📡 KGS Endpoint Reference</h3></div>
        <table class="tbl">
          <thead><tr><th>Label</th><th>Path</th></tr></thead>
          <tbody>
            <tr><td>All batches</td><td><span class="endpoint-url">/api/kgs/data/batches.json</span></td></tr>
            <tr><td>Today's classes</td><td><span class="endpoint-url">/api/kgs/api/send.php?action=today&amp;id=1119</span></td></tr>
            <tr><td>Classroom subjects</td><td><span class="endpoint-url">/api/kgs/api/send.php?action=classroom&amp;id=1119</span></td></tr>
            <tr><td>Lesson materials</td><td><span class="endpoint-url">/api/kgs/api/send.php?action=lesson&amp;id=1</span></td></tr>
            <tr><td>Video stream</td><td><span class="endpoint-url">/api/kgs/api/send.php?action=video&amp;id=1</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <!-- Domains -->
  <section class="page" id="page-domains">
    <div class="page-head">
      <div>
        <h1>Allowed Domains</h1>
        <p>Only whitelisted domains can call the proxy API</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-domain')">+ Add Domain</button>
    </div>
    <div class="card">
      <table class="tbl">
        <thead>
          <tr>
            <th>Domain</th><th>Note</th><th>Status</th><th>Added</th><th style="width:180px">Actions</th>
          </tr>
        </thead>
        <tbody id="domains-body">
          <tr><td colspan="5" class="empty"><p>Loading…</p></td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Institutes -->
  <section class="page" id="page-institutes">
    <div class="page-head">
      <div>
        <h1>Institutes</h1>
        <p>Manage proxy routing — each institute maps to a target backend</p>
      </div>
      <button class="btn btn-primary" onclick="openModal('modal-institute')">+ Add Institute</button>
    </div>
    <div class="card">
      <table class="tbl">
        <thead>
          <tr>
            <th>URL Name</th><th>Label</th><th>Target URL</th><th>Status</th><th style="width:180px">Actions</th>
          </tr>
        </thead>
        <tbody id="institutes-body">
          <tr><td colspan="5" class="empty"><p>Loading…</p></td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- Logs -->
  <section class="page" id="page-logs">
    <div class="page-head">
      <div>
        <h1>Request Logs</h1>
        <p>Last 200 proxy requests (newest first)</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-muted btn-sm" onclick="loadLogs()">↻ Refresh</button>
        <button class="btn btn-danger btn-sm" onclick="clearLogs()">🗑 Clear All</button>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn btn-sm btn-muted" onclick="filterLogs('')">All</button>
      <button class="btn btn-sm btn-success" onclick="filterLogs('allowed')">✅ Allowed</button>
      <button class="btn btn-sm btn-danger"  onclick="filterLogs('blocked')">🚫 Blocked</button>
    </div>
    <div class="card">
      <table class="tbl">
        <thead>
          <tr><th>Type</th><th>Domain</th><th>Institute</th><th>Method</th><th>Path</th><th>IP</th><th>Time</th></tr>
        </thead>
        <tbody id="logs-body">
          <tr><td colspan="7" class="empty"><p>Loading…</p></td></tr>
        </tbody>
      </table>
    </div>
  </section>

</main>

<!-- ── Add Domain Modal ─────────────────────────────────── -->
<div class="modal-bg" id="modal-domain">
  <div class="modal">
    <h3>🌐 Add Allowed Domain</h3>
    <div class="form-group">
      <label>Domain</label>
      <input id="d-domain" placeholder="e.g. myapp.com  or  localhost">
      <div class="hint">Protocol and paths are stripped automatically</div>
    </div>
    <div class="form-group">
      <label>Note (optional)</label>
      <input id="d-note" placeholder="e.g. Production frontend, Team app…">
    </div>
    <div class="modal-foot">
      <button class="btn btn-muted" onclick="closeModal('modal-domain')">Cancel</button>
      <button class="btn btn-primary" onclick="addDomain()">Add Domain</button>
    </div>
  </div>
</div>

<!-- ── Add Institute Modal ──────────────────────────────── -->
<div class="modal-bg" id="modal-institute">
  <div class="modal">
    <h3>🏫 Add Institute</h3>
    <div class="form-group">
      <label>URL Name</label>
      <input id="i-name" placeholder="e.g. harvard  (used in /api/harvard/...)">
      <div class="hint">Lowercase letters, numbers, hyphens only</div>
    </div>
    <div class="form-group">
      <label>Display Label</label>
      <input id="i-label" placeholder="e.g. Harvard University">
    </div>
    <div class="form-group">
      <label>Target Backend URL</label>
      <input id="i-target" placeholder="e.g. https://api.harvard.edu">
      <div class="hint">Requests are forwarded here with the institute prefix stripped</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-muted" onclick="closeModal('modal-institute')">Cancel</button>
      <button class="btn btn-primary" onclick="addInstitute()">Add Institute</button>
    </div>
  </div>
</div>

<!-- ── Toast container ──────────────────────────────────── -->
<div class="toast-wrap" id="toasts"></div>

<script>
// ── State ──────────────────────────────────────────
let allLogs = [];

// ── Navigation ─────────────────────────────────────
function nav(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  el.classList.add('active');
  if (page === 'dashboard')  loadStats();
  if (page === 'domains')    loadDomains();
  if (page === 'institutes') loadInstitutes();
  if (page === 'logs')       loadLogs();
}

// ── Toast ──────────────────────────────────────────
function toast(msg, type='ok') {
  const wrap = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  wrap.appendChild(el);
  requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 2600);
}

// ── API ────────────────────────────────────────────
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) { location.href = '/admin/login'; return; }
  const text = await r.text();
  let d;
  try { d = JSON.parse(text); }
  catch { throw new Error('Server error: ' + text.slice(0, 120)); }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

// ── Modal helpers ──────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-bg').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ── Stats ──────────────────────────────────────────
async function loadStats() {
  try {
    const s = await api('GET', '/admin/api/stats');
    document.getElementById('s-domains').textContent    = s.activeDomains;
    document.getElementById('s-institutes').textContent = s.activeInstitutes;
    document.getElementById('s-allowed').textContent    = s.allowed;
    document.getElementById('s-blocked').textContent    = s.blocked;

    const wrap = document.getElementById('top-domains-wrap');
    if (!s.topDomains?.length) {
      wrap.innerHTML = '<div class="empty"><div class="icon">📭</div><p>No requests logged yet</p></div>';
      return;
    }
    const max = s.topDomains[0].count;
    wrap.innerHTML = s.topDomains.map(d => \`
      <div class="domain-bar">
        <div class="name">\${d.domain}</div>
        <div class="bar"><div class="fill" style="width:\${Math.round(d.count/max*100)}%"></div></div>
        <div class="cnt">\${d.count}</div>
      </div>\`).join('');
  } catch (e) { toast(e.message, 'err'); }
}

// ── Domains ────────────────────────────────────────
async function loadDomains() {
  try {
    const list = await api('GET', '/admin/api/domains');
    const tb = document.getElementById('domains-body');
    if (!list.length) {
      tb.innerHTML = \`<tr><td colspan="5"><div class="empty"><div class="icon">🌐</div><p>No domains yet — add one above</p></div></td></tr>\`;
      return;
    }
    tb.innerHTML = list.map(d => \`
      <tr>
        <td><b>\${d.domain}</b></td>
        <td style="color:var(--muted)">\${d.note || '—'}</td>
        <td>\${d.active
          ? '<span class="badge badge-green">Active</span>'
          : '<span class="badge badge-red">Disabled</span>'}</td>
        <td style="color:var(--muted);font-size:12px">\${new Date(d.createdAt).toLocaleDateString()}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm \${d.active ? 'btn-warn' : 'btn-success'}"
              onclick="toggleDomain('\${d._id}',\${!d.active})">
              \${d.active ? 'Disable' : 'Enable'}
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteDomain('\${d._id}','\${d.domain}')">
              Delete
            </button>
          </div>
        </td>
      </tr>\`).join('');
  } catch (e) { toast(e.message, 'err'); }
}

function clearDomainForm() {
  document.getElementById('d-domain').value = '';
  document.getElementById('d-note').value   = '';
}

async function addDomain() {
  const domain = document.getElementById('d-domain').value.trim();
  const note   = document.getElementById('d-note').value.trim();
  if (!domain) { toast('Enter a domain name', 'err'); return; }
  try {
    await api('POST', '/admin/api/domains', { domain, note });
    closeModal('modal-domain');
    clearDomainForm();
    toast('✅ Domain added');
    loadDomains();
    loadStats();
  } catch (e) { toast(e.message, 'err'); }
}

async function toggleDomain(id, active) {
  try {
    await api('PATCH', \`/admin/api/domains/\${id}\`, { active });
    toast(active ? '✅ Domain enabled' : '⚠️ Domain disabled', active ? 'ok' : 'warn');
    loadDomains(); loadStats();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteDomain(id, name) {
  if (!confirm(\`Delete "\${name}"? This will immediately block requests from it.\`)) return;
  try {
    await api('DELETE', \`/admin/api/domains/\${id}\`);
    toast('🗑 Domain removed');
    loadDomains(); loadStats();
  } catch (e) { toast(e.message, 'err'); }
}

// ── Institutes ─────────────────────────────────────
async function loadInstitutes() {
  try {
    const list = await api('GET', '/admin/api/institutes');
    const tb = document.getElementById('institutes-body');
    if (!list.length) {
      tb.innerHTML = \`<tr><td colspan="5"><div class="empty"><div class="icon">🏫</div><p>No institutes yet</p></div></td></tr>\`;
      return;
    }
    tb.innerHTML = list.map(i => \`
      <tr>
        <td><code>/api/\${i.name}</code></td>
        <td>\${i.label}</td>
        <td style="color:var(--muted);font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis">\${i.target}</td>
        <td>\${i.active
          ? '<span class="badge badge-green">Active</span>'
          : '<span class="badge badge-red">Disabled</span>'}</td>
        <td>
          <div style="display:flex;gap:6px">
            <button class="btn btn-sm \${i.active ? 'btn-warn' : 'btn-success'}"
              onclick="toggleInstitute('\${i._id}',\${!i.active})">
              \${i.active ? 'Disable' : 'Enable'}
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteInstitute('\${i._id}','\${i.name}')">
              Delete
            </button>
          </div>
        </td>
      </tr>\`).join('');
  } catch (e) { toast(e.message, 'err'); }
}

function clearInstForm() {
  ['i-name','i-label','i-target'].forEach(id => document.getElementById(id).value = '');
}

async function addInstitute() {
  const name   = document.getElementById('i-name').value.trim();
  const label  = document.getElementById('i-label').value.trim();
  const target = document.getElementById('i-target').value.trim();
  if (!name || !target) { toast('Name and target URL are required', 'err'); return; }
  try {
    await api('POST', '/admin/api/institutes', { name, label, target });
    closeModal('modal-institute');
    clearInstForm();
    toast('✅ Institute added');
    loadInstitutes();
  } catch (e) { toast(e.message, 'err'); }
}

async function toggleInstitute(id, active) {
  try {
    await api('PATCH', \`/admin/api/institutes/\${id}\`, { active });
    toast(active ? '✅ Institute enabled' : '⚠️ Institute disabled', active ? 'ok' : 'warn');
    loadInstitutes();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteInstitute(id, name) {
  if (!confirm(\`Delete institute "\${name}"? Proxy calls to /api/\${name}/... will return 404.\`)) return;
  try {
    await api('DELETE', \`/admin/api/institutes/\${id}\`);
    toast('🗑 Institute removed');
    loadInstitutes();
  } catch (e) { toast(e.message, 'err'); }
}

// ── Logs ───────────────────────────────────────────
let logFilter = '';
async function loadLogs() {
  try {
    allLogs = await api('GET', '/admin/api/logs');
    renderLogs();
  } catch (e) { toast(e.message, 'err'); }
}

function filterLogs(type) { logFilter = type; renderLogs(); }

function renderLogs() {
  const filtered = logFilter ? allLogs.filter(l => l.type === logFilter) : allLogs;
  const tb = document.getElementById('logs-body');
  if (!filtered.length) {
    tb.innerHTML = \`<tr><td colspan="7"><div class="empty"><div class="icon">📋</div><p>No logs\${logFilter ? ' matching filter' : ' yet'}</p></div></td></tr>\`;
    return;
  }
  tb.innerHTML = filtered.map(l => \`
    <tr>
      <td>\${l.type === 'allowed'
        ? '<span class="badge badge-green">allowed</span>'
        : '<span class="badge badge-red">blocked</span>'}</td>
      <td><b>\${l.domain || '—'}</b></td>
      <td><code>\${l.institute || '—'}</code></td>
      <td><span class="badge badge-muted">\${l.method || 'GET'}</span></td>
      <td style="font-size:11.5px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis">\${l.path || '—'}</td>
      <td style="font-size:11.5px;color:var(--muted)">\${l.ip || '—'}</td>
      <td style="font-size:11.5px;color:var(--muted)">\${new Date(l.at).toLocaleTimeString()}</td>
    </tr>\`).join('');
}

async function clearLogs() {
  if (!confirm('Clear all request logs?')) return;
  try {
    await api('DELETE', '/admin/api/logs');
    toast('🗑 Logs cleared');
    allLogs = [];
    renderLogs();
    loadStats();
  } catch (e) { toast(e.message, 'err'); }
}

// ── Logout ─────────────────────────────────────────
async function logout() {
  await fetch('/admin/api/logout', { method: 'POST' });
  location.href = '/admin/login';
}

// ── Init ───────────────────────────────────────────
loadStats();
</script>
</body>
</html>`;
}

module.exports = { adminPanel };
