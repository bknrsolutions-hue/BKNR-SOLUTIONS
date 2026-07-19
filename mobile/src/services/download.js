import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API_URL } from '../config';

const blobToBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = reject;
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.readAsDataURL(blob);
});

export async function downloadAndShare(path, filename, mimeType) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'X-Mobile-App': 'true' } });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const base64 = await blobToBase64(await response.blob());
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType, dialogTitle: filename });
}
