from datetime import datetime
from zoneinfo import ZoneInfo

def ist_now():
    return datetime.now(ZoneInfo("Asia/Kolkata"))