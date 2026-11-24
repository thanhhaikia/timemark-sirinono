// Canvas watermark renderer. The same code draws the live preview overlay and the saved photo,
// so what the user sees on screen is what ends up in the picture.

import { buildInfo } from './format.js';

const FAMILY = 'system-ui, Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO = '"DejaVu Sans Mono", "Roboto Mono", Menlo, Consolas, monospace';
const font = (weight, px, family = FAMILY) => `${weight} ${Math.round(px * 10) / 10}px ${family}`;

export function textColorOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111' : '#fff';
}

/** Splits text into lines no wider than maxW (long words are broken by character). */
export function wrap(ctx, text, f, maxW) {
  ctx.font = f;
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW) { line = next; continue; }
      if (line) lines.push(line);
      line = '';
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width > maxW && chunk) { lines.push(chunk); chunk = ''; }
        chunk += ch;
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function checkBadge(ctx, x, y, size, bg, fg) {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fg;
  ctx.lineWidth = size * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.28, y + size * 0.52);
  ctx.lineTo(x + size * 0.44, y + size * 0.68);
  ctx.lineTo(x + size * 0.74, y + size * 0.34);
  ctx.stroke();
  ctx.restore();
}

function footerText(info) {
  return [info.brand, info.code ? `Mã ảnh ${info.code}` : null].filter(Boolean).join('  ·  ');
}

function detailLines(info, labels) {
  const out = [];
  if (info.address) out.push([labels ? 'Địa điểm' : null, info.address]);
  const geo = [info.coords, info.altitude, info.accuracy].filter(Boolean).join('  ');
  if (geo) out.push([labels ? 'Tọa độ' : null, geo]);
  if (info.weather) out.push([labels ? 'Thời tiết' : null, info.weather]);
  if (info.project) out.push([labels ? 'Dự án' : 'Dự án:', info.project]);
  if (info.author) out.push([labels ? 'Người chụp' : 'Người chụp:', info.author]);
  if (info.note) out.push([labels ? 'Ghi chú' : 'Ghi chú:', info.note]);
  return out;
}

const shadowOn = (ctx, u) => { ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = u * 0.8; ctx.shadowOffsetY = u * 0.15; };
const shadowOff = (ctx) => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

// Each layout returns { w, h, draw(x, y) } so the caller can place the block in any corner.

function classic(ctx, info, s, u, maxW) {
  const timeF = font(700, 11 * u);
  const sideF = font(600, 3.6 * u);
  const bodyF = font(500, 3.1 * u);
  const footF = font(600, 2.5 * u);
  ctx.font = timeF;
  const timeW = ctx.measureText(info.time).width;
  const side = [info.date, info.weekday].filter(Boolean);
  ctx.font = sideF;
  const sideW = Math.max(0, ...side.map((t) => ctx.measureText(t).width));
  const headH = 11 * u;
  const headW = timeW + (side.length ? 3.2 * u + sideW : 0);
  const width = Math.min(maxW, Math.max(headW, 62 * u));
  const lh = 3.1 * u * 1.35;
  const body = [];
  for (const [label, value] of detailLines(info, false)) {
    for (const l of wrap(ctx, label ? `${label} ${value}` : value, bodyF, width)) body.push(l);
  }
  const foot = footerText(info);
  const footH = foot ? 2.5 * u * 1.8 : 0;
  const h = headH + (body.length ? 1.6 * u + body.length * lh : 0) + (foot ? 1.2 * u + footH : 0);
  ctx.font = bodyF;
  const w = Math.max(headW, ...body.map((l) => ctx.measureText(l).width));
  return {
    w, h,
    draw(x, y) {
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      shadowOn(ctx, u);
      ctx.fillStyle = '#fff';
      ctx.font = timeF;
      ctx.fillText(info.time, x, y + headH * 0.86);
      if (side.length) {
        const bx = x + timeW + 1.4 * u;
        ctx.fillStyle = s.accent;
        ctx.fillRect(bx, y + 1.2 * u, 0.7 * u, headH - 2.2 * u);
        ctx.fillStyle = '#fff';
        ctx.font = sideF;
        const top = y + (side.length === 1 ? headH * 0.62 : headH * 0.42);
        side.forEach((t, i) => ctx.fillText(t, bx + 1.8 * u, top + i * 4.6 * u));
      }
      let cy = y + headH + 1.6 * u;
      ctx.font = bodyF;
      ctx.fillStyle = '#fff';
      for (const l of body) { cy += lh; ctx.fillText(l, x, cy - lh * 0.28); }
      if (foot) {
        cy += 1.2 * u;
        const b = 2.6 * u;
        shadowOff(ctx);
        checkBadge(ctx, x, cy + (footH - b) / 2, b, s.accent, textColorOn(s.accent));
        shadowOn(ctx, u);
        ctx.font = footF;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText(foot, x + b + 1 * u, cy + footH * 0.68);
      }
      ctx.restore();
    },
  };
}

