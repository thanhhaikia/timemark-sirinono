import { drawWatermark } from './watermark.js';
import { fileName, formatCoords, formatDate, formatTime, weekday } from './format.js';
import { load, save, TEMPLATES, POSITIONS, ACCENTS, SHOW_ITEMS } from './settings.js';
import { createLocation } from './location.js';
import { addPhoto, clearPhotos, deletePhoto, getPhoto, listPhotos } from './gallery.js';
import { isNative, saveToDevice, sharePhoto } from './native.js';

const $ = (id) => document.getElementById(id);
const settings = load();
let loc = { status: 'idle' };
let stream = null;
let track = null;
let busy = false;
let lastBlobUrl = null;

const video = $('video');
const overlay = $('overlay');

// ---------- toast ----------
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- overlays (sheets / screens) with Android back-button support ----------
const stack = [];
function openLayer(el) {
  if (stack.includes(el)) return;
  if (el.classList.contains('sheet')) {
    for (const s of stack.filter((x) => x.classList.contains('sheet'))) closeTop(s);
    $('backdrop').hidden = false;
  }
  el.hidden = false;
  stack.push(el);
  history.pushState({ layer: el.id }, '');
}
function hideLayer(el) {
  el.hidden = true;
  stack.splice(stack.indexOf(el), 1);
  if (!stack.some((x) => x.classList.contains('sheet'))) $('backdrop').hidden = true;
  if (el.id === 'viewerScreen') viewerClosed();
}
function closeTop(el) {
  if (stack[stack.length - 1] === el) history.back();
  else if (stack.includes(el)) hideLayer(el);
}
window.addEventListener('popstate', () => {
  const top = stack[stack.length - 1];
  if (top) hideLayer(top);
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-close]');
  if (btn) closeTop(btn.closest('.sheet, .screen'));
});
$('backdrop').addEventListener('click', () => {
  const top = stack[stack.length - 1];
  if (top) closeTop(top);
});

// ---------- capture data ----------
function captureData(date = new Date()) {
  return { date, lat: loc.lat, lon: loc.lon, alt: loc.alt, acc: loc.acc, address: loc.address, weather: loc.weather };
}

// ---------- camera ----------
async function startCamera() {
  stopCamera();
  $('camMsg').hidden = false;
  $('camMsgText').textContent = 'Đang mở camera…';
  $('btnRetryCam').hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) {
    camError('Trình duyệt này không hỗ trợ camera. Bạn vẫn có thể dùng "Nhập ảnh" để đóng dấu ảnh có sẵn.');
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: settings.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    camError(e.name === 'NotAllowedError'
      ? 'Ứng dụng chưa được cấp quyền camera. Hãy cho phép camera rồi bấm Thử lại.'
      : 'Không mở được camera (' + (e.message || e.name) + ').');
    return;
  }
  track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  video.classList.toggle('mirror', settings.facing === 'user' && settings.mirrorFront);
  try { await video.play(); } catch { /* autoplay will retry */ }
  $('camMsg').hidden = true;
  $('btnShutter').disabled = false;
  setupCapabilities();
  layoutOverlay();
}

function camError(msg) {
  $('camMsg').hidden = false;
  $('camMsgText').textContent = msg;
  $('btnRetryCam').hidden = false;
  $('btnShutter').disabled = true;
  $('btnTorch').hidden = true;
  $('zoomRow').hidden = true;
}

function stopCamera() {
  if (stream) for (const t of stream.getTracks()) t.stop();
  stream = null;
  track = null;
}

let torchOn = false;
function setupCapabilities() {
  const caps = track?.getCapabilities ? track.getCapabilities() : {};
  torchOn = false;
  $('btnTorch').hidden = !caps.torch;
  $('btnTorch').classList.remove('on');
  if (caps.zoom && caps.zoom.max > caps.zoom.min) {
    const z = $('zoom');
    z.min = caps.zoom.min;
    z.max = Math.min(caps.zoom.max, 10);
    z.step = caps.zoom.step || 0.1;
    z.value = track.getSettings().zoom || caps.zoom.min;
    $('zoomVal').textContent = `${(+z.value).toFixed(1)}×`;
    $('zoomRow').hidden = false;
  } else {
    $('zoomRow').hidden = true;
  }
}

