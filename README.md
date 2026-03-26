# System Monitor

A local system monitoring desktop utility built with Python + Flask + pywebview.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the app
python main.py
```

A native desktop window will open showing your live system dashboard.

---

## Project Structure

```
system-monitor/
├── main.py          # Entry point — starts Flask + opens webview window
├── app.py           # Flask app factory and API routes
├── metrics.py       # psutil-based metrics collector (background thread)
├── analyzer.py      # Health analysis and recommendations engine
├── requirements.txt
│
├── templates/
│   └── dashboard.html   # Full single-page dashboard UI
│
└── static/
    ├── css/style.css    # Custom CSS (dark/light theme)
    └── js/dashboard.js  # Vanilla JS: charts, polling, interactivity
```

---

## API Endpoints

| Endpoint             | Method | Description                     |
|----------------------|--------|---------------------------------|
| `/`                  | GET    | Dashboard HTML                  |
| `/metrics`           | GET    | Current system metrics (JSON)   |
| `/processes`         | GET    | Top 50 processes (JSON)         |
| `/history`           | GET    | 60-second rolling history       |
| `/report`            | GET    | System health report + recs     |
| `/actions/refresh`   | POST   | Force metrics refresh           |
| `/actions/clear_temp`| POST   | Clear temp files                |
| `/actions/restart`   | POST   | Restart system (5s delay)       |
| `/actions/shutdown`  | POST   | Shutdown system (5s delay)      |

---

## Packaging as Windows .exe

### Prerequisites
```bash
pip install pyinstaller
```

### Build command
```bash
pyinstaller --onefile --windowed \
  --add-data "templates;templates" \
  --add-data "static;static" \
  --name "SystemMonitor" \
  main.py
```

On Linux/macOS (for cross-compile testing):
```bash
pyinstaller --onefile --windowed \
  --add-data "templates:templates" \
  --add-data "static:static" \
  --name "SystemMonitor" \
  main.py
```

The `.exe` will be in `dist/SystemMonitor.exe`.

### Notes
- `--windowed` suppresses the console window on Windows
- `--onefile` bundles everything into a single executable
- `--add-data` includes the HTML templates and static assets
- pywebview on Windows uses the Edge WebView2 runtime (built-in on Windows 11, auto-installed on Windows 10)

---

## Features

- **Dashboard Overview** — CPU, RAM, Disk, Network, Battery, Uptime cards
- **Detail Views** — Per-core CPU, memory breakdown, disk partitions, network counters
- **Live Charts** — 60-second rolling history with Chart.js
- **Health Report** — Automated analysis with recommendations, downloadable as JSON
- **Process Explorer** — Top 50 processes sortable by CPU or Memory
- **System Actions** — Refresh, clear temp files, restart, shutdown
- **Dark / Light mode** — Toggle in sidebar

---

## Dependencies

- `flask` — lightweight HTTP server
- `psutil` — cross-platform system metrics
- `pywebview` — native desktop webview window
- `Chart.js` — loaded from CDN (or bundle offline)
- `DM Sans / JetBrains Mono` — loaded from Google Fonts CDN

For fully offline use, download Chart.js and Google Fonts and serve them from `/static/`.
