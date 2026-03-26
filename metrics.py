import psutil
import threading
import time
from collections import deque
from datetime import datetime

HISTORY_LEN = 60  # seconds of history


class MetricsCollector:
    def __init__(self):
        self._lock = threading.Lock()
        self._current = {}
        self._history = {
            'cpu': deque(maxlen=HISTORY_LEN),
            'ram': deque(maxlen=HISTORY_LEN),
            'net_sent': deque(maxlen=HISTORY_LEN),
            'net_recv': deque(maxlen=HISTORY_LEN),
            'disk_read': deque(maxlen=HISTORY_LEN),
            'disk_write': deque(maxlen=HISTORY_LEN),
            'timestamps': deque(maxlen=HISTORY_LEN),
        }
        self._prev_net = psutil.net_io_counters()
        self._prev_disk = psutil.disk_io_counters()
        self._prev_time = time.time()
        self._thread = None
        self._running = False

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._collect_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def force_update(self):
        self._collect()

    def _collect_loop(self):
        while self._running:
            self._collect()
            time.sleep(1)

    def _collect(self):
        now = time.time()
        elapsed = max(now - self._prev_time, 0.001)

        # CPU
        cpu_percent = psutil.cpu_percent(interval=None)
        cpu_per_core = psutil.cpu_percent(percpu=True)
        cpu_freq = psutil.cpu_freq()
        cpu_count = psutil.cpu_count(logical=True)
        cpu_count_physical = psutil.cpu_count(logical=False)

        # Memory
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        # Disk
        disk = psutil.disk_usage('/')
        try:
            disk_io = psutil.disk_io_counters()
            disk_read_rate = (disk_io.read_bytes - self._prev_disk.read_bytes) / elapsed
            disk_write_rate = (disk_io.write_bytes - self._prev_disk.write_bytes) / elapsed
            self._prev_disk = disk_io
        except Exception:
            disk_read_rate = 0
            disk_write_rate = 0

        # Network
        net = psutil.net_io_counters()
        net_sent_rate = (net.bytes_sent - self._prev_net.bytes_sent) / elapsed
        net_recv_rate = (net.bytes_recv - self._prev_net.bytes_recv) / elapsed
        self._prev_net = net

        # Battery
        battery = None
        try:
            b = psutil.sensors_battery()
            if b:
                battery = {
                    'percent': round(b.percent, 1),
                    'plugged': b.power_plugged,
                    'secsleft': b.secsleft if b.secsleft != psutil.POWER_TIME_UNLIMITED else -1,
                }
        except Exception:
            pass

        # Uptime
        boot_time = psutil.boot_time()
        uptime_secs = int(time.time() - boot_time)
        uptime_str = _format_uptime(uptime_secs)

        # All disk partitions
        partitions = []
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                partitions.append({
                    'device': part.device,
                    'mountpoint': part.mountpoint,
                    'fstype': part.fstype,
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': usage.percent,
                })
            except Exception:
                pass

        # Network interfaces
        net_addrs = {}
        for iface, addrs in psutil.net_if_addrs().items():
            net_addrs[iface] = [{'family': str(a.family), 'address': a.address} for a in addrs]

        self._prev_time = now

        data = {
            'timestamp': datetime.now().isoformat(),
            'cpu': {
                'percent': cpu_percent,
                'per_core': cpu_per_core,
                'freq_current': round(cpu_freq.current, 1) if cpu_freq else None,
                'freq_max': round(cpu_freq.max, 1) if cpu_freq else None,
                'count_logical': cpu_count,
                'count_physical': cpu_count_physical,
            },
            'memory': {
                'total': mem.total,
                'available': mem.available,
                'used': mem.used,
                'percent': mem.percent,
                'swap_total': swap.total,
                'swap_used': swap.used,
                'swap_percent': swap.percent,
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent,
                'read_rate': disk_read_rate,
                'write_rate': disk_write_rate,
                'partitions': partitions,
            },
            'network': {
                'sent_rate': net_sent_rate,
                'recv_rate': net_recv_rate,
                'bytes_sent': net.bytes_sent,
                'bytes_recv': net.bytes_recv,
                'packets_sent': net.packets_sent,
                'packets_recv': net.packets_recv,
                'interfaces': net_addrs,
            },
            'battery': battery,
            'uptime': {
                'seconds': uptime_secs,
                'formatted': uptime_str,
            },
        }

        with self._lock:
            self._current = data
            ts = datetime.now().strftime('%H:%M:%S')
            self._history['cpu'].append(cpu_percent)
            self._history['ram'].append(mem.percent)
            self._history['net_sent'].append(net_sent_rate / 1024)
            self._history['net_recv'].append(net_recv_rate / 1024)
            self._history['disk_read'].append(disk_read_rate / 1024)
            self._history['disk_write'].append(disk_write_rate / 1024)
            self._history['timestamps'].append(ts)

    def get_current(self):
        with self._lock:
            return dict(self._current)

    def get_history(self):
        with self._lock:
            return {
                'cpu': list(self._history['cpu']),
                'ram': list(self._history['ram']),
                'net_sent': list(self._history['net_sent']),
                'net_recv': list(self._history['net_recv']),
                'disk_read': list(self._history['disk_read']),
                'disk_write': list(self._history['disk_write']),
                'timestamps': list(self._history['timestamps']),
            }

    def get_processes(self):
        procs = []
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
            try:
                procs.append({
                    'pid': p.info['pid'],
                    'name': p.info['name'],
                    'cpu': round(p.info['cpu_percent'] or 0, 1),
                    'mem': round(p.info['memory_percent'] or 0, 2),
                    'status': p.info['status'],
                })
            except Exception:
                pass
        procs.sort(key=lambda x: x['cpu'], reverse=True)
        return procs[:50]


def _format_uptime(secs):
    days = secs // 86400
    secs %= 86400
    hours = secs // 3600
    secs %= 3600
    mins = secs // 60
    parts = []
    if days:
        parts.append(f'{days}d')
    if hours:
        parts.append(f'{hours}h')
    parts.append(f'{mins}m')
    return ' '.join(parts)