$('btnTorch').addEventListener('click', async () => {
  if (!track) return;
  torchOn = !torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    $('btnTorch').classList.toggle('on', torchOn);
  } catch {
    torchOn = false;
    toast('Không bật được đèn flash');
  }
});
$('zoom').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('zoomVal').textContent = `${v.toFixed(1)}×`;
  track?.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {});
});
$('btnFlip').addEventListener('click', () => {
  settings.facing = settings.facing === 'user' ? 'environment' : 'user';
  save(settings);
  startCamera();
});
$('btnRetryCam').addEventListener('click', startCamera);
video.addEventListener('loadedmetadata', layoutOverlay);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if (!stream) startCamera();
});

// ---------- live preview overlay ----------
let view = { w: 0, h: 0 };
function layoutOverlay() {
  const stage = $('stage').getBoundingClientRect();
  const vw = video.videoWidth || 3;
  const vh = video.videoHeight || 4;
  const k = Math.min(stage.width / vw, stage.height / vh);
  const w = Math.round(vw * k);
  const h = Math.round(vh * k);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  overlay.style.width = `${w}px`;
  overlay.style.height = `${h}px`;
  overlay.style.left = `${(stage.width - w) / 2}px`;
  overlay.style.top = `${(stage.height - h) / 2}px`;
  overlay.width = Math.round(w * dpr);
  overlay.height = Math.round(h * dpr);
  view = { w: overlay.width, h: overlay.height };
  drawOverlay();
}
window.addEventListener('resize', layoutOverlay);

function drawOverlay() {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, view.w, view.h);
  if (!stream) return;
  if (settings.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo((view.w * i) / 3, 0); ctx.lineTo((view.w * i) / 3, view.h);
      ctx.moveTo(0, (view.h * i) / 3); ctx.lineTo(view.w, (view.h * i) / 3);
    }
    ctx.stroke();
  }
  const data = captureData();
  if (!data.address && loc.status !== 'ok') data.address = loc.status === 'error' ? loc.error : 'Đang lấy vị trí…';
  drawWatermark(ctx, view.w, view.h, data, settings);
}
setInterval(() => { if (!document.hidden) drawOverlay(); }, 1000);

// ---------- GPS ----------
const gps = createLocation((s) => {
  loc = s;
  renderGps();
  drawOverlay();
});

function renderGps() {
  const pill = $('gpsPill');
  pill.classList.toggle('ok', loc.status === 'ok');
  pill.classList.toggle('err', loc.status === 'error');
  let text = 'Đang lấy vị trí…';
  if (loc.status === 'ok') text = loc.address || `GPS ±${Math.round(loc.acc)} m`;
  else if (loc.status === 'error') text = loc.error;
  $('gpsText').textContent = text;
  const detail = loc.status === 'ok'
    ? [loc.address || 'Đang tìm địa chỉ (cần mạng)…', formatCoords(loc.lat, loc.lon, settings.coordFormat),
      `Độ chính xác ±${Math.round(loc.acc)} m`, loc.weather ? `${Math.round(loc.weather.temp)}°C ${loc.weather.text}` : ''].filter(Boolean).join('\n')
    : text;
  $('locDetail').innerText = detail;
}
$('gpsPill').addEventListener('click', () => { renderEdit(); openLayer($('sheetEdit')); });
$('btnRefreshLoc').addEventListener('click', () => { gps.refresh(); toast('Đang cập nhật vị trí…'); });

// ---------- shutter ----------
let audioCtx;
function click() {
  if (!settings.shutterSound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(audioCtx.sampleRate * 0.06);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start();
  } catch { /* no audio */ }
}

function countdown(sec) {
  return new Promise((resolve) => {
    const el = $('countdown');
    el.hidden = false;
    let n = sec;
    el.textContent = n;
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); el.hidden = true; resolve(); } else el.textContent = n;
    }, 1000);
  });
}

function toBlob(canvas, q) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', q));
}

async function makeThumb(canvas) {
  const k = 360 / Math.max(canvas.width, canvas.height);
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * k);
  c.height = Math.round(canvas.height * k);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return toBlob(c, 0.8);
}

