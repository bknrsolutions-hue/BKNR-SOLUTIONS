from pathlib import Path
import re
import subprocess

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")
text = target_file.read_text(encoding="utf-8")

# Extract script blocks
scripts = re.findall(r'<script.*?>([\s\S]*?)</script>', text, re.IGNORECASE)

print(f"Found {len(scripts)} script tags in login.html.")

for idx, script_content in enumerate(scripts):
    # Quick check for syntax error via node if available
    try:
        res = subprocess.run(["node", "--check", "-e", script_content], capture_output=True, text=True)
        if res.returncode == 0:
            print(f"Script tag {idx+1}: VALID JS Syntax! (No errors)")
        else:
            print(f"Script tag {idx+1}: SYNTAX ERROR!\n{res.stderr}")
    except Exception as err:
        print(f"Could not run node check: {err}")

print(f"Total lines in login.html: {len(text.splitlines())}")
