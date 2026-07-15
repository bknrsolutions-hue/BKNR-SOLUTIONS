import logging
import os


logger = logging.getLogger("BKNR_ERP.security")


def log_development_secret(label: str, secret: str) -> bool:
    """Log a test secret only when an explicit non-production override is set."""
    environment = os.getenv("ENVIRONMENT", "development").strip().lower()
    allowed = os.getenv("ALLOW_INSECURE_OTP_LOGGING", "").strip().lower() in {
        "1", "true", "yes", "on"
    }
    if environment == "production" or not allowed:
        return False
    logger.warning("INSECURE DEVELOPMENT SECRET - %s: %s", label, secret)
    return True