/** Draws source (video or image) + watermark to a canvas and stores the result. */
async function finishPhoto(source, sw, sh, data, mirror) {
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (mirror) { ctx.translate(sw, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, 0, 0, sw, sh);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const { info } = drawWatermark(ctx, sw, sh, data, settings);
  const blob = await toBlob(canvas, settings.quality);
  const thumb = await makeThumb(canvas);
  const name = fileName(data.date);
  const meta = {
    time: `${formatTime(data.date, { h24: true, seconds: true })} ${weekday(data.date)} ${formatDate(data.date, settings.dateFormat)}`,
    address: info.address || '', coords: formatCoords(data.lat, data.lon, settings.coordFormat), code: info.code || '',
    project: info.project || '', note: info.note || '', width: sw, height: sh,
  };
  await addPhoto({ blob, thumb, name, created: Date.now(), meta });
  setLastThumb(thumb);
  if (settings.autoSave) {
    try { toast(await saveToDevice(blob, name)); } catch (e) { toast(e.message); }
  } else {
    toast('Đã lưu vào thư viện của ứng dụng');
  }
}

async function shoot() {
  if (busy || !stream || !video.videoWidth) return;
  busy = true;
  $('btnShutter').disabled = true;
  try {
    if (settings.timer) await countdown(settings.timer);
    const data = captureData(new Date());
    click();
    navigator.vibrate?.(30);
    const fx = $('flashFx');
    fx.classList.remove('go'); void fx.offsetWidth; fx.classList.add('go');
    await finishPhoto(video, video.videoWidth, video.videoHeight, data, settings.facing === 'user' && settings.mirrorFront);
  } catch (e) {
    toast('Lỗi khi chụp: ' + (e.message || e));
  } finally {
    busy = false;
    $('btnShutter').disabled = !stream;
  }
}
$('btnShutter').addEventListener('click', shoot);
document.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter' || e.key === 'AudioVolumeUp') && !stack.length && document.activeElement === document.body) {
    e.preventDefault();
    shoot();
  }
});

// ---------- top bar toggles ----------
function renderTopbar() {
  $('btnGrid').classList.toggle('on', settings.grid);
  $('timerBadge').hidden = !settings.timer;
  $('timerBadge').textContent = `${settings.timer}s`;
  $('btnTimer').classList.toggle('on', !!settings.timer);
}
$('btnGrid').addEventListener('click', () => { settings.grid = !settings.grid; save(settings); renderTopbar(); drawOverlay(); });
$('btnTimer').addEventListener('click', () => {
  settings.timer = { 0: 3, 3: 10, 10: 0 }[settings.timer] ?? 0;
  save(settings);
  renderTopbar();
  toast(settings.timer ? `Hẹn giờ ${settings.timer} giây` : 'Tắt hẹn giờ', 1200);
});

