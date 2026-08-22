from pathlib import Path

target_file = Path("/Users/nagaraju/Documents/BKNR_ERP/backend/app/templates/login.html")

text = target_file.read_text(encoding="utf-8")

old_block = """      const moduleLabels = [
        { code: 'M1', title: 'Gate Entry', icon: '🚪' },
        { code: 'M2', title: 'RM Purchase', icon: '📦' },
        { code: 'M3', title: 'De-Heading', icon: '✂️' },
        { code: 'M4', title: 'Grading', icon: '📊' },
        { code: 'M5', title: 'Peeling', icon: '🧼' },
        { code: 'M6', title: 'Cold Store', icon: '❄️' }
      ];"""

new_block = """      const moduleLabels = [
        { code: 'M1', title: 'Gate Entry', icon: '🚪' },
        { code: 'M2', title: 'RM Purchase', icon: '📦' },
        { code: 'M3', title: 'De-Heading', icon: '✂️' },
        { code: 'M4', title: 'Grading', icon: '📊' },
        { code: 'M5', title: 'Peeling', icon: '🧼' },
        { code: 'M6', title: 'Cold Store', icon: '❄️' },
        { code: 'M7', title: 'HRMS & Payroll', icon: '👥' },
        { code: 'M8', title: 'Commercial Sales', icon: '📈' },
        { code: 'M9', title: 'Pending Orders', icon: '📑' },
        { code: 'M10', title: 'CRM Quotations', icon: '📝' },
        { code: 'M11', title: 'Finance & Accounts', icon: '💰' },
        { code: 'M12', title: 'Export Docs', icon: '🚢' }
      ];"""

text = text.replace(old_block, new_block)

text = text.replace("for (let i = 1; i <= 6; i++) {", "for (let i = 1; i <= 12; i++) {")
text = text.replace("for (let i = 0; i < 6; i++) {", "for (let i = 0; i < 12; i++) {")
text = text.replace("const a = (i * 60) * Math.PI / 180 + t * W;", "const a = (i * 30) * Math.PI / 180 + t * W;")

target_file.write_text(text, encoding="utf-8")
print(f"REPLACED EXACT BLOCK! Lines: {len(text.splitlines())}, Bytes: {len(text)}")
