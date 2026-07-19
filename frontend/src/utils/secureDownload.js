/**
 * secureDownload.js – Utility for downloading files securely with session credentials.
 */
export async function secureDownload(url, filename) {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('bknr:session-expired'));
      }
      throw new Error(`Download failed with status ${res.status}`);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download error:', err);
    alert('Failed to download file. Please check connection and try again.');
  }
}