// ---------- templates sheet ----------
function sampleBackground(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#5b7fa6');
  g.addColorStop(0.55, '#8aa37b');
  g.addColorStop(1, '#4a5a3c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
function renderTemplates() {
  const list = $('tplList');
  list.textContent = '';
  const sample = captureData();
  if (!sample.address) sample.address = 'Đường Lê Lợi, Bến Nghé, Quận 1, TP. Hồ Chí Minh';
  if (!Number.isFinite(sample.lat)) Object.assign(sample, { lat: 10.776889, lon: 106.700806 });
  for (const t of TEMPLATES) {
    const b = document.createElement('button');
    b.className = 'tpl' + (settings.template === t.id ? ' on' : '');
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const ctx = c.getContext('2d');
    sampleBackground(ctx, 400, 300);
    drawWatermark(ctx, 400, 300, sample, { ...settings, template: t.id });
    b.append(c, Object.assign(document.createElement('b'), { textContent: t.name }), Object.assign(document.createElement('small'), { textContent: t.desc }));
    b.addEventListener('click', () => { settings.template = t.id; save(settings); renderTemplates(); drawOverlay(); });
    list.append(b);
  }
  const seg = $('posSeg');
  seg.textContent = '';
  for (const p of POSITIONS) {
    const b = Object.assign(document.createElement('button'), { textContent: p.name, className: settings.position === p.id ? 'on' : '' });
    b.addEventListener('click', () => { settings.position = p.id; save(settings); renderTemplates(); drawOverlay(); });
    seg.append(b);
  }
  $('sizeRange').value = settings.size;
  $('sizeVal').textContent = `${Math.round(settings.size * 100)}%`;
  const sw = $('swatches');
  sw.textContent = '';
  for (const a of ACCENTS) {
    const b = document.createElement('button');
    b.style.background = a;
    b.className = settings.accent === a ? 'on' : '';
    b.setAttribute('aria-label', a);
    b.addEventListener('click', () => { settings.accent = a; save(settings); renderTemplates(); drawOverlay(); });
    sw.append(b);
  }
}
$('sizeRange').addEventListener('input', (e) => {
  settings.size = +e.target.value;
  $('sizeVal').textContent = `${Math.round(settings.size * 100)}%`;
  drawOverlay();
});
$('sizeRange').addEventListener('change', () => { save(settings); renderTemplates(); });
$('btnTemplates').addEventListener('click', () => { renderTemplates(); openLayer($('sheetTemplates')); });

// ---------- edit sheet ----------
const TEXT_FIELDS = ['project', 'author', 'note', 'brand', 'customAddressText'];
function renderEdit() {
  for (const k of TEXT_FIELDS) $(k).value = settings[k];
  $('customAddress').checked = settings.customAddress;
  $('customAddressText').hidden = !settings.customAddress;
  const box = $('showToggles');
  box.textContent = '';
  for (const [k, label] of SHOW_ITEMS) {
    const l = document.createElement('label');
    const c = Object.assign(document.createElement('input'), { type: 'checkbox', checked: settings.show[k] !== false });
    c.addEventListener('change', () => { settings.show[k] = c.checked; save(settings); drawOverlay(); });
    l.append(c, document.createTextNode(label));
    box.append(l);
  }
  renderGps();
}
for (const k of TEXT_FIELDS) {
  $(k).addEventListener('input', (e) => { settings[k] = e.target.value; save(settings); drawOverlay(); });
}
$('customAddress').addEventListener('change', (e) => {
  settings.customAddress = e.target.checked;
  $('customAddressText').hidden = !settings.customAddress;
  save(settings);
  drawOverlay();
});
$('btnEdit').addEventListener('click', () => { renderEdit(); openLayer($('sheetEdit')); });

// ---------- settings sheet ----------
const BOOL_SETTINGS = ['h24', 'seconds', 'autoSave', 'shutterSound', 'mirrorFront'];
function renderSettings() {
  for (const k of BOOL_SETTINGS) $(k).checked = settings[k];
  $('dateFormat').value = settings.dateFormat;
  $('coordFormat').value = settings.coordFormat;
  $('quality').value = String(settings.quality);
  $('autoSaveLabel').textContent = isNative ? 'Tự động lưu ảnh vào Thư viện ảnh' : 'Tự động tải ảnh về máy';
}
for (const k of BOOL_SETTINGS) {
  $(k).addEventListener('change', (e) => {
    settings[k] = e.target.checked;
    save(settings);
    if (k === 'mirrorFront') video.classList.toggle('mirror', settings.facing === 'user' && settings.mirrorFront);
    drawOverlay();
  });
}
for (const k of ['dateFormat', 'coordFormat']) {
  $(k).addEventListener('change', (e) => { settings[k] = e.target.value; save(settings); drawOverlay(); renderGps(); });
}
$('quality').addEventListener('change', (e) => { settings.quality = +e.target.value; save(settings); });
$('btnSettings').addEventListener('click', () => { renderSettings(); openLayer($('sheetSettings')); });
$('btnClearAll').addEventListener('click', async () => {
  if (!confirm('Xóa toàn bộ ảnh trong ứng dụng? Ảnh đã lưu vào Thư viện ảnh của máy vẫn được giữ.')) return;
  await clearPhotos();
  setLastThumb(null);
  toast('Đã xóa ảnh trong ứng dụng');
});

// ---------- import an existing photo ----------
let importFile = null;
$('btnImport').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => {
  importFile = e.target.files[0];
  e.target.value = '';
  if (!importFile) return;
  const d = new Date(importFile.lastModified || Date.now());
  $('importInfo').textContent = `Tệp: ${importFile.name}. Thời gian của tệp: ${formatTime(d, { h24: settings.h24 })} ${formatDate(d, settings.dateFormat)}.`;
  openLayer($('sheetImport'));
});
async function importWith(useFileTime) {
  const file = importFile;
  closeTop($('sheetImport'));
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const max = 4096;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const date = useFileTime ? new Date(file.lastModified || Date.now()) : new Date();
    await finishPhoto(img, Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k), captureData(date), false);
  } catch {
    toast('Không đọc được ảnh này');
  } finally {
    URL.revokeObjectURL(url);
  }
}
$('btnImportNow').addEventListener('click', () => importWith(false));
$('btnImportFile').addEventListener('click', () => importWith(true));

