const http = require('http');
const os = require('os');

const PORT = process.env.APP_PORT || 3000;

// ── Health checkers ────────────────────────────────────────────────────────
async function checkMySQL() {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    const host = process.env.MYSQL_HOST || 'mysql';
    socket.setTimeout(3000);
    socket.connect(3306, host, () => {
      socket.destroy();
      resolve({ status: 'healthy', host });
    });
    socket.on('error', () => resolve({ status: 'unreachable', host }));
    socket.on('timeout', () => { socket.destroy(); resolve({ status: 'timeout', host }); });
  });
}

async function checkMongo() {
  return new Promise((resolve) => {
    const net = require('net');
    const hosts = ['mongo-0.mongo', 'mongo-1.mongo', 'mongo-2.mongo'];
    let checked = 0;
    const results = [];
    hosts.forEach((host) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.connect(27017, host, () => {
        socket.destroy();
        results.push({ host, status: 'healthy' });
        if (++checked === hosts.length) resolve(results);
      });
      socket.on('error', () => {
        results.push({ host, status: 'unreachable' });
        if (++checked === hosts.length) resolve(results);
      });
      socket.on('timeout', () => {
        socket.destroy();
        results.push({ host, status: 'timeout' });
        if (++checked === hosts.length) resolve(results);
      });
    });
  });
}

