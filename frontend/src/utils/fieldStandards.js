const WORD_SEPARATORS = /([\s,./#()-]+)/;

export function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(WORD_SEPARATORS)
    .map(part => (WORD_SEPARATORS.test(part) || !part ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join('');
}

export function normalizeFieldValue(fieldKey, value) {
  const key = String(fieldKey || '').toLowerCase();
  const text = String(value ?? '');

  if (key.includes('mobile') || key === 'phone' || key.includes('phone')) {
    return text.replace(/\D/g, '').slice(0, 10);
  }

  if (key.includes('account_no') || key.includes('account_number')) {
    return text.replace(/\D/g, '').slice(0, 18);
  }

  if (key.includes('ifsc')) {
    return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
  }

  if (key.includes('swift')) {
    return text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
  }

  if (key.includes('gst')) {
    return text.toUpperCase().replace(/\s/g, '').slice(0, 15);
  }

  if (
    key.includes('address') ||
    key.includes('bank_name') ||
    key === 'branch' ||
    key.includes('name') ||
    key.includes('department')
  ) {
    return toTitleCase(text);
  }

  return value;
}

export function normalizeRecordFields(record) {
  return Object.fromEntries(
    Object.entries(record || {}).map(([key, value]) => [key, normalizeFieldValue(key, value)])
  );
}

export function standardInputProps(fieldKey) {
  const key = String(fieldKey || '').toLowerCase();

  if (key.includes('mobile') || key === 'phone' || key.includes('phone')) {
    return { inputMode: 'numeric', maxLength: 10, pattern: '[0-9]{10}', title: 'Enter 10 digit mobile number' };
  }

  if (key.includes('account_no') || key.includes('account_number')) {
    return { inputMode: 'numeric', maxLength: 18, pattern: '[0-9]{9,18}', title: 'Enter 9 to 18 digit bank account number' };
  }

  if (key.includes('ifsc')) {
    return { maxLength: 11, pattern: '[A-Z]{4}0[A-Z0-9]{6}', title: 'Enter valid IFSC, example SBIN0001234' };
  }

  return {};
}
