import threading
import time
import webview
from app import create_app

def start_flask(app):
    app.run(host='127.0.0.1', port=5050, debug=False, use_reloader=False)

if __name__ == '__main__':
    app = create_app()

    flask_thread = threading.Thread(target=start_flask, args=(app,), daemon=True)
    flask_thread.start()

    # Give Flask a moment to start
    time.sleep(1)

    webview.create_window(
        'System Monitor',
        'http://127.0.0.1:5050',
        width=1280,
        height=800,
        resizable=True,
        min_size=(900, 600)
    )
    webview.start()
