from flask import Flask, jsonify, render_template, request
from metrics import MetricsCollector
from analyzer import SystemAnalyzer
import os
import subprocess
import platform

collector = MetricsCollector()
analyzer = SystemAnalyzer(collector)

def create_app():
    app = Flask(__name__, template_folder='templates', static_folder='static')

    # Start background metrics collection
    collector.start()

    @app.route('/')
    def index():
        return render_template('dashboard.html')

    @app.route('/metrics')
    def get_metrics():
        return jsonify(collector.get_current())

    @app.route('/processes')
    def get_processes():
        return jsonify(collector.get_processes())

    @app.route('/history')
    def get_history():
        return jsonify(collector.get_history())

    @app.route('/report')
    def get_report():
        report = analyzer.generate_report()
        return jsonify(report)

    @app.route('/actions/refresh', methods=['POST'])
    def action_refresh():
        collector.force_update()
        return jsonify({'status': 'ok', 'message': 'Metrics refreshed'})

    @app.route('/actions/clear_temp', methods=['POST'])
    def action_clear_temp():
        try:
            result = clear_temp_files()
            return jsonify({'status': 'ok', 'message': result})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)})

    @app.route('/actions/restart', methods=['POST'])
    def action_restart():
        try:
            system = platform.system()
            if system == 'Windows':
                subprocess.Popen(['shutdown', '/r', '/t', '5'])
            elif system in ('Linux', 'Darwin'):
                subprocess.Popen(['sudo', 'reboot'])
            return jsonify({'status': 'ok', 'message': 'Restart initiated in 5 seconds'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)})

    @app.route('/actions/shutdown', methods=['POST'])
    def action_shutdown():
        try:
            system = platform.system()
            if system == 'Windows':
                subprocess.Popen(['shutdown', '/s', '/t', '5'])
            elif system in ('Linux', 'Darwin'):
                subprocess.Popen(['sudo', 'shutdown', 'now'])
            return jsonify({'status': 'ok', 'message': 'Shutdown initiated in 5 seconds'})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)})

    return app


def clear_temp_files():
    system = platform.system()
    deleted = 0
    errors = 0
    if system == 'Windows':
        temp_dir = os.environ.get('TEMP', 'C:\\Windows\\Temp')
    else:
        temp_dir = '/tmp'

    for root, dirs, files in os.walk(temp_dir):
        for f in files:
            try:
                os.remove(os.path.join(root, f))
                deleted += 1
            except Exception:
                errors += 1
        break  # Only top-level

    return f'Cleared {deleted} temp files ({errors} skipped)'