// ── HTML Dashboard ─────────────────────────────────────────────────────────
function renderDashboard(data) {
  const mysqlColor = data.mysql.status === 'healthy' ? '#00ff88' : '#ff4466';
  const mongoNodes = data.mongo.map(n => {
    const color = n.status === 'healthy' ? '#00ff88' : '#ff4466';
    return `
      <div class="db-node">
        <div class="node-dot" style="background:${color}; box-shadow: 0 0 8px ${color}"></div>
        <span class="node-name">${n.host}</span>
        <span class="node-status" style="color:${color}">${n.status}</span>
      </div>`;
  }).join('');

  const envVars = ['NODE_ENV', 'MYSQL_HOST', 'MYSQL_DB', 'APP_PORT'].map(k => `
    <div class="env-row">
      <span class="env-key">${k}</span>
      <span class="env-val">${process.env[k] || '—'}</span>
    </div>`).join('');

  const uptime = Math.floor(process.uptime());
  const uptimeStr = `${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m ${uptime%60}s`;
  const memUsed = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>K8s System Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;600&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #080c14;
      --surface: #0d1525;
      --surface2: #111d33;
      --border: #1e2d4a;
      --accent: #00c8ff;
      --accent2: #7b5ea7;
      --green: #00ff88;
      --red: #ff4466;
      --text: #c8d8f0;
      --muted: #4a6080;
      --mono: 'Space Mono', monospace;
      --sans: 'DM Sans', sans-serif;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      min-height: 100vh;
      overflow-x: hidden;
    }

    /* Animated grid background */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image:
        linear-gradient(var(--border) 1px, transparent 1px),
        linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 48px 48px;
      opacity: 0.4;
      pointer-events: none;
      z-index: 0;
    }

    /* Glow orbs */
    body::after {
      content: '';
      position: fixed;
      top: -200px;
      left: -200px;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(0,200,255,0.06) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .page { position: relative; z-index: 1; padding: 32px; max-width: 1100px; margin: 0 auto; }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
    }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .logo {
      width: 44px; height: 44px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px;
    }
    .title { font-family: var(--mono); font-size: 20px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .subtitle { font-size: 12px; color: var(--muted); margin-top: 2px; font-family: var(--mono); }
    .live-badge {
      display: flex; align-items: center; gap: 8px;
      background: rgba(0,255,136,0.08);
      border: 1px solid rgba(0,255,136,0.2);
      border-radius: 20px;
      padding: 6px 14px;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--green);
    }
    .live-dot {
      width: 7px; height: 7px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 6px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    /* Grid layout */
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .span-2 { grid-column: span 2; }

    /* Cards */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
      position: relative;
      overflow: hidden;
      animation: fadeUp 0.4s ease both;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      opacity: 0.6;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .card:nth-child(2) { animation-delay: 0.05s; }
    .card:nth-child(3) { animation-delay: 0.10s; }
    .card:nth-child(4) { animation-delay: 0.15s; }
    .card:nth-child(5) { animation-delay: 0.20s; }

    .card-label {
      font-family: var(--mono);
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    .card-value {
      font-family: var(--mono);
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      line-height: 1;
    }
    .card-sub { font-size: 12px; color: var(--muted); margin-top: 8px; font-family: var(--mono); }

    /* Pod info */
    .pod-id {
      font-family: var(--mono);
      font-size: 13px;
      color: var(--accent);
      background: rgba(0,200,255,0.08);
      border: 1px solid rgba(0,200,255,0.15);
      border-radius: 6px;
      padding: 10px 14px;
      word-break: break-all;
      margin-bottom: 12px;
    }
    .pod-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .pod-meta-item { background: var(--surface2); border-radius: 8px; padding: 10px 12px; }
    .pod-meta-key { font-size: 10px; color: var(--muted); font-family: var(--mono); letter-spacing: 1px; text-transform: uppercase; }
    .pod-meta-val { font-size: 13px; color: var(--text); font-family: var(--mono); margin-top: 4px; }

    /* DB status */
    .db-status-row {
      display: flex; align-items: center; justify-content: space-between;
      background: var(--surface2);
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 10px;
    }
    .db-label { display: flex; align-items: center; gap: 10px; }
    .db-icon { font-size: 18px; }
    .db-name { font-family: var(--mono); font-size: 13px; color: var(--text); }
    .db-tag {
      font-size: 10px;
      color: var(--muted);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: var(--mono);
    }
    .status-pill {
      font-family: var(--mono);
      font-size: 11px;
      padding: 4px 12px;
      border-radius: 20px;
    }
    .status-pill.healthy { background: rgba(0,255,136,0.1); color: var(--green); border: 1px solid rgba(0,255,136,0.3); }
    .status-pill.error   { background: rgba(255,68,102,0.1); color: var(--red); border: 1px solid rgba(255,68,102,0.3); }

    /* Mongo nodes */
    .db-node {
      display: flex; align-items: center; gap: 10px;
      background: var(--surface2);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 8px;
    }
    .node-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .node-name { font-family: var(--mono); font-size: 12px; color: var(--text); flex: 1; }
    .node-status { font-family: var(--mono); font-size: 11px; }

    /* Env vars */
    .env-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      font-family: var(--mono);
      font-size: 12px;
    }
    .env-row:last-child { border-bottom: none; }
    .env-key { color: var(--accent); }
    .env-val { color: var(--text); background: var(--surface2); padding: 3px 8px; border-radius: 4px; }

    /* Memory bar */
    .mem-bar-wrap { margin-top: 12px; }
    .mem-bar-labels { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 11px; color: var(--muted); margin-bottom: 6px; }
    .mem-bar { height: 6px; background: var(--surface2); border-radius: 3px; overflow: hidden; }
    .mem-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      border-radius: 3px;
      transition: width 0.5s ease;
    }

    /* Footer */
    .footer {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--muted);
    }

    @media (max-width: 700px) {
      .grid, .grid-3 { grid-template-columns: 1fr; }
      .span-2 { grid-column: span 1; }
      .page { padding: 16px; }
    }
  </style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <div class="logo">⎈</div>
      <div>
        <div class="title">K8s System Dashboard</div>
        <div class="subtitle">prod namespace · minikube</div>
      </div>
    </div>
    <div class="live-badge">
      <div class="live-dot"></div>
      LIVE
    </div>
  </div>

  <!-- Row 1: stats -->
  <div class="grid-3">
    <div class="card">
      <div class="card-label">Process Uptime</div>
      <div class="card-value">${uptimeStr}</div>
      <div class="card-sub">since last restart</div>
    </div>
    <div class="card">
      <div class="card-label">Node.js Version</div>
      <div class="card-value">${process.version}</div>
      <div class="card-sub">${process.platform} · ${os.arch()}</div>
    </div>
    <div class="card">
      <div class="card-label">Process Memory</div>
      <div class="card-value">${memUsed} <span style="font-size:14px;color:var(--muted)">MB</span></div>
      <div class="mem-bar-wrap">
        <div class="mem-bar-labels"><span>used</span><span>${freeMem}MB free of ${totalMem}MB</span></div>
        <div class="mem-bar"><div class="mem-bar-fill" style="width:${Math.min(100,Math.round((totalMem-freeMem)/totalMem*100))}%"></div></div>
      </div>
    </div>
  </div>

  <!-- Row 2: pod info + db status -->
  <div class="grid">
    <div class="card">
      <div class="card-label">Current Pod</div>
      <div class="pod-id">${os.hostname()}</div>
      <div class="pod-meta">
        <div class="pod-meta-item">
          <div class="pod-meta-key">Environment</div>
          <div class="pod-meta-val">${process.env.NODE_ENV || 'unknown'}</div>
        </div>
        <div class="pod-meta-item">
          <div class="pod-meta-key">Port</div>
          <div class="pod-meta-val">${PORT}</div>
        </div>
        <div class="pod-meta-item">
          <div class="pod-meta-key">Node CPU</div>
          <div class="pod-meta-val">${os.cpus().length} cores</div>
        </div>
        <div class="pod-meta-item">
          <div class="pod-meta-key">Load Avg</div>
          <div class="pod-meta-val">${os.loadavg()[0].toFixed(2)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-label">Database Status</div>
      <div class="db-status-row">
        <div class="db-label">
          <span class="db-icon">🐬</span>
          <div>
            <div class="db-name">MySQL</div>
            <span class="db-tag">master-master · port 3306</span>
          </div>
        </div>
        <span class="status-pill ${data.mysql.status === 'healthy' ? 'healthy' : 'error'}">${data.mysql.status}</span>
      </div>
      <div class="card-label" style="margin-top:16px;margin-bottom:10px">MongoDB Replica Set</div>
      ${mongoNodes}
    </div>
  </div>

  <!-- Row 3: env vars + ArgoCD note -->
  <div class="grid">
    <div class="card">
      <div class="card-label">Environment Config</div>
      ${envVars}
    </div>
    <div class="card">
      <div class="card-label">Deployment Info</div>
      <div class="db-status-row" style="margin-bottom:10px">
        <div class="db-label">
          <span class="db-icon">🐙</span>
          <div>
            <div class="db-name">ArgoCD</div>
            <span class="db-tag">GitOps · manual sync</span>
          </div>
        </div>
        <span class="status-pill healthy">active</span>
      </div>
      <div class="db-status-row" style="margin-bottom:10px">
        <div class="db-label">
          <span class="db-icon">🔒</span>
          <div>
            <div class="db-name">TLS / NGINX Ingress</div>
            <span class="db-tag">app.local · port 443</span>
          </div>
        </div>
        <span class="status-pill healthy">secured</span>
      </div>
      <div class="db-status-row">
        <div class="db-label">
          <span class="db-icon">📊</span>
          <div>
            <div class="db-name">Prometheus + Grafana</div>
            <span class="db-tag">kube-prometheus-stack</span>
          </div>
        </div>
        <span class="status-pill healthy">running</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>prod namespace · ${new Date().toUTCString()}</span>
    <span>node-app · k8s-prod-project</span>
  </div>

</div>
<script>
  // Auto-refresh every 15 seconds
  setTimeout(() => location.reload(), 15000);
</script>
</body>
</html>`;
}

// ── Server ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', pod: os.hostname() }));
  }

  if (req.url === '/api/status') {
    const [mysql, mongo] = await Promise.all([checkMySQL(), checkMongo()]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ pod: os.hostname(), mysql, mongo, uptime: process.uptime() }));
  }

  // Dashboard
  const [mysql, mongo] = await Promise.all([checkMySQL(), checkMongo()]);
  const html = renderDashboard({ mysql, mongo });
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

server.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
  console.log(`Pod: ${os.hostname()}`);
});
