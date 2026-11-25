// GPS position, reverse-geocoded address (OpenStreetMap Nominatim) and current weather (Open-Meteo).
// Both online services are free and keyless; without network the watermark falls back to coordinates.

import { shortAddress, weatherText } from './format.js';

const ADDRESS_CACHE = 'timemark_sirinono_addr_v1';
const GEOCODE_MIN_MOVE_M = 40;
const GEOCODE_MIN_INTERVAL_MS = 8000;
const WEATHER_TTL_MS = 15 * 60 * 1000;
const ADDRESS_STALE_M = 150;

export function distanceM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function cacheKey(lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(ADDRESS_CACHE)) || {}; } catch { return {}; }
}

function writeCache(key, value) {
  const c = readCache();
  c[key] = value;
  const keys = Object.keys(c);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete c[k];
  try { localStorage.setItem(ADDRESS_CACHE, JSON.stringify(c)); } catch { /* ignore */ }
}

export function createLocation(onChange) {
  const state = { status: 'idle', lat: NaN, lon: NaN, alt: NaN, acc: NaN, address: '', weather: null, error: '' };
  let watchId = null;
  let lastGeo = null;
  let lastGeoAt = 0;
  let geocoding = false;
  let weatherAt = 0;
  let weatherPos = null;
  let addressPos = null;
  let weatherTimer = null;
  let highAccuracy = true;

  const emit = () => onChange({ ...state });

  async function geocode(force = false) {
    if (!Number.isFinite(state.lat) || geocoding) return;
    const here = { lat: state.lat, lon: state.lon };
    if (!force && lastGeo && distanceM(lastGeo, here) < GEOCODE_MIN_MOVE_M) return;
    if (!force && Date.now() - lastGeoAt < GEOCODE_MIN_INTERVAL_MS) return;
    const key = cacheKey(here.lat, here.lon);
    const cached = readCache()[key];
    lastGeo = here;
    lastGeoAt = Date.now();
    if (cached && !force) { state.address = cached; addressPos = here; emit(); return; }
    geocoding = true;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=vi&lat=${here.lat}&lon=${here.lon}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const addr = shortAddress(await res.json());
        if (addr) { state.address = addr; addressPos = here; writeCache(key, addr); emit(); }
      }
    } catch { /* offline: keep the previous address */ }
    geocoding = false;
  }

  async function weather(force = false) {
    if (!Number.isFinite(state.lat)) return;
    const here = { lat: state.lat, lon: state.lon };
    const moved = !weatherPos || distanceM(weatherPos, here) > 3000;
    if (!force && !moved && Date.now() - weatherAt < WEATHER_TTL_MS) return;
    weatherAt = Date.now();
    weatherPos = here;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${here.lat.toFixed(4)}&longitude=${here.lon.toFixed(4)}&current=temperature_2m,weather_code`;
      const res = await fetch(url);
      if (!res.ok) return;
      const cur = (await res.json()).current;
      if (cur && Number.isFinite(cur.temperature_2m)) {
        state.weather = { temp: cur.temperature_2m, text: weatherText(cur.weather_code) };
        emit();
      }
    } catch { /* offline */ }
  }

  function onPos(p) {
    const c = p.coords;
    state.status = 'ok';
    state.error = '';
    state.lat = c.latitude;
    state.lon = c.longitude;
    state.alt = c.altitude ?? NaN;
    state.acc = c.accuracy ?? NaN;
    if (addressPos && distanceM(addressPos, { lat: state.lat, lon: state.lon }) > ADDRESS_STALE_M) {
      state.address = '';
      addressPos = null;
      lastGeo = null;
    }
    emit();
    geocode();
    weather();
  }

  function onErr(e) {
    if (e.code !== 1 && highAccuracy) {
      highAccuracy = false;
      watch();
      return;
    }
    if (state.status === 'ok' && e.code !== 1) return;
    if (e.code === 1) {
      state.lat = state.lon = state.alt = state.acc = NaN;
      state.address = '';
      addressPos = null;
      lastGeo = null;
    }
    state.status = 'error';
    state.error = e.code === 1 ? 'Chưa cho phép vị trí (Cài đặt › Quyền riêng tư › Dịch vụ định vị)' : e.code === 3 ? 'Hết thời gian chờ GPS' : 'Không lấy được vị trí';
    emit();
  }

  function watch() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: highAccuracy, maximumAge: 5000, timeout: 20000 });
  }

  function start() {
    if (!('geolocation' in navigator)) { state.status = 'error'; state.error = 'Thiết bị không hỗ trợ GPS'; emit(); return; }
    stop();
    if (state.status !== 'ok') { state.status = 'locating'; emit(); }
    highAccuracy = true;
    watch();
    weatherTimer = setInterval(() => { geocode(); weather(); }, 60 * 1000);
  }

  function stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    clearInterval(weatherTimer);
    weatherTimer = null;
  }

  function refresh() {
    start();
    geocode(true);
    weather(true);
  }

  return { start, stop, refresh, get: () => ({ ...state }) };
}
