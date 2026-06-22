
function loginPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin Login — MTAIIRUS Proxy</title>
<style>
*, *::before, *::after { margin:0; padding:0; box-sizing:border-box }
body {
  min-height:100vh; display:flex; align-items:center; justify-content:center;
  background:linear-gradient(135deg,#0f1117 0%,#161b27 50%,#0f1117 100%);
  font-family:'Segoe UI',system-ui,sans-serif;
}
.bg-orb {
  position:fixed; border-radius:50%; filter:blur(80px); pointer-events:none; opacity:.15;
}
.orb1 { width:400px; height:400px; background:#3b82f6; top:-100px; right:-100px }
.orb2 { width:300px; height:300px; background:#8b5cf6; bottom:-80px; left:-80px }

.card {
  position:relative; z-index:1;
  background:#161b27; border:1px solid #2a3347; border-radius:20px;
  padding:44px 40px; width:100%; max-width:400px;
  box-shadow:0 32px 80px rgba(0,0,0,.6);
}
.logo { text-align:center; margin-bottom:32px }
.logo .icon { font-size:40px; margin-bottom:10px }
.logo h1 { font-size:22px; font-weight:800; background:linear-gradient(135deg,#3b82f6,#8b5cf6); -webkit-background-clip:text; -webkit-text-fill-color:transparent }
.logo p { color:#64748b; font-size:13px; margin-top:4px }

label { display:block; font-size:11px; font-weight:700; color:#64748b; letter-spacing:.5px; text-transform:uppercase; margin-bottom:7px }
input[type=password] {
  width:100%; padding:13px 14px; background:#1e2535; border:1px solid #2a3347;
  border-radius:10px; color:#e2e8f0; font-size:15px; outline:none; transition:.2s;
}
input[type=password]:focus { border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,.2) }

.btn-login {
  width:100%; margin-top:22px; padding:14px;
  background:linear-gradient(135deg,#3b82f6,#8b5cf6);
  border:none; border-radius:10px; color:#fff; font-size:15px; font-weight:700;
  cursor:pointer; transition:.2s; letter-spacing:.3px;
}
.btn-login:hover { opacity:.9; transform:translateY(-1px); box-shadow:0 8px 24px rgba(59,130,246,.4) }
.btn-login:active { transform:translateY(0) }
.btn-login:disabled { opacity:.5; cursor:not-allowed; transform:none }

.error {
  margin-top:14px; padding:11px 14px; background:#ef444420; border:1px solid #ef444440;
  border-radius:8px; color:#ef4444; font-size:13px; font-weight:600; text-align:center;
  display:none;
}
.footer { text-align:center; margin-top:24px; font-size:12px; color:#374151 }
</style>
</head>
<body>
<div class="bg-orb orb1"></div>
<div class="bg-orb orb2"></div>

<div class="card">
  <div class="logo">
    <div class="icon">⚡</div>
    <h1>MTAIIRUS Proxy</h1>
    <p>Admin Control Panel</p>
  </div>

  <label>Admin Password</label>
  <input type="password" id="pw" placeholder="Enter password" autofocus
    onkeydown="if(event.key==='Enter') login()">

  <button class="btn-login" id="btn" onclick="login()">Sign In →</button>
  <div class="error" id="err">❌ Wrong password. Try again.</div>
  <div class="footer">MTAIIRUS Proxy v2.0</div>
</div>

<script>
async function login() {
  const pw  = document.getElementById('pw').value;
  const btn = document.getElementById('btn');
  const err = document.getElementById('err');
  if (!pw) return;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  err.style.display = 'none';
  try {
    const r = await fetch('/admin/api/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      location.href = '/admin';
    } else {
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Sign In →';
    }
  } catch {
    err.textContent = '❌ Server error. Try again.';
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Sign In →';
  }
}
</script>
</body>
</html>`;
}

module.exports = { loginPage };
