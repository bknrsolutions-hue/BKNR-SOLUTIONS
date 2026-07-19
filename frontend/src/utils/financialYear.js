export function financialYearStart(value) {
  const match = String(value ?? '').match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function formatFinancialYear(value) {
  const start = financialYearStart(value);
  return start ? `FY ${start}-${start + 1}` : String(value ?? '');
}

export function currentFinancialYearStart(today = new Date()) {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}
