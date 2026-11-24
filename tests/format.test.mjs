import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInfo, fileName, formatCoords, formatDate, formatTime, photoCode, shortAddress, weatherText, weekday } from '../js/format.js';
import { defaults, merge } from '../js/settings.js';

const d = new Date(2026, 10, 24, 9, 5, 7); // Tue 24 Nov 2026 09:05:07 local time

test('formats time in 24h and 12h', () => {
  assert.equal(formatTime(d), '09:05');
  assert.equal(formatTime(d, { seconds: true }), '09:05:07');
  assert.equal(formatTime(new Date(2026, 0, 1, 21, 30), { h24: false }), '09:30 CH');
  assert.equal(formatTime(new Date(2026, 0, 1, 0, 15), { h24: false }), '12:15 SA');
});

test('formats dates and Vietnamese weekdays', () => {
  assert.equal(formatDate(d), '24/11/2026');
  assert.equal(formatDate(d, 'yyyy-MM-dd'), '2026-11-24');
  assert.equal(formatDate(d, 'MM/dd/yyyy'), '11/24/2026');
  assert.equal(weekday(d), 'Thứ Ba');
});

test('formats coordinates', () => {
  assert.equal(formatCoords(10.776889, 106.700806), '10.776889, 106.700806');
  assert.equal(formatCoords(10.776889, 106.700806, 'dms'), `10°46'36.8"N 106°42'02.9"E`);
  assert.equal(formatCoords(-33.5, -70.25, 'dms'), `33°30'00.0"S 70°15'00.0"W`);
  assert.equal(formatCoords(NaN, 1), '');
});

test('photo code is stable and depends on time and place', () => {
  const a = photoCode(d, 10.1, 106.2);
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(photoCode(d, 10.1, 106.2), a);
  assert.notEqual(photoCode(new Date(d.getTime() + 1000), 10.1, 106.2), a);
  assert.notEqual(photoCode(d, 10.2, 106.2), a);
  assert.match(photoCode(d, NaN, NaN), /^.{4}-.{4}$/);
});

test('file name uses the capture time', () => {
  assert.equal(fileName(d), 'Timemark_Sirinono_20261124_090507.jpg');
});

test('weather codes map to Vietnamese text', () => {
  assert.equal(weatherText(0), 'Trời quang');
  assert.equal(weatherText(3), 'Nhiều mây');
  assert.equal(weatherText(63), 'Mưa');
  assert.equal(weatherText(95), 'Dông');
});

test('short address from Nominatim result drops duplicates', () => {
  const r = { address: { house_number: '12', road: 'Lê Lợi', suburb: 'Bến Nghé', city_district: 'Quận 1', city: 'Thành phố Hồ Chí Minh' }, display_name: 'x' };
  assert.equal(shortAddress(r), '12 Lê Lợi, Bến Nghé, Quận 1, Thành phố Hồ Chí Minh');
  assert.equal(shortAddress({ address: { city: 'Hà Nội', state: 'Hà Nội' } }), 'Hà Nội');
  assert.equal(shortAddress({ address: {}, display_name: 'Somewhere' }), 'Somewhere');
  assert.equal(shortAddress(null), '');
});

test('buildInfo respects show toggles and custom address', () => {
  const s = defaults();
  s.project = ' Nhà A ';
  const data = { date: d, lat: 10, lon: 106, alt: 12.4, acc: 5, address: 'Quận 1', weather: { temp: 30.6, text: 'Ít mây' } };
  let info = buildInfo(data, s);
  assert.equal(info.time, '09:05');
  assert.equal(info.date, '24/11/2026');
  assert.equal(info.address, 'Quận 1');
  assert.equal(info.project, 'Nhà A');
  assert.equal(info.weather, '31°C Ít mây');
  assert.equal(info.altitude, null);
  assert.equal(info.author, null);
  assert.equal(info.brand, 'Timemark_Sirinono');
  s.show.coords = false;
  s.show.altitude = true;
  s.customAddress = true;
  s.customAddressText = 'Công trình B';
  info = buildInfo(data, s);
  assert.equal(info.coords, null);
  assert.equal(info.altitude, '12 m');
  assert.equal(info.address, 'Công trình B');
  info = buildInfo({ date: d }, defaults());
  assert.equal(info.coords, null);
  assert.equal(info.address, null);
  assert.equal(info.weather, null);
});

test('settings merge ignores unknown keys and wrong types', () => {
  const m = merge(defaults(), { template: 'work', size: 'big', bogus: 1, show: { coords: false } });
  assert.equal(m.template, 'work');
  assert.equal(m.size, 1);
  assert.equal('bogus' in m, false);
  assert.equal(m.show.coords, false);
  assert.equal(m.show.date, true);
  assert.deepEqual(merge(defaults(), null), defaults());
});
