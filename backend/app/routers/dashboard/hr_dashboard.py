from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db

# ikkada prefix empty ga unchali, dashboard_router logic prakaram
router = APIRouter(prefix="", tags=["HR Dashboard"])

@router.get("/hr_dashboard", response_class=HTMLResponse)
def hr_dashboard(request: Request, db: Session = Depends(get_db)):
    # 1. Session Check
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # 2. Coming Soon Template (Corporate Style)
    coming_soon_html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>HR Dashboard - Coming Soon</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
            body {{ 
                margin: 0; font-family: 'Inter', 'Segoe UI', sans-serif; 
                background: #f8fafc; color: #1e293b;
                display: flex; justify-content: center; align-items: center; 
                height: 100vh; 
            }}
            .card {{
                text-align: center; background: white; padding: 50px; 
                border-radius: 20px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
                max-width: 500px; border: 1px solid #e2e8f0;
            }}
            .icon {{ font-size: 60px; color: #3b82f6; margin-bottom: 20px; }}
            h1 {{ font-size: 28px; margin: 0 0 10px 0; color: #0f172a; }}
            p {{ color: #64748b; font-size: 16px; line-height: 1.6; }}
            .badge {{
                display: inline-block; padding: 6px 12px; background: #dbeafe; 
                color: #1e40af; border-radius: 99px; font-size: 12px; 
                font-weight: 700; margin-bottom: 20px; text-transform: uppercase;
            }}
            .btn {{
                margin-top: 30px; display: inline-block; padding: 12px 24px; 
                background: #1e293b; color: white; text-decoration: none; 
                border-radius: 10px; font-weight: 600; transition: 0.3s;
            }}
            .btn:hover {{ background: #000; transform: translateY(-2px); }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="icon"><i class="fa-solid fa-people-group"></i></div>
            <div class="badge">Module Under Construction</div>
            <h1>HR & Attendance</h1>
            <p>We are currently building the employee management, attendance tracking, and payroll modules for <strong>BKNR ERP</strong>.</p>
            <a href="/dashboard/processing_dashboard" class="btn">
                <i class="fa-solid fa-arrow-left"></i> Back to Processing
            </a>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=coming_soon_html)