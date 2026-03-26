/* =========================================================
   SYSTEM MONITOR — dashboard.js
   ========================================================= */

const POLL_MS = 1500;
let metrics = {};
let history = {};
let processSort = 'cpu';
let processList = [];
let charts = {};
let reportData = null;

// ─── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  pollMetrics();
  setInterval(pollMetrics, POLL_MS);
  setInterval(loadProcesses, 5000);

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('reportBtn').addEventListener('click', openReport);
  document.getElementById('actionsBtn').addEventListener('click', toggleActions);
  document.getElementById('downloadReportBtn').addEventListener('click', downloadReport);

  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      switchView(el.dataset.view);
    });
  });

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      processSort = btn.dataset.sort;
      renderProcessTable();
    });
  });

  document.addEventListener('click', e => {
    const menu = document.getElementById('actionsDropdown');
    if (!document.getElementById('actionsBtn').contains(e.target) && menu.classList.contains('open')) {
      menu.classList.remove('open');
    }
  });

  loadProcesses();
});

// ─── POLLING ──────────────────────────────────────────────
async function pollMetrics() {
  try {
    const [mRes, hRes] = await Promise.all([
      fetch('/metrics'),
      fetch('/history')
    ]);
    metrics = await mRes.json();
    history = await hRes.json();
    updateDashboard();
    updateActiveDetailView();
  } catch (err) {
    document.getElementById('liveStatus').textContent = 'Error';
  }
}

// ─── DASHBOARD UPDATE ─────────────────────────────────────
function updateDashboard() {
  if (!metrics.cpu) return;

  const cpu = metrics.cpu;
  const mem = metrics.memory;
  const disk = metrics.disk;
  const net = metrics.network;
  const batt = metrics.battery;
  const uptime = metrics.uptime;

  // CPU card
  setText('cpuPercent', cpu.percent.toFixed(1));
  setBar('cpuBar', cpu.percent);
  setText('cpuMeta', `${cpu.count_logical} logical · ${cpu.freq_current || '—'} MHz`);
  setBadge('cpuStatus', scoreStatus(cpu.percent));

  // RAM card
  setText('ramPercent', mem.percent.toFixed(1));
  setBar('ramBar', mem.percent);
  setText('ramMeta', `${gb(mem.used)} / ${gb(mem.total)} GB`);
  setBadge('ramStatus', scoreStatus(mem.percent));

  // Disk card
  setText('diskPercent', disk.percent.toFixed(1));
  setBar('diskBar', disk.percent);
  setText('diskMeta', `${gb(disk.used)} / ${gb(disk.total)} GB`);
  setBadge('diskStatus', scoreStatus(disk.percent, 70, 90));

  // Network card
  setText('netRecv', (net.recv_rate / 1024).toFixed(1));
  setText('netSent', (net.sent_rate / 1024).toFixed(1));
  setText('netMeta', `↑ ${mb(net.bytes_sent)} MB sent · ↓ ${mb(net.bytes_recv)} MB recv`);

  // Battery card
  if (batt) {
    setText('battPercent', batt.percent.toFixed(0));
    setBar('battBar', batt.percent);
    const state = batt.plugged ? '⚡ Charging' : '🔋 On Battery';
    const time = batt.secsleft > 0 ? ` · ${formatTime(batt.secsleft)}` : '';
    setText('battMeta', state + time);
    setBadge('battStatus', batt.percent < 20 ? 'critical' : batt.percent < 40 ? 'warning' : 'healthy');
  } else {
    setText('battPercent', 'N/A');
    setText('battMeta', 'No battery detected');
  }

  // Uptime
  setText('uptimeDisplay', uptime.formatted);
  setText('uptimeBadge', '↑ ' + uptime.formatted);

  // Charts
  updateCharts();
}

