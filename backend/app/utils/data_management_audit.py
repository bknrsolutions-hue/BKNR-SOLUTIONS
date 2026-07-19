import json
import threading
from pathlib import Path

from app.utils.timezone import ist_now


DATA_MANAGEMENT_HISTORY_FILE = Path(__file__).resolve().parents[2] / "data_management_history.json"
_HISTORY_LOCK = threading.Lock()


def log_data_management_action(company_code, action_type, module_name, status, message):
    entry = {
        "company_code": str(company_code or ""),
        "type": action_type,
        "module": module_name,
        "date": ist_now().strftime("%Y-%m-%d %H:%M:%S"),
        "status": status,
        "details": message,
    }
    with _HISTORY_LOCK:
        logs = []
        if DATA_MANAGEMENT_HISTORY_FILE.exists():
            try:
                logs = json.loads(DATA_MANAGEMENT_HISTORY_FILE.read_text())
            except (OSError, json.JSONDecodeError):
                logs = []
        logs.append(entry)
        DATA_MANAGEMENT_HISTORY_FILE.write_text(json.dumps(logs, indent=4))
