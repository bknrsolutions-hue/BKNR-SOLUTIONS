from fastapi import FastAPI
from fastapi.responses import HTMLResponse

# =============================================
# INIT FASTAPI
# =============================================
app = FastAPI(title="BKNR ERP")

# =============================================
# ROOT ENDPOINT
# =============================================
@app.get("/", response_class=HTMLResponse)
def root():
    return "<h2>BKNR ERP is LIVE</h2>"

# =============================================
# HEALTH CHECK (RENDER SAFE)
# =============================================
@app.get("/health")
def health():
    return {
        "status": "OK",
        "service": "BKNR ERP",
        "environment": "RENDER"
    }