// ─── CHARTS INIT ──────────────────────────────────────────
function initCharts() {
  const isDark = document.documentElement.dataset.theme !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#7a8499' : '#5a6380';

  Chart.defaults.color = textColor;
  Chart.defaults.borderColor = gridColor;

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 300 },
    plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
      y: { grid: { color: gridColor }, ticks: { font: { size: 10 } }, min: 0 }
    }
  };

  // CPU+RAM chart
  charts.cpuRam = new Chart(document.getElementById('cpuRamChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        lineDs('CPU %', '#3b82f6', []),
        lineDs('RAM %', '#a855f7', [])
      ]
    },
    options: { ...baseOpts, scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, max: 100 } } }
  });

  // Network
  charts.net = new Chart(document.getElementById('netChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        lineDs('↓ Recv', '#22c55e', []),
        lineDs('↑ Sent', '#3b82f6', [])
      ]
    },
    options: { ...baseOpts }
  });

  // Disk IO
  charts.disk = new Chart(document.getElementById('diskChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        lineDs('Read', '#06b6d4', []),
        lineDs('Write', '#f59e0b', [])
      ]
    },
    options: { ...baseOpts }
  });

  // Detail charts (reuse same canvases on detail views)
  charts.cpuDetail = new Chart(document.getElementById('cpuDetailChart'), {
    type: 'line',
    data: { labels: [], datasets: [lineDs('CPU %', '#3b82f6', [])] },
    options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, max: 100 } } }
  });

  charts.ramDetail = new Chart(document.getElementById('ramDetailChart'), {
    type: 'line',
    data: { labels: [], datasets: [lineDs('RAM %', '#a855f7', [])] },
    options: { ...baseOpts, plugins: { legend: { display: false } }, scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, max: 100 } } }
  });

  charts.diskDetail = new Chart(document.getElementById('diskDetailChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [lineDs('Read KB/s', '#06b6d4', []), lineDs('Write KB/s', '#f59e0b', [])]
    },
    options: { ...baseOpts }
  });

  charts.netDetail = new Chart(document.getElementById('netDetailChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [lineDs('↓ Recv KB/s', '#22c55e', []), lineDs('↑ Sent KB/s', '#3b82f6', [])]
    },
    options: { ...baseOpts }
  });
}

function lineDs(label, color, data) {
  return {
    label, data,
    borderColor: color,
    backgroundColor: color + '20',
    borderWidth: 2,
    pointRadius: 0,
    fill: true,
    tension: 0.4
  };
}

function updateCharts() {
  if (!history.timestamps || !history.timestamps.length) return;
  const labels = history.timestamps;

  setChartData(charts.cpuRam, labels, [history.cpu, history.ram]);
  setChartData(charts.net, labels, [history.net_recv, history.net_sent]);
  setChartData(charts.disk, labels, [history.disk_read, history.disk_write]);
  setChartData(charts.cpuDetail, labels, [history.cpu]);
  setChartData(charts.ramDetail, labels, [history.ram]);
  setChartData(charts.diskDetail, labels, [history.disk_read, history.disk_write]);
  setChartData(charts.netDetail, labels, [history.net_recv, history.net_sent]);
}

function setChartData(chart, labels, datasets) {
  chart.data.labels = [...labels];
  datasets.forEach((d, i) => { if (chart.data.datasets[i]) chart.data.datasets[i].data = [...d]; });
  chart.update('none');
}

// ─── DETAIL VIEW RENDERING ────────────────────────────────
function updateActiveDetailView() {
  const active = document.querySelector('.view.active');
  if (!active) return;
  const id = active.id.replace('view-', '');
  if (id === 'cpu') renderCpuDetail();
  else if (id === 'memory') renderMemDetail();
  else if (id === 'disk') renderDiskDetail();
  else if (id === 'network') renderNetDetail();
  else if (id === 'battery') renderBattDetail();
}

