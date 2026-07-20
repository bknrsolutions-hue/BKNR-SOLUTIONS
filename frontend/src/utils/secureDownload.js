export async function requestAdminDownloadToken(label) {
  if (!window.confirm(`Admin OTP verification is required to download ${label}. Send OTP?`)) return null;

  const generateResponse = await fetch('/data-management/generate-otp', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download', module: label }),
  });
  const generated = await generateResponse.json();
  if (!generateResponse.ok || !generated.success) {
    throw new Error(generated.error || 'Unable to send Admin OTP');
  }

  const otp = window.prompt(`${generated.message}\nEnter the 6-digit Admin OTP:`);
  if (!otp) return null;
  const verifyResponse = await fetch('/data-management/verify-otp', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download', otp: otp.trim() }),
  });
  const verified = await verifyResponse.json();
  if (!verifyResponse.ok || !verified.success || !verified.download_token) {
    throw new Error(verified.error || 'Invalid Admin OTP');
  }
  return verified.download_token;
}

export async function secureDownload(url, label, method = 'GET') {
  try {
    const token = await requestAdminDownloadToken(label);
    if (!token) return false;
    const response = await fetch(url, {
      method,
      credentials: 'include',
      headers: { 'X-SVBK-Download-Token': token, Accept: 'application/json' },
    });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.detail || failure.error || `Unable to download ${label}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
    anchor.href = objectUrl;
    anchor.download = match?.[1] || `${label.replace(/[^a-z0-9]+/gi, '_')}.xlsx`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    }, 1500);
    return true;
  } catch (error) {
    window.alert(error.message || 'Download failed');
    return false;
  }
}
