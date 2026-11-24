// Saving and sharing photos: through the Android bridge inside the APK, or browser APIs on the web.

const bridge = window.TimemarkNative;
export const isNative = !!bridge;

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Resolves to a short Vietnamese status message; throws with a readable message on failure. */
export async function saveToDevice(blob, name) {
  if (isNative) {
    const res = bridge.savePhoto(await toBase64(blob), name);
    if (res !== 'ok') throw new Error(res || 'Không lưu được ảnh');
    return 'Đã lưu vào Thư viện ảnh (Pictures/Timemark_Sirinono)';
  }
  download(blob, name);
  return 'Đã tải ảnh về máy';
}

export async function sharePhoto(blob, name) {
  if (isNative) {
    const res = bridge.sharePhoto(await toBase64(blob), name);
    if (res !== 'ok') throw new Error(res || 'Không chia sẻ được ảnh');
    return;
  }
  const file = new File([blob], name, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
    return;
  }
  download(blob, name);
}
