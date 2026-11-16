/* Turbocharger Lab — UI, simulation and 3D viewer */
(function () {
  const TL = window.TL, UI = TL.UI, M = TL.M, V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  let lang = 0; try { const s = localStorage.getItem('tl_lang'); if (s !== null) lang = Math.min(2, Math.max(0, +s || 0)); } catch (e) { /* ignore */ }
  const L = a => Array.isArray(a) ? a[lang] : a, t = k => L(UI[k]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
  const PART = {}; TL.PARTS.forEach((p, i) => { p.no = i + 1; PART[p.id] = p; });

  const st = { view: 'lab', cut: false, exp: false, lbl: false, air: true, exh: true, oil: false, cool: false, slow: false, snd: false, thr: 35, sel: null, step: 0, fault: null, hidden: false, tour: -1, quiz: null };
  const S = { rpm: 20000, boost: 0, wg: 0, egt: 300, ang: 0, oilP: 2, pow: 100 };
  const F0 = { oilMul: 1, boostMul: 1, rpmMul: 1, wobble: 0, smoke: null, wg: null, ax: .05, rad: .45, egt: 0, noise: 0 };
  const F = () => st.fault ? Object.assign({}, F0, st.fault.sim) : F0;

  /* ---------------- three.js ---------------- */
  const vp = $('#viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputEncoding = THREE.sRGBEncoding;
  vp.insertBefore(renderer.domElement, vp.firstChild);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1.5, .1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a5560, 1.15));
  const d1 = new THREE.DirectionalLight(0xffffff, 1.25); d1.position.set(4, 8, 9); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xbfd8ff, .55); d2.position.set(-7, 3, -5); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xffffff, .35); d3.position.set(0, -6, 6); scene.add(d3);
  scene.add(M.build());
  const orb = { az: .5, pol: 1.2, zoom: 1, dist: 14, tx: 0 };

  /* particles */
  const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  function stream(n, size, xray) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: sprite, vertexColors: true, transparent: true, depthWrite: false, depthTest: !xray, sizeAttenuation: true })); pts.renderOrder = 5; pts.frustumCulled = false; scene.add(pts);
    const sd = new Float32Array(n * 3), tt = new Float32Array(n); for (let i = 0; i < n; i++) { tt[i] = Math.random(); sd[i * 3] = Math.random(); sd[i * 3 + 1] = Math.random(); sd[i * 3 + 2] = Math.random(); }
    return { n, geo, pts, sd, tt };
  }
  const air = stream(380, .24, true), exh = stream(400, .25, true), oil = stream(300, .2, true), cool = stream(170, .2, true);
  const tmp = new V3(), tmp2 = new V3();
  const frac = x => x - Math.floor(x);
  function airPos(u, a, b, c, o, col) {
    const cv = M.cVol, r0 = .08 + .58 * a;
    if (u < .28) { const k = u / .28, be = b * TAU + k * 1.2; o.set(-3.9 + 2.0 * k, r0 * Math.cos(be), r0 * Math.sin(be)); col[0] = .5; col[1] = .85; col[2] = 1; }
    else if (u < .5) { const k = (u - .28) / .22, rho = lerp(r0, 1.5, k * k), be = b * TAU + 1.2 + k * 2.4; o.set(-1.9 + .66 * Math.min(1, k * 1.5), rho * Math.cos(be), rho * Math.sin(be)); col[0] = .35; col[1] = .62; col[2] = 1; }
    else if (u < .86) { const k = (u - .5) / .36, s0 = frac((b * TAU + 3.6 - 1.5 * PI) / TAU), s = s0 + (1 - s0) * k; cv.centre(s, o); const r = cv.r(s) * .55; o.x += (a - .5) * r; o.y += (c - .5) * r; o.z += (b - .5) * r; col[0] = .5; col[1] = .5; col[2] = 1; }
    else { const k = (u - .86) / .14; cv.centre(1, o); o.x += (a - .5) * .5; o.z += (c - .5) * .5; o.y = k * 3.0; col[0] = .72; col[1] = .5; col[2] = 1; }
  }
  const SMOKE = { blue: [.3, .5, 1], black: [.26, .26, .29], white: [.95, .95, .97] };
  function exhPos(u, a, b, c, o, col) {
    const tv = M.tVol, f = F(), byp = S.wg > .05 && c < S.wg * .32, wy = M.paths.wgY;
    if (u < .18) { const k = u / .18; tv.centre(1, o); o.x += (a - .5) * .5; o.z += (b - .5) * .5; o.y = -2.8 + 2.8 * k; col[0] = 1; col[1] = .3; col[2] = .08; return; }
    const sx = byp ? .75 : a * .92;
    if (u < .55) { const k = (u - .18) / .37, s = 1 - (1 - sx) * k; tv.centre(s, o); const r = tv.r(s) * .55; o.x += (b - .5) * r; o.y += (c - .5) * r; o.z += (a - .5) * r * (byp ? .3 : 1); col[0] = 1; col[1] = .45; col[2] = .1; return; }
    const sm = f.smoke ? SMOKE[f.smoke] : [.62, .42, .36];
    if (byp) {
      if (u < .68) { const k = (u - .55) / .13; tv.centre(.75, o); o.lerp(tmp2.set(1.62, wy, 0), k); col[0] = 1; col[1] = .5; col[2] = .1; }
      else { const k = (u - .68) / .32; o.set(1.62 + 2.3 * k, wy + (b - .5) * .25 * (1 + 3 * k) + .5 * k * k, (a - .5) * .25 * (1 + 3 * k)); col[0] = 1; col[1] = .6; col[2] = .15; }
      return;
    }
    const th0 = tv.th(sx);
    if (u < .78) { const k = (u - .55) / .23, rho = lerp(.97, .42, k), be = th0 + k * 1.7; o.set(lerp(1.09, 1.75, k * k), rho * Math.cos(be), rho * Math.sin(be)); col[0] = .95; col[1] = .4; col[2] = .15; }
    else { const k = (u - .78) / .22, rho = lerp(.42, .12 + .46 * b, Math.min(1, k * 3)) * (1 + .5 * k), be = th0 + 1.7 + k * .9; o.set(1.75 + 2.4 * k, rho * Math.cos(be), rho * Math.sin(be)); col[0] = sm[0]; col[1] = sm[1]; col[2] = sm[2]; }
  }
  /* polyline helpers */
  function poly(pts) { const p = pts.map(q => new V3(q[0], q[1], q[2] || 0)), len = [0]; for (let i = 1; i < p.length; i++) len.push(len[i - 1] + p[i].distanceTo(p[i - 1])); return { p, len, tot: len[len.length - 1] }; }
  function polyAt(pl, u, o) { const d = u * pl.tot; let i = 1; while (i < pl.len.length - 1 && pl.len[i] < d) i++; const k = (d - pl.len[i - 1]) / Math.max(1e-6, pl.len[i] - pl.len[i - 1]); return o.copy(pl.p[i - 1]).lerp(pl.p[i], k); }
  const P = M.paths;
  const oilPl = P.oil.map(mid => poly(P.feed.concat(mid, P.drain)));
  // ring: from bottom (y=-R) round the back (z<0) to top (y=+R)
  const ringPts = []; for (let i = 0; i <= 12; i++) { const a = PI * i / 12; ringPts.push([P.coolX, -P.jacketR * Math.cos(a), -P.jacketR * Math.sin(a)]); }
  const coolPl = poly(P.cin.concat([[P.coolX, -.6, 0]], ringPts, [[P.coolX, .6, 0]], P.cout));

  function updStream(s, fn, on, dt, speed, hideFront) {
    s.pts.visible = on; if (!on) return;
    const pos = s.geo.attributes.position.array, col = s.geo.attributes.color.array, c3 = [0, 0, 0];
    for (let i = 0; i < s.n; i++) {
      s.tt[i] += dt * speed * (.8 + .4 * s.sd[i * 3 + 2]); if (s.tt[i] > 1) s.tt[i] -= 1;
      fn(s.tt[i], s.sd[i * 3], s.sd[i * 3 + 1], s.sd[i * 3 + 2], tmp, c3, i);
      if (hideFront && tmp.z > .12) tmp.y = -999;
      pos[i * 3] = tmp.x; pos[i * 3 + 1] = tmp.y; pos[i * 3 + 2] = tmp.z; col[i * 3] = c3[0]; col[i * 3 + 1] = c3[1]; col[i * 3 + 2] = c3[2];
    }
    s.geo.attributes.position.needsUpdate = true; s.geo.attributes.color.needsUpdate = true;
  }
  function oilPos(u, a, b, c, o, col, i) {
    const f = F(); if (f.oilMul < .3 && a > .2) { o.set(0, -999, 0); return; }
    polyAt(oilPl[i % 3], u, o); o.x += (a - .5) * .04; o.y += (b - .5) * .04; if (Math.abs(o.z) < .02) o.z += .05;
    if (f.coke) { col[0] = .2; col[1] = .16; col[2] = .1; } else if (u > .62) { col[0] = .85; col[1] = .5; col[2] = .05; } else { col[0] = 1; col[1] = .8; col[2] = .15; }
  }
  function coolPos(u, a, b, c, o, col) { polyAt(coolPl, u, o); o.x += (a - .5) * .05; if (Math.abs(o.z) < .02) o.z += .05; const h = clamp((u - .35) * 2, 0, 1); col[0] = .15 + .8 * h; col[1] = .9 - .25 * h; col[2] = .8 - .5 * h; }

  /* ---------------- sizing + camera ---------------- */
  function resize() { const w = vp.clientWidth, h = vp.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(vp); window.addEventListener('resize', resize);
  function camUpdate(dt) {
    let eL = 0, eR = 0; M.list.forEach(p => { const x = p.explode.x * p.k; if (x < 0) eL = Math.max(eL, -x); else eR = Math.max(eR, x); });
    const half = 5.0 + (eL + eR) / 2, tx = (eR - eL) / 2, tf = Math.tan(16 * PI / 180);
    const want = Math.max(4.0 / tf, half / (tf * cam.aspect)) * 1.04 * orb.zoom;
    orb.dist = lerp(orb.dist, want, Math.min(1, dt * 5)); orb.tx = lerp(orb.tx, tx, Math.min(1, dt * 5));
    const sp = Math.sin(orb.pol), cp = Math.cos(orb.pol);
    cam.position.set(orb.tx + orb.dist * sp * Math.sin(orb.az), .15 + orb.dist * cp, orb.dist * sp * Math.cos(orb.az)); cam.lookAt(orb.tx, .15, 0);
  }
  /* pointer: rotate / pinch / tap */
  const ptr = new Map(); let moved = 0, pinch0 = 0, zoom0 = 1, downT = 0;
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { ptr.set(e.pointerId, [e.clientX, e.clientY]); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } if (ptr.size === 1) { moved = 0; downT = performance.now(); } if (ptr.size === 2) { const a = Array.from(ptr.values()); pinch0 = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); zoom0 = orb.zoom; } });
  cv.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 1) { moved += Math.abs(dx) + Math.abs(dy); orb.az -= dx * .008; orb.pol = clamp(orb.pol - dy * .008, .15, PI - .15); }
    else if (ptr.size === 2) { const a = Array.from(ptr.values()), d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]); if (pinch0 > 0) orb.zoom = clamp(zoom0 * pinch0 / d, .35, 1.8); moved += 99; }
  });
  const up = e => { if (ptr.has(e.pointerId)) { ptr.delete(e.pointerId); if (!ptr.size && moved < 8 && performance.now() - downT < 500 && e.type === 'pointerup') pick(e); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); orb.zoom = clamp(orb.zoom * (e.deltaY > 0 ? 1.1 : .9), .35, 1.8); }, { passive: false });
  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = cv.getBoundingClientRect(); ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, cam);
    const hits = ray.intersectObject(M.root, true);
    for (const h of hits) { let o = h.object, vis = true; while (o) { if (!o.visible) { vis = false; break; } o = o.parent; } if (vis && h.object.userData.part) { if (st.cut && h.point.z > .02) continue; select(h.object.userData.part); return; } }
    select(null);
  }
  function select(id) {
    st.sel = id; const box = $('#pinfo');
    if (!id) { box.hidden = true; } else { const p = PART[id]; box.hidden = false; box.innerHTML = `<button class="x" aria-label="close">×</button><b>${p.no}. ${L(p.n)}</b>${L(p.j)}<br><span class="m">${t('material')}: ${L(p.m)}</span>`; box.querySelector('.x').onclick = () => select(null); }
    $$('[data-pchip]').forEach(c => c.classList.toggle('on', c.dataset.pchip === id));
  }

  /* ---------------- per-frame ---------------- */
  M.list.forEach(p => { p.k = 0; });
  const hot = new THREE.Color(), selC = new THREE.Color(0x7a4a00);
  let actx = null, osc = null, gain = null, osc2 = null, gain2 = null;
  function audio() {
    if (st.snd && !actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); osc = actx.createOscillator(); osc.type = 'triangle'; gain = actx.createGain(); gain.gain.value = 0; osc.connect(gain); gain.connect(actx.destination); osc.start(); osc2 = actx.createOscillator(); osc2.type = 'sawtooth'; gain2 = actx.createGain(); gain2.gain.value = 0; osc2.connect(gain2); gain2.connect(actx.destination); osc2.start(); } catch (e) { actx = null; } }
    if (!actx) return; if (st.snd && actx.state === 'suspended') actx.resume();
    const on = st.snd && running() && !document.hidden, k = S.rpm / 165000, f = F();
    osc.frequency.value = 250 + 2600 * k; gain.gain.value = on ? .012 + .045 * k : 0;
    osc2.frequency.value = (90 + 500 * k) * (1 + .05 * Math.sin(performance.now() / 40)); gain2.gain.value = on ? .03 * f.noise * k : 0;
  }
  const running = () => st.view !== 'dis' && ['lab', 'fault'].indexOf(st.view) >= 0;
  let last = performance.now(), frame = 0, flowT = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = clamp((now - last) / 1000, 0, .05); last = now;
    if (document.hidden || ['lab', 'dis', 'fault'].indexOf(st.view) < 0 || !vp.clientWidth) return;
    frame++;
    const f = F(), run = running(), slow = st.slow ? .2 : 1;
    // --- simulation ---
    const load = st.thr / 100;
    let tgt = 15000 + 150000 * Math.pow(load, .85), wgT;
    if (f.wg === 'open') { wgT = 1; tgt *= .45; } else if (f.wg === 'closed') { wgT = 0; tgt *= 1.22; } else { wgT = clamp((S.boost - 1.0) / .14, 0, 1); tgt *= 1 - .1 * S.wg; }
    tgt *= f.rpmMul; if (!run) tgt = 0;
    S.wg = lerp(S.wg, wgT, Math.min(1, dt * 4));
    S.rpm += (tgt - S.rpm) * Math.min(1, dt / (tgt > S.rpm ? 1.15 : .8));
    S.rpm = Math.max(0, S.rpm); S.boost = 1.3 * Math.pow(S.rpm / 160000, 2) * f.boostMul;
    S.egt = lerp(S.egt, 220 + 520 * load + f.egt, Math.min(1, dt * 1.5));
    S.oilP = (1.2 + 2.8 * load) * f.oilMul; S.pow = 100 * (1 + .5 * S.boost);
    S.ang += dt * (2.5 + 13 * S.rpm / 165000) * slow * (run ? 1 : 0);
    // --- parts ---
    const removed = {}; if (st.view === 'dis') for (let i = 0; i <= st.step; i++) TL.STEPS[i].rm.forEach(id => { removed[id] = 1; });
    const heat = clamp((S.egt - 430) / 380, 0, 1);
    M.list.forEach(p => {
      const target = st.view === 'dis' ? (removed[p.id] ? 1 : 0) : (st.exp ? 1 : 0);
      p.k = lerp(p.k, target, Math.min(1, dt * 4)); if (Math.abs(p.k - target) < .002) p.k = target;
      p.holder.position.copy(p.explode).multiplyScalar(p.k);
      if (p.cutG) { p.cutG.visible = st.cut; p.full.visible = !st.cut; }
      if (p.spins) { p.spin.rotation.x = S.ang; const w = f.wobble * .022 * (run ? 1 : 0); p.spin.position.set(0, w * Math.sin(S.ang * 3.1), w * Math.cos(S.ang * 2.3)); }
      const isHot = p.id === 'turbHousing' || p.id === 'turbWheel' || p.id === 'wgate';
      p.mats.forEach(m => { if (!m.emissive) return; if (isHot) hot.setRGB(.95 * heat * heat, .16 * heat * heat, 0); else hot.setRGB(0, 0, 0); if (st.sel === p.id) hot.add(selC); m.emissive.copy(hot); });
    });
    const xr = st.view !== 'dis' && (st.oil || st.cool);
    setGhost(M.parts.chra, xr, st.cut ? .5 : .2); setGhost(M.parts.oilIn, st.oil && st.view !== 'dis', .3); setGhost(M.parts.oilOut, st.oil && st.view !== 'dis', .3); setGhost(M.parts.coolant, st.cool && st.view !== 'dis', .3);
    setGhost(M.parts.backplate, xr && !st.cut, .25);
    const asm = M.list.every(p => p.k < .03);
    M.gallery.visible = st.oil && asm && st.view !== 'dis'; M.jacket.visible = st.cool && asm && st.view !== 'dis';
    M.jkFull.visible = !st.cut; M.jkHalf.visible = st.cut; M.galMat.color.set(f.coke ? 0x1b1712 : 0xffc21a);
    M.parts.compWheel.blOK.visible = !f.dmgC; M.parts.compWheel.blBad.visible = !!f.dmgC;
    M.parts.turbWheel.blOK.visible = !f.dmgT; M.parts.turbWheel.blBad.visible = !!f.dmgT;
    M.parts.journal.mats[0].color.set(f.blueBrg ? 0x39457a : (f.coke ? 0x4a3a28 : 0xc98a3c));
    M.wgPivot.rotation.z = S.wg * .42; M.wgMove.position.x = S.wg * .14; M.wgSpringG.position.x = -.485 + S.wg * .14; M.wgSpringG.scale.x = .255 - S.wg * .14; M.wgAirG.scale.x = .075 + S.wg * .14; M.wgAirMat.opacity = .12 + .6 * clamp(S.boost / 1.2, 0, 1);
    // --- flows ---
    const fl = run && asm, sp = (.1 + .42 * S.rpm / 165000) * slow;
    updStream(air, airPos, fl && st.air, dt, sp, st.cut); updStream(exh, exhPos, fl && st.exh, dt, sp, st.cut);
    flowT += dt * (2 + 9 * S.rpm / 165000) * slow;
    M.arrows.forEach((a, i) => { const on = fl && st[a.kind]; a.g.visible = on; if (on) a.g.position.copy(a.base).addScaledVector(a.dir, .16 * Math.sin(flowT - i)); });
    updStream(oil, oilPos, fl && st.oil, dt, (f.coke ? .04 : .16) * (st.slow ? .5 : 1), false); updStream(cool, coolPos, fl && st.cool, dt, .14 * (st.slow ? .5 : 1), false);
    camUpdate(dt); renderer.render(scene, cam);
    if (frame % 4 === 0) { gauges(); labels(); audio(); actUpd(); }
  }
  function setGhost(p, on, op) { p.mats.forEach(m => { const want = on ? op : 1; if (m.opacity !== want) { m.opacity = want; m.transparent = on; m.depthWrite = !on; m.needsUpdate = true; } }); }

  /* ---------------- labels ---------------- */
  const LBL = ['compHousing', 'compWheel', 'backplate', 'chra', 'shaft', 'journal', 'thrust', 'shield', 'turbWheel', 'turbHousing', 'wgate', 'actuator', 'oilIn', 'oilOut', 'coolant', 'nut', 'clamp'];
  const lblBox = $('#labels'), lblEl = {};
  const arEl = {};
  function arrowLabels() {
    const w = vp.clientWidth, h = vp.clientHeight, placed = [], top = $('#alert').hidden ? 12 : 46;
    M.arrows.forEach(a => {
      let el = arEl[a.key]; if (!el) { el = arEl[a.key] = document.createElement('div'); el.className = 'albl ' + a.kind; vp.appendChild(el); }
      el.style.display = a.g.visible ? '' : 'none'; if (!a.g.visible) return;
      const tx = t(a.key); if (el.textContent !== tx) el.textContent = tx;
      const hz = Math.abs(a.dir.x) > .5, isIn = /i$/.test(a.key);
      tmp.copy(a.base).addScaledVector(a.dir, hz ? .6 : (isIn ? -.35 : 1.75 * a.sc)).project(cam);
      const bw = (el.offsetWidth || 60) / 2 + 3; let x = clamp((tmp.x + 1) / 2 * w, bw, w - bw), y = clamp((1 - tmp.y) / 2 * h + (hz ? 24 : 0), top, h - 30);
      for (let n = 0; n < 6; n++) { if (!placed.some(q => Math.abs(q[0] - x) < q[2] + bw && Math.abs(q[1] - y) < 19)) break; y += (y < h / 2 ? 19 : -19); }
      placed.push([x, y, bw]); el.style.left = x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px';
    });
  }
  function labels() {
    arrowLabels();
    lblBox.style.display = st.lbl ? '' : 'none'; if (!st.lbl) return;
    const w = vp.clientWidth, h = vp.clientHeight, small = w < 620 || M.list.some(p => p.k > .3);
    const placed = [];
    LBL.forEach(id => {
      let el = lblEl[id]; if (!el) { el = lblEl[id] = document.createElement('div'); el.className = 'lbl'; lblBox.appendChild(el); }
      const p = M.parts[id]; tmp.copy(p.anchor).add(p.holder.position).project(cam);
      const txt = small ? String(PART[id].no) : PART[id].no + ' ' + L(PART[id].n); if (el.textContent !== txt) el.textContent = txt;
      const bw = (el.offsetWidth || 24) / 2 + 3; let x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
      for (let n = 0; n < 8; n++) { if (!placed.some(q => Math.abs(q[0] - x) < q[2] + bw && Math.abs(q[1] - y) < 20)) break; y += 20; }
      placed.push([x, y, bw]); el.style.left = x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px';
    });
  }

  /* ---------------- gauges ---------------- */
  const GA = [['rpm', 'g_rpm', 'RPM'], ['boost', 'g_boost', 'bar'], ['egt', 'g_egt', '°C'], ['oil', 'g_oil', 'bar'], ['air', 'g_air', '°C'], ['pow', 'g_pow', '%'], ['wg', 'g_wg', ''], ['smoke', 'g_smoke', '']];
  function buildGauges() { $('#gauges').innerHTML = GA.map(g => `<div class="g" id="g_${g[0]}"><small title="${t(g[1])}">${t(g[1])}</small><b>–</b><i>${g[2]}</i><div class="bar"><span></span></div></div>`).join(''); $('#thrLbl').textContent = t('thr'); }
  function setG(id, txt, pct, bad) { const el = document.getElementById('g_' + id); if (!el) return; el.children[1].textContent = txt; el.lastElementChild.firstElementChild.style.width = clamp(pct, 0, 100) + '%'; el.classList.toggle('bad', !!bad); }
  function gauges() {
    const f = F(), over = S.boost > 1.45 || S.rpm > 180000, lowOil = S.oilP < .8;
    setG('rpm', Math.round(S.rpm / 1000) * 1000 + '', S.rpm / 2100, S.rpm > 180000);
    setG('boost', S.boost.toFixed(2), S.boost / 2.2 * 100, S.boost > 1.45);
    setG('egt', Math.round(S.egt) + '', S.egt / 9, S.egt > 780);
    setG('oil', S.oilP.toFixed(1), S.oilP / 4.5 * 100, lowOil);
    setG('air', Math.round(30 + 95 * S.boost) + ' → ' + Math.round(32 + 16 * S.boost), S.boost / 2 * 100);
    setG('pow', Math.round(S.pow) + '', (S.pow - 100) / 1.1, false);
    setG('wg', S.wg > .08 ? t('wg_o') + ' ' + Math.round(S.wg * 100) + '%' : t('wg_c'), S.wg * 100, false);
    setG('smoke', t('sm_' + (f.smoke || 'none')), f.smoke ? 100 : 0, !!f.smoke);
    const al = $('#alert'); let msg = '';
    if (running()) { if (over) msg = t('al_over'); else if (lowOil) msg = t('al_oil'); else if (st.fault && !st.hidden) msg = t('al_fault') + ' ' + L(st.fault.n); }
    al.hidden = !msg; if (msg && al.textContent !== msg) al.textContent = msg;
  }

  /* ---------------- toolbar ---------------- */
  const TB = [['cut', 'tb_cut', ''], ['exp', 'tb_exp', ''], ['lbl', 'tb_lbl', ''], ['air', 'tb_air', 'air'], ['exh', 'tb_exh', 'exh'], ['oil', 'tb_oil', 'oil'], ['cool', 'tb_cool', 'cool'], ['slow', 'tb_slow', ''], ['snd', 'tb_snd', '']];
  function buildToolbar() {
    const dis = st.view === 'dis';
    $('#toolbar').innerHTML = (dis ? '' : `<button class="tb go" id="tbTour">${t('tb_tour')}</button>`) + TB.filter(b => !dis || ['cut', 'lbl'].indexOf(b[0]) >= 0).map(b => `<button class="tb ${b[2]}" data-tb="${b[0]}" aria-pressed="${!!st[b[0]]}">${t(b[1])}</button>`).join('') + `<button class="tb" id="tbReset">${t('tb_reset')}</button>`;
    $$('[data-tb]').forEach(b => { b.onclick = () => { const k = b.dataset.tb; st[k] = !st[k]; if ((k === 'oil' || k === 'cool') && st[k]) st.cut = true; if (k === 'exp' && st.exp) { st.cut = false; } if (k === 'snd') { try { audio(); if (actx && actx.state === 'suspended') actx.resume(); } catch (x) { /* ignore */ } } syncTb(); ping(); }; });
    const tr = $('#tbTour'); if (tr) tr.onclick = () => tour(0);
    $('#tbReset').onclick = () => { Object.assign(st, { cut: false, exp: false, lbl: false, air: true, exh: true, oil: false, cool: false, slow: false }); orb.az = .5; orb.pol = 1.2; orb.zoom = 1; setThr(35); select(null); tour(-1); syncTb(); };
    $('#drive').hidden = dis; $('#hint').textContent = t('hint');
  }
  function syncTb() { $$('[data-tb]').forEach(b => b.setAttribute('aria-pressed', !!st[b.dataset.tb])); }
  function setThr(v) { st.thr = v; $('#thr').value = v; $('#thrVal').textContent = v + '%'; }
  $('#thr').addEventListener('input', e => setThr(+e.target.value));

  /* ---------------- tour ---------------- */
  function tour(i) {
    st.tour = i; const box = $('#tour'); if (i < 0 || i >= TL.TOUR.length) { box.hidden = true; st.tour = -1; return; }
    const s = TL.TOUR[i]; ['cut', 'air', 'exh', 'oil', 'cool', 'slow', 'exp'].forEach(k => { st[k] = !!s.set[k]; }); setThr(s.thr); select(null); syncTb();
    box.hidden = false; $('#tourTxt').innerHTML = L(s.t); $('#tourNo').textContent = (i + 1) + ' / ' + TL.TOUR.length;
    if (i === 5 || i === 6) { orb.az = .25; orb.zoom = .62; } else { orb.zoom = 1; orb.az = .5; }
  }
  $('#tourPrev').onclick = () => tour(Math.max(0, st.tour - 1)); $('#tourNext').onclick = () => { if (st.tour >= TL.TOUR.length - 1) tour(-1); else tour(st.tour + 1); };
  $('#tourEnd').onclick = () => { tour(-1); orb.zoom = 1; };

  /* ---------------- tabs / views ---------------- */
  const TABS = ['lab', 'parts', 'dis', 'sys', 'fault', 'theory', 'mcq'];
  function show(v) {
    if (st.view === 'fault' && v !== 'fault') { st.fault = null; st.hidden = false; st.quiz = null; }
    st.view = v; TABS.forEach(k => { $('#view-' + k).hidden = k !== v; });
    $$('#tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.view === v));
    const slot = document.querySelector('[data-slot="' + v + '"]'); const stage = $('#stage');
    if (slot) { slot.appendChild(stage); stage.hidden = false; } else stage.hidden = true;
    if (v !== 'lab') tour(-1);
    if (v === 'dis') { st.exp = false; select(null); }
    buildToolbar(); render(v); resize(); ping();
    try { history.replaceState(null, '', '#' + v); } catch (e) { /* ignore */ }
  }
  function buildTabs() { $('#tabs').innerHTML = TABS.map(k => `<button role="tab" data-view="${k}">${t('tab_' + k)}</button>`).join(''); $$('#tabs button').forEach(b => { b.onclick = () => { show(b.dataset.view); window.scrollTo(0, 0); }; }); }
  function render(v) { ({ lab: rLab, parts: rParts, dis: rDis, sys: rSys, fault: rFault, theory: rTheory, mcq: rMcq })[v](); }

  function rLab() {
    $('#labSide').innerHTML = `<div class="card"><h3>${t('lab_h')}</h3><ol>${t('lab_p')}</ol></div>
      <div class="card" id="actCard"><h3>${t('act_h')}</h3>${actSvg()}<p id="actSt" style="font-weight:700;margin:4px 0 6px"></p>
        <div class="row"><button class="btn pri" id="actFull">${t('act_full')}</button><button class="btn" id="actRel">${t('act_rel')}</button><button class="btn" id="act3d">${t('act_3d')}</button></div><ol>${t('act_p')}</ol></div>
      <div class="card"><h3>${t('plist_h')}</h3><div class="chips">${TL.PARTS.map(p => `<button class="chip${st.sel === p.id ? ' on' : ''}" data-pchip="${p.id}">${p.no}. ${L(p.n)}</button>`).join('')}</div></div>
      <div class="card"><h3>${t('basic_h')}</h3><ul>${t('basic_p')}</ul></div>`;
    $$('[data-pchip]').forEach(c => { c.onclick = () => focusPart(c.dataset.pchip); });
    $('#actFull').onclick = () => setThr(100); $('#actRel').onclick = () => setThr(15);
    $('#act3d').onclick = () => { st.cut = true; st.exp = false; st.exh = true; orb.az = .15; orb.pol = 1.1; orb.zoom = 1; select(null); st.sel = 'actuator'; syncTb(); $('#stage').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    actUpd();
  }
  function actSvg() {
    const w = t('act_w');
    return `<div class="fig" style="margin:6px 0"><svg viewBox="0 0 360 178" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="11" font-weight="700">
      <rect width="360" height="178" fill="#fff"/>
      <path d="M8 60 H62" stroke="#1e88e5" stroke-width="9" stroke-linecap="round"/><text x="6" y="44" fill="#1e88e5">${w[0]}</text><text id="actB" x="6" y="84" fill="#1e88e5" font-size="13">0.00 bar</text>
      <rect id="actAir" x="62" y="27" width="40" height="66" fill="#35a7ff" opacity=".2"/>
      <rect x="60" y="25" width="112" height="70" rx="8" fill="none" stroke="#b8901a" stroke-width="4"/>
      <polyline id="actSp" fill="none" stroke="#566575" stroke-width="3" stroke-linejoin="round"/>
      <line id="actDia" x1="100" y1="27" x2="100" y2="93" stroke="#13202c" stroke-width="6"/>
      <line id="actRod" x1="100" y1="60" x2="285" y2="60" stroke="#8d949c" stroke-width="5" stroke-linecap="round"/>
      <rect x="196" y="112" width="87" height="36" fill="#fde2dc" stroke="#a12813" stroke-width="2"/>
      <path d="M204 130 H262 M252 122 l10 8 -10 8" fill="none" stroke="#e2452a" stroke-width="4"/>
      <g id="actByp" opacity="0"><path d="M292 130 H346 M336 122 l10 8 -10 8" fill="none" stroke="#e2452a" stroke-width="4"/><text x="318" y="160" text-anchor="middle" fill="#e2452a">${w[6]}</text></g>
      <g id="actArm"><line x1="285" y1="30" x2="285" y2="150" stroke="#b4572f" stroke-width="6" stroke-linecap="round"/><rect x="283" y="108" width="7" height="44" rx="2" fill="#b4572f"/></g>
      <circle cx="285" cy="30" r="6" fill="#13202c"/>
      <text x="100" y="16" text-anchor="middle" fill="#13202c">${w[1]}</text><text x="142" y="110" text-anchor="middle" fill="#566575">${w[2]}</text><text x="226" y="52" text-anchor="middle" fill="#566575">${w[3]}</text>
      <text x="300" y="22" fill="#b4572f">${w[4]}</text><text x="240" y="166" text-anchor="middle" fill="#a12813">${w[5]}</text>
    </svg></div>`;
  }
  function actUpd() {
    const dia = document.getElementById('actDia'); if (!dia) return;
    const a = S.wg * 22 * PI / 180, dx = 100 + 30 * Math.sin(a), jx = 285 + 30 * Math.sin(a), jy = 30 + 30 * Math.cos(a);
    dia.setAttribute('x1', dx); dia.setAttribute('x2', dx);
    const rod = document.getElementById('actRod'); rod.setAttribute('x1', dx); rod.setAttribute('x2', jx); rod.setAttribute('y2', jy);
    let pts = ''; for (let i = 0; i <= 12; i++) pts += (dx + 3 + (166 - dx) * i / 12).toFixed(1) + ',' + (i === 0 || i === 12 ? 60 : (i % 2 ? 38 : 82)) + ' '; document.getElementById('actSp').setAttribute('points', pts);
    const air = document.getElementById('actAir'); air.setAttribute('width', dx - 62); air.setAttribute('opacity', (.12 + .65 * clamp(S.boost / 1.2, 0, 1)).toFixed(2));
    document.getElementById('actArm').setAttribute('transform', 'rotate(' + (-S.wg * 22).toFixed(1) + ' 285 30)');
    document.getElementById('actByp').setAttribute('opacity', S.wg.toFixed(2));
    document.getElementById('actB').textContent = S.boost.toFixed(2) + ' bar';
    const stEl = document.getElementById('actSt'), open = S.wg > .08; stEl.textContent = (open ? '🔓 ' + t('act_o') + ' (' + Math.round(S.wg * 100) + '%)' : '🔒 ' + t('act_c')); stEl.style.color = open ? '#d0261f' : '#188a48';
  }
  const INNER = ['shaft', 'journal', 'thrust', 'collar', 'seals', 'shield', 'compWheel', 'turbWheel', 'backplate', 'nut'];
  function focusPart(id) { if (INNER.indexOf(id) >= 0 && !st.exp) st.cut = true; select(st.sel === id ? null : id); syncTb(); }

  function rParts() {
    const mc = t('mat_cols');
    $('#partsPage').innerHTML = `<h2>${t('parts_h')}</h2><p class="muted">${t('parts_p')}</p>
      <div class="pgrid">${TL.PARTS.map(p => `<div class="pcard" style="--sw:${p.sw}"><h3><span class="no">${p.no}</span>${L(p.n)}</h3><dl><dt>${t('job')}</dt><dd>${L(p.j)}</dd><dt>${t('material')}</dt><dd><b>${L(p.m)}</b></dd>${L(p.w) !== '—' ? `<dt>${t('why')}</dt><dd>${L(p.w)}</dd>` : ''}</dl><button class="btn" data-see="${p.id}">🔍 ${t('see3d')}</button></div>`).join('')}</div>
      <h2 style="margin-top:18px">${t('mat_h')}</h2><div class="tw card" style="padding:0;margin-top:8px"><table><tr>${mc.map(c => `<th>${c}</th>`).join('')}</tr>${TL.PARTS.map(p => `<tr><td><b>${L(p.n)}</b></td><td>${L(p.m)}</td><td class="c">${p.t}</td><td>${L(p.w)}</td></tr>`).join('')}</table></div>`;
    $$('[data-see]').forEach(b => { b.onclick = () => { st.exp = false; show('lab'); st.sel = null; focusPart(b.dataset.see); window.scrollTo(0, 0); }; });
  }

  function rDis() {
    const n = TL.STEPS.length;
    $('#disSide').innerHTML = `<div class="card"><h3>${t('dis_h')}</h3><p class="muted">${t('dis_p')}</p>
      <div class="row" style="margin:8px 0"><button class="btn" id="dPrev" ${st.step <= 0 ? 'disabled' : ''}>${t('prev')}</button><button class="btn pri" id="dNext" ${st.step >= n - 1 ? 'disabled' : ''}>${t('next')}</button><button class="btn" id="dAgain">${t('again')}</button><span class="muted">${st.step + 1} / ${n}</span></div>
      <ol class="steps">${TL.STEPS.map((s, i) => `<li data-step="${i}" class="${i === st.step ? 'cur' : (i < st.step ? 'done' : '')}"><b>${i + 1}. ${L(s.n)}</b><div class="d">${L(s.d)}<br><span class="tool">🧰 ${t('tool')}: ${L(s.t)}</span><br><span class="warn">⚠️ ${t('care')}: ${L(s.c)}</span></div></li>`).join('')}</ol>
      <div class="note green">${t('asm_note')}</div></div>`;
    const go = i => { st.step = clamp(i, 0, n - 1); rDis(); ping(); };
    $('#dPrev').onclick = () => go(st.step - 1); $('#dNext').onclick = () => go(st.step + 1); $('#dAgain').onclick = () => go(0);
    $$('[data-step]').forEach(li => { li.onclick = () => go(+li.dataset.step); });
  }

  /* system schematic */
  const SL = { filter: ['એર ફિલ્ટર', 'एयर फिल्टर', 'Air filter'], comp: ['કમ્પ્રેસર', 'कंप्रेसर', 'Compressor'], ic: ['ઇન્ટરકૂલર', 'इंटरकूलर', 'Intercooler'], engine: ['એન્જિન', 'इंजन', 'Engine'], turb: ['ટર્બાઇન', 'टर्बाइन', 'Turbine'], sil: ['સાયલેન્સર', 'साइलेंसर', 'Silencer'], sump: ['ઓઇલ સમ્પ', 'ऑयल संप', 'Oil sump'], rad: ['રેડિયેટર', 'रेडिएटर', 'Radiator'], chra: 'CHRA' };
  const sysOn = { air: true, exh: true, oil: true, cool: true }; let sysSel = null;
  function rSys() {
    const fl = (cls, col, d) => `<path class="flow" stroke="${col}" d="${d}"/><path class="flow d" d="${d}"/>`;
    const A = '#1f8fe0', E = '#e2452a', O = '#c98a00', C = '#12a594';
    const node = (id, inner, lx, ly, fill) => `<g class="node${sysSel === id ? ' sel' : ''}" data-node="${id}">${inner}<text x="${lx}" y="${ly}" text-anchor="middle" fill="${fill || '#13202c'}">${L(SL[id])}</text></g>`;
    $('#sysPage').innerHTML = `<h2>${t('sys_h')}</h2><p class="muted">${t('sys_p')}</p>
      <div class="row" style="margin:8px 0">${['air', 'exh', 'oil', 'cool'].map(k => `<button class="tb ${k}" data-lay="${k}" aria-pressed="${sysOn[k]}">${t('lay_' + k)}</button>`).join('')}</div>
      <div class="sysbox"><svg viewBox="0 0 760 400" xmlns="http://www.w3.org/2000/svg">
        <g class="lay${sysOn.oil ? '' : ' off'}">${fl('', O, 'M500,330 V300')}${fl('', O, 'M470,180 H284 V217')}${fl('', O, 'M284,253 V306 H448 V355 H470')}<text x="372" y="174" font-size="11" fill="${O}" font-weight="700" text-anchor="middle">OIL FEED ▸</text><text x="386" y="322" font-size="11" fill="${O}" font-weight="700" text-anchor="middle">◂ OIL DRAIN</text></g>
        <g class="lay${sysOn.cool ? '' : ' off'}">${fl('', C, 'M470,208 H300 V217')}${fl('', C, 'M300,253 V283 H470')}${fl('', C, 'M630,170 H680')}${fl('', C, 'M680,280 H630')}<circle cx="655" cy="280" r="12" fill="#fff" stroke="${C}" stroke-width="3"/><text x="655" y="285" font-size="12" font-weight="700" text-anchor="middle" fill="${C}">P</text></g>
        <g class="lay${sysOn.air ? '' : ' off'}">${fl('', A, 'M95,110 V235 H192')}${fl('', '#7a5fe0', 'M230,197 V85 H300')}${fl('', A, 'M420,85 H520 V150')}<text x="246" y="140" font-size="11" fill="#7a5fe0" font-weight="700">150°C</text><text x="470" y="78" font-size="11" fill="${A}" font-weight="700" text-anchor="middle">50°C</text></g>
        <g class="lay${sysOn.exh ? '' : ' off'}">${fl('', E, 'M470,235 H388')}${fl('', '#b0634f', 'M350,273 V330 H150')}${fl('', '#b0634f', 'M40,330 H10')}<text x="430" y="228" font-size="11" fill="${E}" font-weight="700" text-anchor="middle">700°C</text></g>
        <rect x="268" y="230" width="44" height="10" fill="#566575"/>
        ${node('filter', '<rect x="30" y="60" width="130" height="50" rx="8" fill="#eaf5fb" stroke="' + A + '" stroke-width="2"/>', 95, 90)}
        ${node('ic', '<rect x="300" y="60" width="120" height="50" rx="8" fill="#eaf5fb" stroke="' + A + '" stroke-width="2"/><path d="M312 68v34M324 68v34M336 68v34M384 68v34M396 68v34M408 68v34" stroke="' + A + '" opacity=".35"/>', 360, 90)}
        ${node('engine', '<rect x="470" y="150" width="160" height="150" rx="10" fill="#e9edf1" stroke="#566575" stroke-width="2"/>', 550, 260)}
        ${node('sump', '<rect x="470" y="330" width="160" height="50" rx="8" fill="#fcefc7" stroke="' + O + '" stroke-width="2"/><circle cx="500" cy="315" r="12" fill="#fff" stroke="' + O + '" stroke-width="3"/>', 560, 361)}
        ${node('rad', '<rect x="680" y="150" width="62" height="150" rx="8" fill="#d5f3ee" stroke="' + C + '" stroke-width="2"/>', 711, 230)}
        ${node('sil', '<rect x="40" y="310" width="110" height="40" rx="18" fill="#f3e4df" stroke="#b0634f" stroke-width="2"/>', 95, 335)}
        ${node('comp', '<circle cx="230" cy="235" r="38" fill="#dceefb" stroke="' + A + '" stroke-width="3"/>', 230, 240)}
        ${node('turb', '<circle cx="350" cy="235" r="38" fill="#fde2dc" stroke="' + E + '" stroke-width="3"/>', 350, 240)}
        ${node('chra', '<rect x="266" y="217" width="48" height="36" rx="4" fill="#c9ced4" stroke="#566575" stroke-width="2"/>', 290, 240)}
        <text x="500" y="320" font-size="12" font-weight="700" text-anchor="middle" fill="${O}">P</text>
        <text x="550" y="176" font-size="11" text-anchor="middle" fill="#566575">INTAKE ▾</text><text x="496" y="230" font-size="11" fill="#566575">◂ EXH</text>
      </svg></div>
      <div class="card" style="margin-top:10px" id="sysInfo">${sysSel ? `<h3>${L(TL.SYS[sysSel][0])}</h3><p>${L(TL.SYS[sysSel][1])}</p>` : `<p class="muted">${t('sys_tap')}</p>`}</div>
      ${L(TL.SYS_NOTES)}`;
    $$('[data-lay]').forEach(b => { b.onclick = () => { sysOn[b.dataset.lay] = !sysOn[b.dataset.lay]; rSys(); }; });
    $$('[data-node]').forEach(g => { g.onclick = () => { sysSel = g.dataset.node; rSys(); ping(); }; });
  }

  /* failure lab */
  let dialVal = null, dialKind = null;
  function rFault() {
    const f = st.fault, hid = st.hidden;
    $('#faultSide').innerHTML = `<div class="card"><h3>${t('fault_h')}</h3><div class="flist"><button class="chip${!f ? ' on' : ''}" data-f="">${t('fault_none')}</button>${TL.FAULTS.map(x => `<button class="chip${f === x && !hid ? ' on' : ''}" data-f="${x.id}" ${hid ? 'disabled' : ''}>${L(x.n)}</button>`).join('')}</div></div>
      ${f && !hid ? `<div class="card"><h3>⚠️ ${L(f.n)}</h3><p><span class="tag">${t('f_cause')}</span>${L(f.c)}</p><p><span class="tag t-exh">${t('f_sym')}</span>${L(f.s)}</p><p><span class="tag t-oil">${t('f_see')}</span>${L(f.v)}</p><p><span class="tag t-cool">${t('f_fix')}</span>${L(f.f)}</p></div>` : ''}
      <div class="card"><h3>${t('quiz_h')}</h3><p class="muted">${t('quiz_p')}</p><button class="btn pri" id="qGo">${t('quiz_go')}</button><div id="qBox" style="margin-top:8px"></div></div>`;
    $$('[data-f]').forEach(b => { b.onclick = () => { st.fault = TL.FAULTS.find(x => x.id === b.dataset.f) || null; st.hidden = false; st.quiz = null; dialVal = null; if (st.fault) { if (st.thr < 60) setThr(70); if (st.fault.sim.coke || st.fault.sim.oilMul < .5) { st.oil = true; st.cut = true; syncTb(); } } rFault(); ping(); }; });
    $('#qGo').onclick = () => { const pool = TL.FAULTS.slice(), c = pool[Math.floor(Math.random() * pool.length)]; const opts = [c]; while (opts.length < 4) { const o = pool[Math.floor(Math.random() * pool.length)]; if (opts.indexOf(o) < 0) opts.push(o); } opts.sort(() => Math.random() - .5); st.fault = c; st.hidden = true; st.quiz = { c, opts, done: null }; dialVal = null; if (st.thr < 60) setThr(75); rFault(); ping(); };
    if (st.quiz) {
      const q = st.quiz;
      $('#qBox').innerHTML = `<p><span class="tag t-exh">${t('f_sym')}</span>${L(q.c.s)}</p><div class="q" style="padding:0;border:0"><div class="opts">${q.opts.map((o, i) => `<button data-qo="${i}" class="${q.done !== null ? (o === q.c ? 'right' : (i === q.done ? 'wrong' : '')) : ''}" ${q.done !== null ? 'disabled' : ''}>${L(o.n)}</button>`).join('')}</div></div>${q.done !== null ? `<p class="${q.opts[q.done] === q.c ? 'res-ok' : 'res-bad'}">${q.opts[q.done] === q.c ? t('quiz_ok') : t('quiz_no') + ' ' + L(q.c.n)}</p>` : ''}`;
      $$('[data-qo]').forEach(b => { b.onclick = () => { q.done = +b.dataset.qo; st.hidden = false; rFault(); ping(); }; });
    }
    const tc = t('test_cols'), lim = dialKind === 'ax' ? [.03, .10] : [.30, .60];
    const ok = dialVal !== null && dialVal >= lim[0] && dialVal <= lim[1];
    const ang = dialVal === null ? -150 : -150 + clamp(dialVal, 0, 1) * 300;
    let ticks = ''; for (let i = 0; i <= 10; i++) { const a = (-150 + i * 30 - 90) * PI / 180; ticks += `<line x1="${75 + 54 * Math.cos(a)}" y1="${75 + 54 * Math.sin(a)}" x2="${75 + 62 * Math.cos(a)}" y2="${75 + 62 * Math.sin(a)}" stroke="#13202c" stroke-width="2"/><text x="${75 + 44 * Math.cos(a)}" y="${79 + 44 * Math.sin(a)}" font-size="9" text-anchor="middle">${(i / 10).toFixed(1)}</text>`; }
    $('#faultPage').innerHTML = `<div class="card" style="margin-top:12px"><h3>${t('dial_h')}</h3><p class="muted">${t('dial_p')}</p>
      <div class="dial"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="70" fill="#fff" stroke="#13202c" stroke-width="4"/>${ticks}<text x="75" y="112" font-size="10" text-anchor="middle" fill="#566575">mm</text><line x1="75" y1="75" x2="75" y2="22" stroke="#d0261f" stroke-width="3" stroke-linecap="round" transform="rotate(${ang} 75 75)"/><circle cx="75" cy="75" r="5" fill="#13202c"/></svg>
      <div><div class="row"><button class="btn${dialKind === 'ax' ? ' pri' : ''}" data-dial="ax">${t('ax')}</button><button class="btn${dialKind === 'rad' ? ' pri' : ''}" data-dial="rad">${t('rad')}</button></div>
      ${dialVal !== null ? `<p style="font-size:20px;margin:10px 0 2px"><b>${dialVal.toFixed(2)} mm</b></p><p class="muted">${t('limit')}: ${lim[0].toFixed(2)} – ${lim[1].toFixed(2)} mm</p><p class="${ok ? 'res-ok' : 'res-bad'}">${ok ? t('ok') : t('notok')}</p>` : ''}</div></div></div>
      <div class="card" style="margin-top:12px"><h3>${t('test_h')}</h3><div class="tw"><table><tr>${tc.map(c => `<th>${c}</th>`).join('')}</tr>${TL.TESTS.map(r => `<tr><td><b>${L(r[0])}</b></td><td>${L(r[1])}</td><td>${L(r[2])}</td><td>${L(r[3])}</td></tr>`).join('')}</table></div></div>`;
    $$('[data-dial]').forEach(b => { b.onclick = () => { dialKind = b.dataset.dial; const fx = F(); dialVal = Math.max(.01, (dialKind === 'ax' ? fx.ax : fx.rad) + (Math.random() - .5) * .02); rFault(); ping(); }; });
  }

  function rTheory() {
    const open = $$('#theoryPage details').map(d => d.open);
    $('#theoryPage').innerHTML = `<h2 style="margin-bottom:10px">${t('th_h')}</h2>` + TL.THEORY.map((s, i) => `<details class="th" ${(open.length ? open[i] : i === 0) ? 'open' : ''}><summary>${L(s.h)}</summary><div>${L(s.b)}${s.fig ? `<div class="fig">${TL.figTurbo()}<div class="cap">${t('fig1')}</div><div class="legend">${TL.FIG_LEGEND.map((x, j) => `<span><b>${j + 1}</b> = ${L(x)}</span>`).join('')}</div></div>` : ''}${s.svg === 'vgt' ? `<div class="fig">${TL.figVGT(lang)}</div>` : ''}</div></details>`).join('');
    $$('#theoryPage details').forEach(d => d.addEventListener('toggle', ping));
  }

  const ans = {};
  function rMcq() {
    const done = Object.keys(ans).length, right = TL.MCQ.filter((q, i) => ans[i] === q.a).length;
    $('#mcqPage').innerHTML = `<h2 style="margin-bottom:10px">${t('mcq_h')} (${TL.MCQ.length})</h2><div class="score"><span>${t('score')}: ${right} / ${done} &nbsp;·&nbsp; ${done} / ${TL.MCQ.length}</span><button id="mReset">↺ ${t('reset')}</button></div>` +
      TL.MCQ.map((q, i) => `<div class="q">${q.fig ? `<div class="muted">${t('see_fig')}</div><div class="fig">${TL.figTurbo()}</div>` : ''}<div class="qt">${i + 1}. ${L(q.q)}</div><div class="opts">${q.o.map((o, j) => `<button data-q="${i}" data-o="${j}" class="${ans[i] !== undefined ? (j === q.a ? 'right' : (ans[i] === j ? 'wrong' : '')) : ''}" ${ans[i] !== undefined ? 'disabled' : ''}>${'ABCD'[j]}. ${L(o)}</button>`).join('')}</div>${ans[i] !== undefined ? `<div class="ex">${ans[i] === q.a ? '✅' : '❌'} ${L(q.e)}</div>` : ''}</div>`).join('');
    $$('[data-q]').forEach(b => { b.onclick = () => { const y = window.scrollY; ans[+b.dataset.q] = +b.dataset.o; rMcq(); window.scrollTo(0, y); ping(); }; });
    $('#mReset').onclick = () => { Object.keys(ans).forEach(k => delete ans[k]); rMcq(); };
  }

  /* ---------------- language / full screen / embed height ---------------- */
  const app = $('#app');
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement) || document.body.classList.contains('fsx');
  function fsLabel() { $('#fsBtn').textContent = t(isFs() ? 'fs_off' : 'fs_on'); }
  $('#fsBtn').onclick = () => {
    if (isFs()) { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); document.body.classList.remove('fsx'); fsLabel(); ping(); return; }
    const rq = app.requestFullscreen || app.webkitRequestFullscreen; const fb = () => { document.body.classList.add('fsx'); fsLabel(); };
    if (rq) { try { const r = rq.call(app); if (r && r.catch) r.catch(fb); } catch (e) { fb(); } } else fb();
    setTimeout(() => { if (!isFs()) fb(); fsLabel(); }, 350);
  };
  document.addEventListener('fullscreenchange', () => { fsLabel(); resize(); ping(); }); document.addEventListener('webkitfullscreenchange', () => { fsLabel(); resize(); });
  function setLang(i) {
    lang = i; try { localStorage.setItem('tl_lang', String(i)); } catch (e) { /* ignore */ }
    document.documentElement.lang = ['gu', 'hi', 'en'][i];
    $$('#langSeg button').forEach(b => b.setAttribute('aria-checked', +b.dataset.lang === i));
    $$('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
    fsLabel(); buildTabs(); buildGauges(); Object.keys(lblEl).forEach(k => { lblEl[k].textContent = ''; });
    show(st.view); if (st.sel) select(st.sel); if (st.tour >= 0) tour(st.tour);
  }
  $$('#langSeg button').forEach(b => { b.onclick = () => setLang(+b.dataset.lang); });

  let lastH = 0;
  function ping() {
    if (window.parent === window) return;
    setTimeout(() => { if (isFs()) return; const ft = $('#foot'); const h = Math.ceil(ft.getBoundingClientRect().bottom + (window.scrollY || 0) + 8); if (Math.abs(h - lastH) > 4) { lastH = h; try { window.parent.postMessage({ dmHeight: h }, '*'); } catch (e) { /* ignore */ } } }, 60);
  }
  if (window.parent !== window) { window.addEventListener('load', ping); if (window.ResizeObserver) new ResizeObserver(ping).observe(app); document.addEventListener('click', ping); }

  /* ---------------- start ---------------- */
  const h0 = (location.hash || '').slice(1); if (TABS.indexOf(h0) >= 0) st.view = h0;
  window.addEventListener('hashchange', () => { const h = (location.hash || '').slice(1); if (TABS.indexOf(h) >= 0 && h !== st.view) show(h); });
  setLang(lang); setThr(35); resize(); requestAnimationFrame(tick);
  TL.dbg = { st, S, orb, show, select, tour };
})();