function work(ctx, info, s, u, maxW) {
  const pad = 2.2 * u;
  const width = Math.min(maxW, 80 * u);
  const titleF = font(700, 3.4 * u);
  const labelF = font(500, 2.9 * u);
  const valueF = font(600, 2.9 * u);
  const footF = font(500, 2.4 * u);
  const labelW = 19 * u;
  const valueW = width - pad * 2 - labelW;
  const lh = 2.9 * u * 1.4;
  const rows = [['Thời gian', [info.date, info.weekday, info.time].filter(Boolean).join('  ')]];
  for (const [label, value] of detailLines(info, true)) if (label !== 'Dự án') rows.push([label, value]);
  const laid = rows.map(([label, value]) => [label, wrap(ctx, value, valueF, valueW)]);
  const headH = 6.4 * u;
  const bodyH = laid.reduce((n, [, ls]) => n + ls.length * lh + 0.7 * u, 0);
  const foot = footerText(info);
  const footH = foot ? 4.6 * u : 0;
  const h = headH + pad * 0.7 + bodyH + pad * 0.5 + footH;
  return {
    w: width, h,
    draw(x, y) {
      ctx.save();
      roundRect(ctx, x, y, width, h, 1.6 * u);
      ctx.fillStyle = 'rgba(15,23,42,0.62)';
      ctx.fill();
      ctx.save();
      roundRect(ctx, x, y, width, h, 1.6 * u);
      ctx.clip();
      ctx.fillStyle = s.accent;
      ctx.fillRect(x, y, width, headH);
      ctx.restore();
      ctx.fillStyle = textColorOn(s.accent);
      ctx.font = titleF;
      const title = wrap(ctx, info.project || 'Báo cáo công việc', titleF, width - pad * 2)[0] || '';
      ctx.fillText(title, x + pad, y + headH * 0.66);
      let cy = y + headH + pad * 0.7;
      for (const [label, lines] of laid) {
        ctx.font = labelF;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(label, x + pad, cy + lh * 0.72);
        ctx.font = valueF;
        ctx.fillStyle = '#fff';
        lines.forEach((l, i) => ctx.fillText(l, x + pad + labelW, cy + lh * (i + 0.72)));
        cy += lines.length * lh + 0.7 * u;
      }
      if (foot) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x + pad, cy + pad * 0.2, width - pad * 2, Math.max(1, 0.15 * u));
        const b = 2.5 * u;
        checkBadge(ctx, x + pad, cy + pad * 0.5 + (footH - b) / 2, b, s.accent, textColorOn(s.accent));
        ctx.font = footF;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(foot, x + pad + b + 1 * u, cy + pad * 0.5 + footH * 0.64);
      }
      ctx.restore();
    },
  };
}

function card(ctx, info, s, u, maxW) {
  const pad = 2.6 * u;
  const timeF = font(800, 8 * u);
  const dateF = font(600, 3.3 * u);
  const bodyF = font(500, 2.9 * u);
  const footF = font(600, 2.4 * u);
  ctx.font = timeF;
  const timeW = ctx.measureText(info.time).width;
  const width = Math.min(maxW, Math.max(60 * u, timeW + pad * 2 + 2 * u));
  const inner = width - pad * 2 - 1.6 * u;
  const dateLine = [info.date, info.weekday].filter(Boolean).join('  ');
  const lh = 2.9 * u * 1.38;
  const body = [];
  for (const [label, value] of detailLines(info, false)) {
    for (const l of wrap(ctx, label ? `${label} ${value}` : value, bodyF, inner)) body.push(l);
  }
  const foot = footerText(info);
  const h = pad + 8 * u + (dateLine ? 4.6 * u : 0) + (body.length ? 1 * u + body.length * lh : 0) + (foot ? 4.4 * u : 0) + pad * 0.8;
  return {
    w: width, h,
    draw(x, y) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 2 * u;
      roundRect(ctx, x, y, width, h, 2 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.fill();
      shadowOff(ctx);
      ctx.fillStyle = s.accent === '#ffffff' ? '#111' : s.accent;
      roundRect(ctx, x + pad, y + pad, 0.8 * u, h - pad * 1.8, 0.4 * u);
      ctx.fill();
      const tx = x + pad + 1.6 * u;
      let cy = y + pad;
      ctx.fillStyle = '#0f172a';
      ctx.font = timeF;
      ctx.fillText(info.time, tx, cy + 8 * u * 0.82);
      cy += 8 * u;
      if (dateLine) {
        ctx.font = dateF;
        ctx.fillStyle = '#1e293b';
        ctx.fillText(dateLine, tx, cy + 3.8 * u);
        cy += 4.6 * u;
      }
      if (body.length) {
        cy += 1 * u;
        ctx.font = bodyF;
        ctx.fillStyle = '#334155';
        for (const l of body) { ctx.fillText(l, tx, cy + lh * 0.75); cy += lh; }
      }
      if (foot) {
        const b = 2.4 * u;
        checkBadge(ctx, tx, cy + 1.2 * u, b, s.accent === '#ffffff' ? '#111' : s.accent, s.accent === '#ffffff' ? '#fff' : textColorOn(s.accent));
        ctx.font = footF;
        ctx.fillStyle = '#475569';
        ctx.fillText(foot, tx + b + 1 * u, cy + 1.2 * u + b * 0.8);
      }
      ctx.restore();
    },
  };
}

