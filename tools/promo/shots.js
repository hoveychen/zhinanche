// The promo's timeline, run in the page by director.js before every render.
// window.__cfg = { caps: {...}, square: bool } is set by the recorder.
(() => {
  const cfg = window.__cfg;
  const SQ = !!cfg.square;
  const T = { hook: 2.6, wide: 7.2, spin: 10.9, gears: 13.2, end: 15.8 };
  window.__T = T;
  const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  let phase = '';
  const WX = Number(cfg.wx ?? -2), WZ = Number(cfg.wz ?? 6), WH = Number(cfg.wh ?? 0);

  // captions
  const box = document.createElement('div');
  box.className = 'promo';
  box.innerHTML = '<div class="hook"><b></b><span></span></div><div class="cap"><span></span></div><div class="title"><b></b><span></span></div><div class="veil"></div>';
  document.getElementById('stage').append(box);
  const $ = (s) => box.querySelector(s);
  const show = (sel, a, b, t, fade = 0.25) => {
    const o = Math.min(ss(a, a + fade, t), 1 - ss(b - fade, b, t));
    $(sel).style.opacity = String(o);
    $(sel).style.transform = `translateY(${(1 - ss(a, a + fade * 1.6, t)) * 18}px)`;
  };
  $('.hook b').textContent = cfg.caps.hook[0];
  $('.hook span').textContent = cfg.caps.hook[1];
  $('.title b').textContent = cfg.caps.title[0];
  $('.title span').textContent = cfg.caps.title[1];

  function cap(t) {
    const C = cfg.caps.lines; // [from, to, text]
    let o = 0;
    for (const [a, b, txt] of C) {
      if (t >= a && t < b) {
        if ($('.cap span').textContent !== txt) $('.cap span').textContent = txt;
        o = Math.min(ss(a, a + 0.2, t), 1 - ss(b - 0.2, b, t));
      }
    }
    $('.cap').style.opacity = String(o);
  }

  window.__shot = (st, P) => {
    const t = st.t;
    const { world } = P;
    const f = world.camFocus();
    const c = Math.cos(f.heading), s = Math.sin(f.heading);
    const L = (x, y, z) => [f.x + x * c + z * s, y, f.z - x * s + z * c];
    const W = (x, y, z) => [f.x + x, y, f.z + z];

    show('.hook', -1, T.hook - 0.05, t);
    cap(t);
    show('.title', T.gears + 1.2, 99, t, 0.45);
    $('.veil').style.opacity = String(0.5 * ss(T.gears + 0.4, T.gears + 1.2, t));

    if (t < T.hook) {
      // the gate, and the figure's hand on it; a slow push in
      if (phase !== 'hook') { phase = 'hook'; window.__place(1, 0, Math.PI / 2 + 0.55); }
      st.cmd = { fwd: 0, turn: 0 };
      const k = t / T.hook;
      st.fov = SQ ? 40 : 30;
      st.cam = SQ ? { pos: lerp([11, 5.5, -34], [9.5, 6, -29], k), target: [0, 14.5, 30] } : { pos: lerp([17, 6, -38], [15, 6.4, -33], k), target: [4.4, 14, 30] };
      st.dof = false; st.shell = null;
    } else if (t < T.wide) {
      // high and fixed in the world: the chariot weaves, the hand stays on the gate
      if (phase !== 'wide') { phase = 'wide'; window.__place(WX, WZ, WH); world.setTrails(true); }
      st.cmd = { fwd: 1, turn: 0.8 };
      st.fov = SQ ? 50 : 36;
      st.cam = SQ ? { pos: [-23, 13, -29], target: [3, 6.8, 12] } : { pos: [-22, 12, -27], target: [2, 7.2, 5] };
      st.dof = false;
    } else if (t < T.spin) {
      // close: it spins on the spot, the figure does not move
      if (phase !== 'spin') { phase = 'spin'; window.__place(0, 0, Math.PI / 2 + 0.3); }
      const u = t - T.wide;
      st.cmd = { fwd: 0, turn: u < 0.15 ? 0 : -1 };
      const k = u / (T.spin - T.wide);
      st.fov = SQ ? 44 : 35;
      st.cam = SQ ? { pos: lerp([19, 10.5, -35], [22, 10.2, -33], k), target: [6.4, 6.4, 3.8] } : { pos: lerp([24, 11, -28], [27, 10.5, -25], k), target: [3.2, 8.4, 8.6] };
      st.dof = false;
    } else if (t < T.gears) {
      // the body melts away and the camera drops onto the gears; it drives a curve
      if (phase !== 'gears') {
        phase = 'gears';
        window.__xray(true);
        world.setFigureBig(false);
        world.setTrails(false); world.clearTrails(); world.ring.group.visible = false;
        st.from = { pos: st.cam.pos.slice(), target: st.cam.target.slice(), fov: st.fov };
      }
      const u = t - T.spin;
      st.shell = 1 - ss(0, 0.7, u);
      st.cmd = { fwd: 0.4, turn: 0.75 };
      const k = ss(0, 1.0, u);
      const to = { pos: L(-3.2, 13.5, 0.6), target: L(0.3, 2.1, 0) };
      st.cam = { pos: lerp(st.from.pos, to.pos, k), target: lerp(st.from.target, to.target, k) };
      st.fov = st.from.fov + ((SQ ? 44 : 38) - st.from.fov) * k;
      st.dof = false;
    } else {
      // pull up and away under the title
      if (!phase.startsWith('end')) { phase = 'end'; st.from = { pos: st.cam.pos.slice(), target: st.cam.target.slice(), fov: st.fov }; }
      const u = t - T.gears;
      st.cmd = { fwd: 0.4, turn: 0.75 };
      const k = ss(0, 1.8, u);
      const L0 = { pos: L(-3.2, 13.5, 0.6), target: L(0.3, 2.1, 0) };
      const to = { pos: W(-19, 15, -40), target: W(0, SQ ? 12 : 10.3, 12) };
      st.cam = { pos: lerp(L0.pos, to.pos, k), target: lerp(L0.target, to.target, k) };
      st.fov = (SQ ? 44 : 38) + ((SQ ? 40 : 34) - (SQ ? 44 : 38)) * k;
      st.shell = ss(0.55, 0.9, u);
      if (u > 0.95 && phase === 'end') { phase = 'end2'; window.__xray(false); st.shell = null; world.setFigureBig(true); world.ring.group.visible = true; }
      if (phase === 'end2') st.shell = null;
    }
  };
})();
