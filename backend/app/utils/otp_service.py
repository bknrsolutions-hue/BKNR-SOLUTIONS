import time

# TEMP MEMORY STORAGE  (in real-time DB table recommended)
otp_storage = {}


# STORE OTP WITH EXTRA DATA
def store_otp(key, otp, extra=None):
    otp_storage[key] = {
        "otp": otp,
        "timestamp": time.time(),
        "extra": extra
    }


# VERIFY OTP
def verify_stored_otp(key, otp=None):
    data = otp_storage.get(key)

    if not data:
        return None

    # Expire after 5 minutes
    if time.time() - data["timestamp"] > 300:
        otp_storage.pop(key, None)
        return None

    # If OTP provided → compare
    if otp:
        if str(data["otp"]) == str(otp):
            return data
        return None

    # If no OTP → return stored data (used during set-password)
    return data
