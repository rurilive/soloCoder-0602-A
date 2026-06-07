import os

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 1111))
PUSH_INTERVAL = float(os.getenv("PUSH_INTERVAL", 1.0))
ALERT_LOG_FILE = os.path.join(os.path.dirname(__file__), "alerts.log")
