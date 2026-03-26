import time
from datetime import datetime


class SystemAnalyzer:
    def __init__(self, collector):
        self.collector = collector

    def generate_report(self):
        m = self.collector.get_current()
        procs = self.collector.get_processes()

        if not m:
            return {'error': 'No metrics available yet'}

        cpu = m.get('cpu', {})
        memory = m.get('memory', {})
        disk = m.get('disk', {})
        network = m.get('network', {})
        battery = m.get('battery')
        uptime = m.get('uptime', {})

        # Scores (0-100, higher = worse)
        cpu_score = cpu.get('percent', 0)
        ram_score = memory.get('percent', 0)
        disk_score = disk.get('percent', 0)

        # Status labels
        def status(val, warn=60, crit=85):
            if val >= crit:
                return 'critical'
            elif val >= warn:
                return 'warning'
            return 'healthy'

        cpu_status = status(cpu_score)
        ram_status = status(ram_score)
        disk_status = status(disk_score, warn=70, crit=90)

        # Uptime analysis
        uptime_secs = uptime.get('seconds', 0)
        uptime_days = uptime_secs / 86400
        if uptime_days > 30:
            uptime_status = 'warning'
        elif uptime_days > 60:
            uptime_status = 'critical'
        else:
            uptime_status = 'healthy'

        # Overall score
        overall = (cpu_score * 0.3 + ram_score * 0.3 + disk_score * 0.2 + (uptime_days / 90 * 100) * 0.2)
        overall = min(100, overall)

        if overall < 40:
            overall_status = 'healthy'
        elif overall < 70:
            overall_status = 'warning'
        else:
            overall_status = 'critical'

        # Recommendations
        recommendations = []

        if cpu_score >= 85:
            top_procs = [p for p in procs[:5] if p['cpu'] > 5]
            proc_names = ', '.join(p['name'] for p in top_procs[:3])
            recommendations.append({
                'severity': 'critical',
                'category': 'CPU',
                'title': 'High CPU Usage',
                'detail': f'CPU is at {cpu_score:.0f}%. Top consumers: {proc_names or "unknown"}.',
                'action': 'Consider closing unnecessary applications or upgrading CPU.'
            })
        elif cpu_score >= 60:
            recommendations.append({
                'severity': 'warning',
                'category': 'CPU',
                'title': 'Elevated CPU Usage',
                'detail': f'CPU usage at {cpu_score:.0f}% — above normal threshold.',
                'action': 'Monitor processes and close unused applications.'
            })

        if ram_score >= 85:
            recommendations.append({
                'severity': 'critical',
                'category': 'Memory',
                'title': 'Critical Memory Pressure',
                'detail': f'RAM usage at {ram_score:.0f}%. System may be swapping to disk.',
                'action': 'Close unused applications. Consider upgrading RAM.'
            })
        elif ram_score >= 70:
            recommendations.append({
                'severity': 'warning',
                'category': 'Memory',
                'title': 'High Memory Usage',
                'detail': f'RAM at {ram_score:.0f}%. Performance may degrade.',
                'action': 'Free up memory by closing applications.'
            })

        if disk_score >= 90:
            recommendations.append({
                'severity': 'critical',
                'category': 'Disk',
                'title': 'Disk Almost Full',
                'detail': f'Primary disk at {disk_score:.0f}% capacity.',
                'action': 'Delete unnecessary files or expand storage immediately.'
            })
        elif disk_score >= 70:
            recommendations.append({
                'severity': 'warning',
                'category': 'Disk',
                'title': 'Disk Space Running Low',
                'detail': f'Disk at {disk_score:.0f}% capacity.',
                'action': 'Clear temp files and remove unused software.'
            })

        if uptime_days > 30:
            recommendations.append({
                'severity': 'warning',
                'category': 'System',
                'title': 'Long System Uptime',
                'detail': f'System has been running for {uptime.get("formatted", "unknown")}.',
                'action': 'Consider restarting to apply updates and clear memory leaks.'
            })

        swap_pct = memory.get('swap_percent', 0)
        if swap_pct > 50:
            recommendations.append({
                'severity': 'warning',
                'category': 'Memory',
                'title': 'High Swap Usage',
                'detail': f'Swap memory at {swap_pct:.0f}%. This slows the system.',
                'action': 'Reduce memory usage or add more RAM.'
            })

        if not recommendations:
            recommendations.append({
                'severity': 'info',
                'category': 'System',
                'title': 'System Running Well',
                'detail': 'No critical issues detected.',
                'action': 'Continue regular maintenance.'
            })

        report = {
            'generated_at': datetime.now().isoformat(),
            'overall': {
                'score': round(100 - overall, 1),  # health score, higher = better
                'status': overall_status,
            },
            'components': {
                'cpu': {
                    'status': cpu_status,
                    'usage': cpu_score,
                    'cores': cpu.get('count_logical'),
                    'freq': cpu.get('freq_current'),
                },
                'memory': {
                    'status': ram_status,
                    'usage_percent': ram_score,
                    'used_gb': round(memory.get('used', 0) / 1e9, 2),
                    'total_gb': round(memory.get('total', 0) / 1e9, 2),
                    'swap_percent': swap_pct,
                },
                'disk': {
                    'status': disk_status,
                    'usage_percent': disk_score,
                    'used_gb': round(disk.get('used', 0) / 1e9, 2),
                    'total_gb': round(disk.get('total', 0) / 1e9, 2),
                },
                'network': {
                    'status': 'healthy',
                    'sent_kb': round(network.get('sent_rate', 0) / 1024, 2),
                    'recv_kb': round(network.get('recv_rate', 0) / 1024, 2),
                },
                'uptime': {
                    'status': uptime_status,
                    'formatted': uptime.get('formatted', 'N/A'),
                    'days': round(uptime_days, 1),
                },
            },
            'recommendations': recommendations,
            'top_processes_cpu': procs[:10],
        }

        return report