function renderCpuDetail() {
  if (!metrics.cpu) return;
  const c = metrics.cpu;

  html('cpuDetailStats', `
    ${statRow('Usage', c.percent.toFixed(1) + '%')}
    ${statBar('CPU Load', c.percent, 100, '#3b82f6')}
    ${statRow('Logical Cores', c.count_logical)}
    ${statRow('Physical Cores', c.count_physical)}
    ${statRow('Frequency', c.freq_current ? c.freq_current + ' MHz' : '—')}
    ${statRow('Max Frequency', c.freq_max ? c.freq_max + ' MHz' : '—')}
  `);

  if (c.per_core) {
    const items = c.per_core.map((v, i) => `
      <div class="core-item">
        <div class="core-name">Core ${i}</div>
        <div class="core-val" style="color:${cpuColor(v)}">${v.toFixed(0)}%</div>
        <div class="core-bar"><div class="core-bar-fill" style="width:${v}%;background:${cpuColor(v)}"></div></div>
      </div>
    `).join('');
    html('coreGrid', items);
  }
}

function renderMemDetail() {
  if (!metrics.memory) return;
  const m = metrics.memory;
  html('memDetailStats', `
    ${statRow('Used', gb(m.used) + ' GB')}
    ${statRow('Available', gb(m.available) + ' GB')}
    ${statRow('Total', gb(m.total) + ' GB')}
    ${statBar('Usage', m.percent, 100, '#a855f7')}
  `);
  html('swapStats', `
    ${statRow('Swap Used', gb(m.swap_used) + ' GB')}
    ${statRow('Swap Total', gb(m.swap_total) + ' GB')}
    ${statBar('Swap Usage', m.swap_percent, 100, '#f59e0b')}
  `);
}

function renderDiskDetail() {
  if (!metrics.disk) return;
  const d = metrics.disk;
  html('diskDetailStats', `
    ${statRow('Used', gb(d.used) + ' GB')}
    ${statRow('Free', gb(d.free) + ' GB')}
    ${statRow('Total', gb(d.total) + ' GB')}
    ${statBar('Usage', d.percent, 100, '#06b6d4')}
    ${statRow('Read Rate', (d.read_rate / 1024).toFixed(1) + ' KB/s')}
    ${statRow('Write Rate', (d.write_rate / 1024).toFixed(1) + ' KB/s')}
  `);

  if (d.partitions) {
    const items = d.partitions.map(p => `
      <div class="partition-item">
        <div class="partition-header">
          <span class="partition-device">${p.device}</span>
          <span class="partition-pct" style="color:${cpuColor(p.percent)}">${p.percent.toFixed(0)}%</span>
        </div>
        <div class="stat-bar"><div class="stat-bar-inner" style="width:${p.percent}%;background:${cpuColor(p.percent)}"></div></div>
        <div style="font-size:10px;color:var(--text2);margin-top:6px">${p.mountpoint} · ${p.fstype} · ${gb(p.used)}/${gb(p.total)} GB</div>
      </div>
    `).join('');
    html('partitionList', items);
  }
}

function renderNetDetail() {
  if (!metrics.network) return;
  const n = metrics.network;
  html('netDetailStats', `
    ${statRow('Download', (n.recv_rate / 1024).toFixed(1) + ' KB/s')}
    ${statRow('Upload', (n.sent_rate / 1024).toFixed(1) + ' KB/s')}
  `);
  html('netCounters', `
    ${statRow('Total Received', mb(n.bytes_recv) + ' MB')}
    ${statRow('Total Sent', mb(n.bytes_sent) + ' MB')}
    ${statRow('Packets Recv', n.packets_recv.toLocaleString())}
    ${statRow('Packets Sent', n.packets_sent.toLocaleString())}
  `);
}

function renderBattDetail() {
  const b = metrics.battery;
  if (!b) {
    html('batteryDetail', '<p style="color:var(--text2);text-align:center;padding:20px">No battery detected on this system.</p>');
    return;
  }
  const color = b.percent < 20 ? 'var(--red)' : b.percent < 40 ? 'var(--yellow)' : 'var(--green)';
  const state = b.plugged ? '⚡ Charging' : '🔋 Discharging';
  const remaining = b.secsleft > 0 ? formatTime(b.secsleft) + ' remaining' : (b.plugged ? 'Fully charged' : 'Calculating…');
  html('batteryDetail', `
    <div class="battery-icon-wrap">
      <div class="battery-big" style="color:${color}">${b.percent.toFixed(0)}%</div>
      <div style="font-size:16px;font-weight:600">${state}</div>
      <div style="font-size:13px;color:var(--text2)">${remaining}</div>
    </div>
    <div style="width:200px">
      <div class="stat-bar" style="height:12px;border-radius:6px">
        <div class="stat-bar-inner" style="width:${b.percent}%;background:${color}"></div>
      </div>
    </div>
  `);
}

