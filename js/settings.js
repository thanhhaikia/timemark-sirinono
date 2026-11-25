// User settings persisted in localStorage.

const KEY = 'timemark_sirinono_settings_v1';

export const TEMPLATES = [
  { id: 'classic', name: 'Cổ điển', desc: 'Giờ lớn, ngày, địa chỉ' },
  { id: 'work', name: 'Công việc', desc: 'Bảng báo cáo hiện trường' },
  { id: 'card', name: 'Thẻ trắng', desc: 'Khung sáng, dễ đọc' },
  { id: 'simple', name: 'Đơn giản', desc: 'Một dòng gọn' },
  { id: 'stamp', name: 'Máy film', desc: 'Số cam kiểu máy ảnh cũ' },
];

export const POSITIONS = [
  { id: 'bl', name: 'Dưới trái' },
  { id: 'br', name: 'Dưới phải' },
  { id: 'tl', name: 'Trên trái' },
  { id: 'tr', name: 'Trên phải' },
];

export const ACCENTS = ['#f5b301', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#ffffff'];

export const SHOW_ITEMS = [
  ['date', 'Ngày'],
  ['weekday', 'Thứ'],
  ['address', 'Địa chỉ'],
  ['coords', 'Tọa độ GPS'],
  ['altitude', 'Độ cao'],
  ['accuracy', 'Độ chính xác GPS'],
  ['weather', 'Thời tiết'],
  ['project', 'Dự án'],
  ['author', 'Người chụp'],
  ['note', 'Ghi chú'],
  ['code', 'Mã ảnh'],
  ['brand', 'Nhãn thương hiệu'],
];

export function defaults() {
  return {
    template: 'classic',
    position: 'bl',
    size: 1,
    accent: ACCENTS[0],
    h24: true,
    seconds: false,
    dateFormat: 'dd/MM/yyyy',
    coordFormat: 'dec',
    project: '',
    author: '',
    note: '',
    brand: 'Timemark_Sirinono',
    customAddress: false,
    customAddressText: '',
    show: {
      date: true, weekday: true, address: true, coords: true, altitude: false, accuracy: false,
      weather: true, project: true, author: true, note: true, code: false, brand: false,
    },
    autoSave: true,
    quality: 0.92,
    shutterSound: true,
    grid: false,
    timer: 0,
    facing: 'environment',
    mirrorFront: true,
    v: 2,
  };
}

export function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base;
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (!(k in saved)) continue;
    if (k === 'show') out.show = { ...base.show, ...(saved.show || {}) };
    else if (typeof saved[k] === typeof base[k]) out[k] = saved[k];
  }
  return out;
}

export function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    const out = merge(defaults(), saved);
    if (saved && !(saved.v >= 2)) out.show = { ...out.show, brand: false, code: false };
    return out;
  } catch {
    return defaults();
  }
}

export function save(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage full or disabled: settings just won't persist
  }
}
