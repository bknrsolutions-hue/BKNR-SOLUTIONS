from typing import Any
from fastapi import HTTPException

def check_report_permission(request: Any, permission_type: str) -> bool:
    """
    Checks if the user has permission to perform a specific report action.
    permission_type can be one of: 'report_edit', 'report_delete', 'report_print', 'report_export'
    For admin, this returns True.
    For users, it checks if the permission is listed in request.session.get("permissions", "")
    """
    role = request.session.get("role") if hasattr(request, "session") else None
    email = request.session.get("email") if hasattr(request, "session") else None
    
    # Admin bypass
    if role == "admin" or str(email or "").strip().lower() == "bknr.solutions@gmail.com":
        return True
        
    permissions_str = request.session.get("permissions", "") if hasattr(request, "session") else ""
    allowed_permissions = [p.strip() for p in permissions_str.split(",") if p.strip()]
    
    return permission_type in allowed_permissions

def enforce_report_permission(request: Any, permission_type: str):
    if not check_report_permission(request, permission_type):
        action_name = permission_type.replace("report_", "").upper()
        raise HTTPException(
            status_code=403, 
            detail=f"Access Denied: You do not have permission to {action_name} reports."
        )