function simple(ctx, info, s, u, maxW) {
  const mainF = font(600, 3.4 * u);
  const subF = font(500, 2.6 * u);
  const main = wrap(ctx, [[info.date, info.time].filter(Boolean).join(' '), info.address].filter(Boolean).join('  ·  '), mainF, maxW);
  const sub = wrap(ctx, [info.coords, info.weather, info.author, info.note, info.code ? `Mã ${info.code}` : null].filter(Boolean).join('  ·  '), subF, maxW);
  const lh1 = 3.4 * u * 1.35;
  const lh2 = 2.6 * u * 1.4;
  const h = main.length * lh1 + sub.length * lh2;
  ctx.font = mainF;
  let w = Math.max(0, ...main.map((l) => ctx.measureText(l).width));
  ctx.font = subF;
  w = Math.max(w, ...sub.map((l) => ctx.measureText(l).width));
  return {
    w, h,
    draw(x, y, align) {
      ctx.save();
      shadowOn(ctx, u);
      ctx.textAlign = align;
      const ax = align === 'right' ? x + w : x;
      ctx.fillStyle = '#fff';
      ctx.font = mainF;
      let cy = y;
      for (const l of main) { ctx.fillText(l, ax, cy + lh1 * 0.78); cy += lh1; }
      ctx.font = subF;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const l of sub) { ctx.fillText(l, ax, cy + lh2 * 0.78); cy += lh2; }
      ctx.restore();
    },
  };
}

function stamp(ctx, info, s, u, maxW, data) {
  const d = data.date;
  const p = (n) => String(n).padStart(2, '0');
  const text = `'${p(d.getFullYear() % 100)} ${p(d.getMonth() + 1)} ${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;
  const f = font(700, 5.2 * u, MONO);
  ctx.font = f;
  const w = Math.min(maxW, ctx.measureText(text).width);
  const h = 5.2 * u * 1.2;
  return {
    w, h,
    draw(x, y) {
      ctx.save();
      ctx.font = f;
      ctx.shadowColor = 'rgba(255,90,0,0.9)';
      ctx.shadowBlur = 1.4 * u;
      ctx.fillStyle = '#ff9a2e';
      ctx.fillText(text, x, y + h * 0.82, maxW);
      ctx.restore();
    },
  };
}

const LAYOUTS = { classic, work, card, simple, stamp };

/**
 * Draws the watermark onto ctx covering a W×H image.
 * data: { date, lat, lon, alt, acc, address, weather }
 */
export function drawWatermark(ctx, W, H, data, settings) {
  const info = buildInfo(data, settings);
  const u = (Math.min(W, H) / 100) * (settings.size || 1);
  const margin = Math.max(3 * u, Math.min(W, H) * 0.03);
  const maxW = W - margin * 2;
  const layout = (LAYOUTS[settings.template] || classic)(ctx, info, settings, u, maxW, data);
  const pos = settings.position || 'bl';
  const right = pos.endsWith('r');
  const x = right ? W - margin - layout.w : margin;
  const y = pos.startsWith('t') ? margin : H - margin - layout.h;
  layout.draw(x, y, right ? 'right' : 'left');
  return { x, y, w: layout.w, h: layout.h, info };
}
