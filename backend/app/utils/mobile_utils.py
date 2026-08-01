"""Shared mobile-client detection helper.

Extracted here to avoid a circular import between app.main and app.routers.auth.
Both modules import this utility instead of importing from each other.
"""

from fastapi import Request


def is_mobile_client(request: Request) -> bool:
    """
    Returns True if the request originates from the Mobile Native App or
    Mobile WebView wrapper. Mobile sessions bypass the 30-minute idle logout.
    """
    if request.session.get("is_mobile_app") is True or request.session.get("is_mobile") is True:
        return True

    headers = request.headers
    if headers.get("x-mobile-app", "").lower() in ("true", "1", "yes"):
        request.session["is_mobile_app"] = True
        return True
    if headers.get("x-client-platform", "").lower() in ("mobile", "android", "ios", "react-native", "expo"):
        request.session["is_mobile_app"] = True
        return True

    qp = request.query_params
    if qp.get("is_mobile_app") == "true" or qp.get("mobile") == "true" or qp.get("x-mobile-app") == "true":
        request.session["is_mobile_app"] = True
        return True

    ua = headers.get("user-agent", "").lower()
    if any(token in ua for token in ["bknr", "expo", "okhttp", "reactnative", "cordova", "capacitor", "wv", "mobile_native"]):
        request.session["is_mobile_app"] = True
        return True

    return False
