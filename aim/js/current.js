(function () {
'use strict';

// Нынешний прицел игры, 2D-часть — перенос view/hud/aim_reticle.gd (_draw и _text) вызов в вызов: по нему сверяется, что
// страница рисует 2D и буквы так же, как Godot.

const L = window.AimLab;
const TAU = Math.PI * 2;
const R = {
  READY: [1.0, 0.72, 0.3, 1.0],
  LOADING: [1.0, 1.0, 1.0, 0.75],
  OFF: [1.0, 1.0, 1.0, 0.4],
  REFUSED: [1.0, 0.42, 0.35, 1.0],
  NO_REACH: [1.0, 0.38, 0.32, 0.9],
  TRACK: [0.0, 0.0, 0.0, 0.3],
  SHADOW: [0.0, 0.0, 0.0, 0.8],
  ROPE: [0.78, 0.62, 0.38, 0.85],
  TEXT_MARGIN: 6.0,
  TEXT_BELOW: 6.0,
};
L.RETICLE = R;

function text(g, at, line, size, color) {
  const width = g.stringSize(line, size);
  const left = 0 + R.TEXT_MARGIN;
  const x = L.clamp(at[0] - width * 0.5, left, Math.max(L.W - R.TEXT_MARGIN - width, left));
  const origin = [x, at[1]];
  g.text(origin, line, size, R.SHADOW, 4);
  g.text(origin, line, size, color, 0);
}

L.drawReticle = function (g, rt) {
  if (!rt || !rt.v) return;
  const c = rt.c;
  const r = rt.r;
  if (rt.tied) {
    g.arc(c, r, 0, TAU, 56, R.TRACK, 5.0, true);
    for (let k = 0; k < 12; k++) g.arc(c, r, (TAU * k) / 12, (TAU * (k + 0.55)) / 12, 6, R.ROPE, 2.5, true);
    return;
  }
  const loaded = rt.rd >= 1.0;
  const color = loaded ? (rt.on ? R.READY : R.OFF) : R.LOADING;
  const ring = rt.un && !rt.on ? R.NO_REACH : color;
  g.arc(c, r, 0, TAU, 56, R.TRACK, 5.0, true);
  g.arc(c, r, -Math.PI * 0.5, -Math.PI * 0.5 + TAU * L.clamp(rt.rd, 0, 1), 56, ring, 2.5, true);
  if (!(c[0] >= 0 && c[1] >= 0 && c[0] < L.W && c[1] < L.H)) return;
  const status = rt.st || '';
  const caption = rt.cap || '';
  const line = [c[0], c[1] + r + 18.0];
  const last = line[1] + (status && caption ? 17.0 : 0.0);
  line[1] -= Math.max(last + R.TEXT_BELOW - L.H, 0);
  if (status) {
    text(g, line, status, 16, rt.ref && !loaded ? R.REFUSED : color);
    line[1] += 17.0;
  }
  if (caption) text(g, line, caption, 13, [1, 1, 1, 0.9]);
};
})();