// ─── PROCESSES ────────────────────────────────────────────
async function loadProcesses() {
  try {
    const res = await fetch('/processes');
    processList = await res.json();
    renderProcessTable();
  } catch (e) {}
}

function renderProcessTable() {
  const sorted = [...processList].sort((a, b) => processSort === 'cpu' ? b.cpu - a.cpu : b.mem - a.mem);
  const rows = sorted.map(p => {
    const cpuClass = p.cpu > 50 ? 'cpu-high' : p.cpu > 20 ? 'cpu-med' : '';
    return `<tr>
      <td>${p.pid}</td>
      <td>${esc(p.name)}</td>
      <td class="${cpuClass}">${p.cpu.toFixed(1)}</td>
      <td>${p.mem.toFixed(2)}</td>
      <td>${p.status}</td>
    </tr>`;
  }).join('');
  html('processTable', rows);
}

// ─── REPORT ───────────────────────────────────────────────
async function openReport() {
  document.getElementById('reportModal').classList.add('open');
  html('reportContent', '<div class="loading-spinner">Analyzing system…</div>');

  try {
    const res = await fetch('/report');
    reportData = await res.json();
    renderReport(reportData);
  } catch (e) {
    html('reportContent', '<p style="color:var(--red)">Failed to generate report.</p>');
  }
}

function renderReport(r) {
  const statusColor = { healthy: 'var(--green)', warning: 'var(--yellow)', critical: 'var(--red)' };
  const scoreColor = statusColor[r.overall.status] || 'var(--text)';
  const ts = new Date(r.generated_at).toLocaleString();

  const compHtml = Object.entries(r.components).map(([key, val]) => {
    const color = statusColor[val.status] || 'var(--text2)';
    let detail = '';
    if (key === 'cpu') detail = `${val.usage?.toFixed(0) || '—'}% · ${val.cores || '—'} cores`;
    else if (key === 'memory') detail = `${val.usage_percent?.toFixed(0) || '—'}% · ${val.used_gb}/${val.total_gb} GB`;
    else if (key === 'disk') detail = `${val.usage_percent?.toFixed(0) || '—'}% · ${val.used_gb}/${val.total_gb} GB`;
    else if (key === 'network') detail = `↓ ${val.recv_kb} ↑ ${val.sent_kb} KB/s`;
    else if (key === 'uptime') detail = val.formatted || `${val.days}d`;
    return `<div class="report-comp">
      <div class="report-comp-title">${key}</div>
      <div class="report-comp-val" style="color:${color}">${detail}</div>
    </div>`;
  }).join('');

  const recIcons = { critical: '🔴', warning: '🟡', info: '🟢' };
  const recsHtml = r.recommendations.map(rec => `
    <div class="rec-item ${rec.severity}">
      <span class="rec-icon">${recIcons[rec.severity] || '⚪'}</span>
      <div class="rec-content">
        <div class="rec-title">${esc(rec.title)}</div>
        <div class="rec-detail">${esc(rec.detail)}</div>
        <div class="rec-action">→ ${esc(rec.action)}</div>
      </div>
    </div>
  `).join('');

  html('reportContent', `
    <div class="report-overall">
      <div class="health-score" style="color:${scoreColor}">${r.overall.score}</div>
      <div>
        <div style="font-size:18px;font-weight:600">Health Score</div>
        <div style="font-size:12px;color:var(--text2)">${r.overall.status.toUpperCase()} · ${ts}</div>
      </div>
    </div>
    <div class="report-components">${compHtml}</div>
    <div class="recommendations-title">Recommendations</div>
    ${recsHtml}
  `);
}