// ---------- gallery ----------
const thumbUrls = [];
function setLastThumb(blob) {
  const img = $('lastThumb');
  if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
  lastBlobUrl = blob ? URL.createObjectURL(blob) : null;
  if (lastBlobUrl) img.src = lastBlobUrl; else img.removeAttribute('src');
}
async function renderGallery() {
  for (const u of thumbUrls.splice(0)) URL.revokeObjectURL(u);
  const photos = await listPhotos();
  const grid = $('galleryGrid');
  grid.textContent = '';
  $('galleryEmpty').hidden = photos.length > 0;
  $('galleryCount').textContent = photos.length ? `(${photos.length})` : '';
  for (const p of photos) {
    const u = URL.createObjectURL(p.thumb || p.blob);
    thumbUrls.push(u);
    const b = document.createElement('button');
    b.append(Object.assign(document.createElement('img'), { src: u, alt: p.name, loading: 'lazy' }));
    b.addEventListener('click', () => openViewer(p.id));
    grid.append(b);
  }
}
$('btnGallery').addEventListener('click', async () => { await renderGallery(); openLayer($('galleryScreen')); });

let current = null;
let viewerUrl = null;
async function openViewer(id) {
  current = await getPhoto(id);
  if (!current) return;
  viewerUrl = URL.createObjectURL(current.blob);
  $('viewerImg').src = viewerUrl;
  $('viewerTitle').textContent = current.name;
  const m = current.meta || {};
  $('viewerMeta').innerText = [m.time, m.address, m.coords, m.project && `Dự án: ${m.project}`, m.code && `Mã ảnh: ${m.code}`, m.width && `${m.width}×${m.height}`]
    .filter(Boolean).join('\n');
  openLayer($('viewerScreen'));
}
function viewerClosed() {
  if (viewerUrl) URL.revokeObjectURL(viewerUrl);
  viewerUrl = null;
  $('viewerImg').removeAttribute('src');
  current = null;
}
$('btnViewerSave').addEventListener('click', async () => {
  if (!current) return;
  try { toast(await saveToDevice(current.blob, current.name)); } catch (e) { toast(e.message); }
});
$('btnViewerShare').addEventListener('click', async () => {
  if (!current) return;
  try { await sharePhoto(current.blob, current.name); } catch (e) { toast(e.message || 'Không chia sẻ được'); }
});
$('btnViewerDelete').addEventListener('click', async () => {
  if (!current || !confirm('Xóa ảnh này khỏi ứng dụng?')) return;
  await deletePhoto(current.id);
  closeTop($('viewerScreen'));
  await renderGallery();
  const [latest] = await listPhotos();
  setLastThumb(latest ? latest.thumb || latest.blob : null);
  toast('Đã xóa ảnh');
});

// ---------- boot ----------
async function boot() {
  renderTopbar();
  renderGps();
  gps.start();
  startCamera();
  try {
    const [latest] = await listPhotos();
    if (latest) setLastThumb(latest.thumb || latest.blob);
  } catch { /* IndexedDB unavailable */ }
  if ('serviceWorker' in navigator && !isNative && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
document.addEventListener('native-shutter', () => { if (!stack.length) shoot(); });
