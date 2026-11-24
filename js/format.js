// Pure formatting helpers shared by the app, the watermark renderer and the tests.

export const WEEKDAYS_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function formatTime(date, { h24 = true, seconds = false } = {}) {
  let h = date.getHours();
  let suffix = '';
  if (!h24) {
    suffix = h < 12 ? ' SA' : ' CH';
    h = h % 12 || 12;
  }
  return `${pad(h)}:${pad(date.getMinutes())}${seconds ? ':' + pad(date.getSeconds()) : ''}${suffix}`;
}

export function formatDate(date, fmt = 'dd/MM/yyyy') {
  const parts = { dd: pad(date.getDate()), MM: pad(date.getMonth() + 1), yyyy: String(date.getFullYear()) };
  return fmt.replace(/dd|MM|yyyy/g, (k) => parts[k]);
}

export function weekday(date) {
  return WEEKDAYS_VI[date.getDay()];
}

function dms(value, pos, neg) {
  const abs = Math.abs(value);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = (mFloat - m) * 60;
  return `${d}°${pad(m)}'${s.toFixed(1).padStart(4, '0')}"${value >= 0 ? pos : neg}`;
}

export function formatCoords(lat, lon, fmt = 'dec') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  if (fmt === 'dms') return `${dms(lat, 'N', 'S')} ${dms(lon, 'E', 'W')}`;
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

// Crockford base32 without I, L, O, U so codes are easy to read aloud.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function fnv1a(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Short code printed on each photo: the same time + place always gives the same code. */
export function photoCode(date, lat, lon) {
  const key = `${date.getTime()}|${Number.isFinite(lat) ? lat.toFixed(5) : '-'}|${Number.isFinite(lon) ? lon.toFixed(5) : '-'}`;
  const a = fnv1a(key, 0x811c9dc5);
  const b = fnv1a(key, a ^ 0x5bd1e995);
  let out = '';
  for (let i = 0; i < 4; i++) out += B32[(a >>> (i * 5)) & 31];
  for (let i = 0; i < 4; i++) out += B32[(b >>> (i * 5)) & 31];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function fileName(date) {
  return `Timemark_Sirinono_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.jpg`;
}

// WMO weather interpretation codes used by Open-Meteo.
export function weatherText(code) {
  if (code === 0) return 'Trời quang';
  if (code <= 2) return 'Ít mây';
  if (code === 3) return 'Nhiều mây';
  if (code <= 48) return 'Sương mù';
  if (code <= 57) return 'Mưa phùn';
  if (code <= 67) return 'Mưa';
  if (code <= 77) return 'Tuyết';
  if (code <= 82) return 'Mưa rào';
  if (code <= 86) return 'Mưa tuyết';
  if (code <= 99) return 'Dông';
  return '';
}

/** Short address from a Nominatim reverse-geocoding result. */
export function shortAddress(result) {
  if (!result) return '';
  const a = result.address || {};
  const street = [a.house_number, a.road || a.pedestrian || a.footway].filter(Boolean).join(' ');
  const parts = [
    street,
    a.quarter || a.neighbourhood || a.hamlet,
    a.suburb || a.village || a.town,
    a.city_district || a.county,
    a.city || a.state,
  ].filter(Boolean);
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ') : (result.display_name || '');
}

/**
 * The text items a watermark shows, from the capture data and the user's settings.
 * Hidden or unavailable items are null so templates can skip them.
 */
export function buildInfo(data, s) {
  const d = data.date;
  const has = (k) => s.show[k] !== false;
  const coords = formatCoords(data.lat, data.lon, s.coordFormat);
  const address = s.customAddress ? s.customAddressText.trim() : (data.address || '');
  return {
    time: formatTime(d, { h24: s.h24, seconds: s.seconds }),
    date: has('date') ? formatDate(d, s.dateFormat) : null,
    weekday: has('weekday') ? weekday(d) : null,
    address: has('address') && address ? address : null,
    coords: has('coords') && coords ? coords : null,
    altitude: has('altitude') && Number.isFinite(data.alt) ? `${Math.round(data.alt)} m` : null,
    accuracy: has('accuracy') && Number.isFinite(data.acc) ? `±${Math.round(data.acc)} m` : null,
    weather: has('weather') && data.weather ? `${Math.round(data.weather.temp)}°C ${data.weather.text}`.trim() : null,
    project: has('project') && s.project.trim() ? s.project.trim() : null,
    author: has('author') && s.author.trim() ? s.author.trim() : null,
    note: has('note') && s.note.trim() ? s.note.trim() : null,
    code: has('code') ? photoCode(d, data.lat, data.lon) : null,
    brand: has('brand') ? (s.brand.trim() || 'Timemark_Sirinono') : null,
  };
}