function closeReport() {
  document.getElementById('reportModal').classList.remove('open');
}

function downloadReport() {
  if (!reportData) return;
  const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sysmon-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── ACTIONS ──────────────────────────────────────────────
function toggleActions() {
  document.getElementById('actionsDropdown').classList.toggle('open');
}

async function doAction(action) {
  document.getElementById('actionsDropdown').classList.remove('open');
  try {
    const res = await fetch(`/actions/${action}`, { method: 'POST' });
    const data = await res.json();
    showToast(data.message || 'Done');
  } catch (e) {
    showToast('Action failed', true);
  }
}

let pendingAction = null;

function confirmAction(action) {
  document.getElementById('actionsDropdown').classList.remove('open');
  pendingAction = action;
  const msgs = {
    restart: { title: 'Restart System?', msg: 'This will restart your computer in 5 seconds.' },
    shutdown: { title: 'Shutdown System?', msg: 'This will shut down your computer in 5 seconds.' }
  };
  const info = msgs[action] || { title: 'Confirm', msg: 'Are you sure?' };
  setText('confirmTitle', info.title);
  setText('confirmMessage', info.msg);
  document.getElementById('confirmOkBtn').onclick = () => {
    closeConfirm();
    doAction(action);
  };
  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
  pendingAction = null;
}

// ─── VIEW SWITCHING ───────────────────────────────────────
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById('view-' + name);
  if (view) view.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    dashboard: ['Overview', 'Real-time system metrics'],
    cpu: ['CPU', 'Processor usage and cores'],
    memory: ['Memory', 'RAM and swap usage'],
    disk: ['Disk', 'Storage and I/O'],
    network: ['Network', 'Interface traffic'],
    processes: ['Processes', 'Running processes'],
    battery: ['Battery', 'Power status'],
  };

  const t = titles[name] || ['System Monitor', ''];
  setText('pageTitle', t[0]);
  setText('pageSubtitle', t[1]);

  if (name === 'processes') loadProcesses();
  updateActiveDetailView();
}

// ─── THEME ────────────────────────────────────────────────
function toggleTheme() {
  const html = document.documentElement;
  const next = html.dataset.theme === 'dark' ? 'light' : 'dark';
  html.dataset.theme = next;
  // Recreate charts with new colors
  Object.values(charts).forEach(c => {
    const isDark = next === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#7a8499' : '#5a6380';
    c.options.scales.x.grid.color = gridColor;
    c.options.scales.y.grid.color = gridColor;
    c.options.scales.x.ticks.color = textColor;
    c.options.scales.y.ticks.color = textColor;
    c.update();
  });
}

// ─── TOAST ────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.borderColor = isError ? 'var(--red)' : 'var(--green)';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ─── HELPERS ──────────────────────────────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function html(id, val) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = val;
}

function setBar(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(100, pct) + '%';
}

function setBadge(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'card-badge ' + status;
  el.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function gb(bytes) { return (bytes / 1e9).toFixed(1); }
function mb(bytes) { return (bytes / 1e6).toFixed(0); }

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scoreStatus(val, warn = 60, crit = 85) {
  if (val >= crit) return 'critical';
  if (val >= warn) return 'warning';
  return 'healthy';
}

function cpuColor(val) {
  if (val >= 85) return 'var(--red)';
  if (val >= 60) return 'var(--yellow)';
  return 'var(--accent)';
}

function statRow(key, val) {
  return `<div class="stat-row"><span class="stat-key">${key}</span><span class="stat-val">${val}</span></div>`;
}

function statBar(label, val, max, color) {
  const pct = Math.min(100, (val / max) * 100);
  return `<div class="stat-bar-wrap">
    <div class="stat-bar-label"><span>${label}</span><span>${val.toFixed ? val.toFixed(1) : val}%</span></div>
    <div class="stat-bar"><div class="stat-bar-inner" style="width:${pct}%;background:${color}"></div></div>
  </div>`;
}
