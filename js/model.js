/* Turbocharger Lab — 3D model (Three.js r149). Shaft axis = X. Compressor at -X (cold), turbine at +X (hot).
   Cut section keeps the half with z <= 0, so the viewer at +z looks at the cut face. */
(function () {
  const TL = window.TL;
  const V3 = THREE.Vector3, PI = Math.PI, TAU = PI * 2;
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  const M = TL.M = { parts: {}, list: [] };

  function hatch(base) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 32, 32); g.strokeStyle = 'rgba(0,0,0,.38)'; g.lineWidth = 2;
    for (let i = -32; i < 64; i += 8) { g.beginPath(); g.moveTo(i, 32); g.lineTo(i + 32, 0); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.encoding = THREE.sRGBEncoding; return t;
  }
  const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, metalness: .45, roughness: .5, side: THREE.DoubleSide }, o));
  const capMat = (css) => new THREE.MeshStandardMaterial({ map: hatch(css), metalness: .1, roughness: .8, side: THREE.DoubleSide });

  /* closed profile [[r, a], ...] revolved round the X axis (or Y when axis === 'y'); cut = half + hatched caps */
  function lathe(profile, m, cm, cut, axis, smooth) {
    const g = new THREE.Group();
    const pts = profile.map(p => new THREE.Vector2(Math.max(p[0], 0.0001), p[1])); pts.push(pts[0].clone());
    let geo = new THREE.LatheGeometry(pts, cut ? 30 : 60, cut ? PI / 2 : 0, cut ? PI : TAU);
    if (!smooth) { geo = geo.toNonIndexed(); geo.computeVertexNormals(); }
    g.add(new THREE.Mesh(geo, m));
    if (cut && cm) {
      const sh = new THREE.Shape(profile.map(p => new THREE.Vector2(p[0], p[1])));
      const cg = new THREE.ShapeGeometry(sh);
      const a = new THREE.Mesh(cg, cm), b = new THREE.Mesh(cg, cm); b.scale.x = -1; g.add(a, b);
    }
    if (axis !== 'y') g.rotation.z = -PI / 2;
    return g;
  }
  const tubeY = (r, w, y0, y1) => [[r, y0], [r + w, y0], [r + w, y1], [r, y1]];

  /* volute (snail) shell */
  function Volute(o) {
    const rOf = s => o.r0 + (o.r1 - o.r0) * s;
    const fr = s => { const r = rOf(s); return { r, Rc: o.slotR + .75 * r, xc: o.slotX + o.sx * .66 * r, psi0: Math.atan2(-o.sx * .66, -.75), gap: Math.asin(Math.min(.95, o.slotW / 2 / r)) }; };
    const th = s => o.th0 + o.dir * TAU * s;
    const pt = (s, psi, extra) => { const f = fr(s), rho = f.r + extra, t = th(s), R = f.Rc + rho * Math.cos(psi); return [f.xc + rho * Math.sin(psi), R * Math.cos(t), R * Math.sin(t)]; };
    this.centre = (s, out) => { const f = fr(s), t = th(s); return (out || new V3()).set(f.xc, f.Rc * Math.cos(t), f.Rc * Math.sin(t)); };
    this.r = rOf; this.th = th; this.o = o;
    function grid(fn, N, Mm, uvFn) {
      const pos = [], idx = [], uv = [];
      for (let i = 0; i <= N; i++) for (let j = 0; j <= Mm; j++) { const p = fn(i / N, j / Mm); pos.push(p[0], p[1], p[2]); if (uvFn) { const q = uvFn(i / N, j / Mm); uv.push(q[0], q[1]); } }
      for (let i = 0; i < N; i++) for (let j = 0; j < Mm; j++) { const a = i * (Mm + 1) + j, b = a + Mm + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvFn) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    const psiAt = (s, v) => { const f = fr(s); return f.psi0 + f.gap + (TAU - 2 * f.gap) * v; };
    /* solid body of gas filling the passage */
    this.fill = function (cut, m) {
      const g = new THREE.Group();
      (cut ? [[0, .25], [.75, 1]] : [[0, 1]]).forEach(([a, b]) => { g.add(new THREE.Mesh(grid((u, v) => { const s = a + (b - a) * u; return pt(s, v * TAU, -fr(s).r * .06); }, Math.ceil(110 * (b - a)), 20, (u, v) => [v, (a + (b - a) * u) * 12]), m)); });
      if (cut) [.25, .75].forEach(s => g.add(new THREE.Mesh(grid((u, v) => pt(s, v * TAU, -fr(s).r * (1 - .94 * u)), 1, 20, () => [0, s * 12]), m)));
      return g;
    };
    this.build = function (cut, m, cm) {
      const g = new THREE.Group();
      const ranges = cut ? [[0, .25], [.75, 1]] : [[0, 1]];
      ranges.forEach(([a, b]) => {
        const N = Math.ceil(110 * (b - a));
        [0, o.wall].forEach(ex => g.add(new THREE.Mesh(grid((u, v) => { const s = a + (b - a) * u; return pt(s, psiAt(s, v), ex); }, N, 26), m)));
      });
      if (cut) [.25, .75].forEach(s => g.add(new THREE.Mesh(grid((u, v) => pt(s, psiAt(s, v), u * o.wall), 1, 26), cm)));
      // small end cap (tongue)
      g.add(new THREE.Mesh(grid((u, v) => pt(0, psiAt(0, v), -fr(0).r * (1 - u)), 1, 26), m));
      return g;
    };
  }

  const bez = (p0, p1, p2, u) => [(1 - u) * (1 - u) * p0[0] + 2 * u * (1 - u) * p1[0] + u * u * p2[0], (1 - u) * (1 - u) * p0[1] + 2 * u * (1 - u) * p1[1] + u * u * p2[1]];
  /* blades between hub and shroud curves ([r, x] beziers). phi(u, v) = wrap angle. Returns {geo, per-blade vertex ranges} */
  function blades(list, hub, shr, phi) {
    const NU = 16, NV = 5, pos = [], idx = []; let base = 0;
    list.forEach(bl => {
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
        const u = bl.u0 + (1 - bl.u0) * i / NU, v = j / NV * (bl.h || 1);
        const h = bez(hub[0], hub[1], hub[2], u), s = bez(shr[0], shr[1], shr[2], u);
        const r = h[0] + (s[0] - h[0]) * v, x = h[1] + (s[1] - h[1]) * v, a = bl.a + phi(u, v);
        pos.push(x, r * Math.cos(a), r * Math.sin(a));
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = base + i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      base += (NU + 1) * (NV + 1);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function cylX(r, x0, x1, m, seg) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), seg || 28), m); c.rotation.z = -PI / 2; c.position.x = (x0 + x1) / 2; return c; }
  function pipe(pts, r, m) { const c = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2]))); return new THREE.Mesh(new THREE.TubeGeometry(c, 40, r, 14, false), m); }
  function halfTorus(R, t, x, m, cut) { const g = new THREE.Group(); const me = new THREE.Mesh(new THREE.TorusGeometry(R, t, 10, cut ? 40 : 80, cut ? PI : TAU), m); me.rotation.y = PI / 2; g.add(me); g.rotation.x = -PI / 2; g.position.x = x; return g; }

  function reg(id, o) {
    const holder = new THREE.Group(), spin = new THREE.Group(); holder.add(spin);
    const p = Object.assign({ id, holder, spin, full: new THREE.Group(), cutG: null, mats: [], explode: new V3(), anchor: new V3(), spins: false }, o);
    spin.add(p.full); if (p.cutG) { spin.add(p.cutG); p.cutG.visible = false; }
    holder.traverse(n => { if (n.isMesh) { n.userData.part = id; if (p.mats.indexOf(n.material) < 0) p.mats.push(n.material); } });
    p.mats.forEach(m => { m.userData.em = m.emissive ? m.emissive.clone() : null; });
    M.parts[id] = p; M.list.push(p); M.root.add(holder); return p;
  }
  /* build a part twice (full + cut) from one builder fn(cut) */
  const both = fn => ({ full: fn(false), cutG: fn(true) });

  M.build = function () {
    const root = M.root = new THREE.Group();
    // ---------- compressor housing ----------
    const mAl = mat(0xc3ccd6, { metalness: .55, roughness: .42 }), cAl = capMat('#dfe6ee');
    const mRing = mat(0xd4d8dc, { metalness: .85, roughness: .25 });
    const cv = M.cVol = new Volute({ th0: 1.5 * PI, dir: 1, r0: .14, r1: .42, slotR: 1.55, slotX: -1.21, sx: -1, slotW: .18, wall: .05 });
    const cEnd = cv.centre(1);
    reg('compHousing', Object.assign(both(cut => {
      const g = new THREE.Group();
      g.add(lathe([[.75, -3.0], [.73, -1.95], [.73, -1.9], [.78, -1.62], [.93, -1.4], [1.1, -1.31], [1.55, -1.3], [1.55, -1.36], [1.2, -1.42], [1.02, -1.72], [.95, -2.1], [.95, -2.86], [1.0, -2.88], [1.0, -3.0]], mAl, cAl, cut));
      g.add(cv.build(cut, mAl, cAl));
      g.add(halfTorus(1.76, .05, -1.05, mRing, cut));
      { // boost nipple for the actuator hose
        const d = new V3(0, .982, -.187).normalize(), nip = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .2, 14), mat(0xc9a227, { metalness: .7, roughness: .35 }));
        nip.quaternion.setFromUnitVectors(new V3(0, 1, 0), d); nip.position.set(-1.343, 1.918, -.365).addScaledVector(d, .06); g.add(nip);
      }
      const out = lathe([[.42, 0], [.47, 0], [.47, 2.3], [.52, 2.32], [.52, 2.6], [.42, 2.6]], mAl, null, false, 'y'); out.position.set(cEnd.x, 0, cEnd.z); g.add(out);
      return g;
    }), { explode: new V3(-3.6, 0, 0), anchor: new V3(-2.3, 1.35, 0) }));

    // ---------- compressor wheel ----------
    const mCw = mat(0xe8edf2, { metalness: .6, roughness: .28 });
    const cHub = [[.18, -1.9], [.2, -1.25], [1.03, -1.21]], cShr = [[.68, -1.9], [.7, -1.33], [1.03, -1.29]];
    const cList = []; for (let i = 0; i < 12; i++) cList.push({ a: i * TAU / 12, u0: i % 2 ? .38 : 0 });
    const cPhi = (u, v) => .75 * Math.pow(1 - u, 2) * (.5 + .9 * v) - .55 * u * u;
    {
      const g = new THREE.Group(); const prof = [[0, -1.93], [.17, -1.93]]; for (let i = 0; i <= 14; i++) prof.push(bez(cHub[0], cHub[1], cHub[2], i / 14)); prof.push([1.03, -1.15], [0, -1.15]);
      g.add(lathe(prof, mCw, null, false, 'x', true));
      const bg = new THREE.Mesh(blades(cList, cHub, cShr, cPhi), mCw); g.add(bg);
      const dmg = cList.map((b, i) => (i === 2 || i === 3 || i === 8) ? Object.assign({}, b, { u0: i % 2 ? .6 : .34 }) : b);
      const bd = new THREE.Mesh(blades(dmg, cHub, cShr, cPhi), mCw); bd.visible = false; g.add(bd);
      const p = reg('compWheel', { full: g, explode: new V3(-1.9, 0, 0), anchor: new V3(-1.55, .55, .4), spins: true }); p.blOK = bg; p.blBad = bd;
    }
    // ---------- lock nut ----------
    {
      const g = new THREE.Group(); const n = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .13, 6), mat(0x8d949c, { metalness: .7, roughness: .35 })); n.rotation.z = PI / 2; n.position.x = -2.0; g.add(n);
      reg('nut', { full: g, explode: new V3(-2.3, 0, 0), anchor: new V3(-2.02, 0, .2), spins: true });
    }
    // ---------- back plate ----------
    const mBp = mat(0xb4bdc7, { metalness: .5, roughness: .5 });
    reg('backplate', Object.assign(both(cut => lathe([[.21, -1.12], [1.72, -1.12], [1.72, -.97], [.21, -.97]], mBp, capMat('#cfd6de'), cut)), { explode: new V3(-1.35, 0, 0), anchor: new V3(-1.05, -1.5, 0) }));

    // ---------- bearing housing (CHRA body) ----------
    const mCh = mat(0x858b93, { metalness: .35, roughness: .62 }), cCh = capMat('#aeb4bb');
    const oilX = -.15, coolX = .42;
    reg('chra', Object.assign(both(cut => {
      const g = new THREE.Group();
      g.add(lathe([[.34, -.95], [.34, -.6], [.17, -.6], [.17, .62], [.125, .62], [.125, .86], [.97, .86], [.97, .72], [.62, .66], [.62, -.55], [.75, -.78], [1.2, -.8], [1.2, -.95]], mCh, cCh, cut));
      const top = lathe(tubeY(.07, .1, .58, .95), mCh, cCh, cut, 'y'); top.position.x = oilX; g.add(top);
      const bot = lathe(tubeY(.15, .1, -.95, -.58), mCh, cCh, cut, 'y'); bot.position.x = oilX; g.add(bot);
      const c1 = lathe(tubeY(.05, .07, .58, .8), mCh, cCh, cut, 'y'); c1.position.x = coolX; g.add(c1);
      const c2 = lathe(tubeY(.05, .07, -.8, -.58), mCh, cCh, cut, 'y'); c2.position.x = coolX; g.add(c2);
      return g;
    }), { explode: new V3(0, 0, 0), anchor: new V3(-.05, -.62, .45) }));

    // ---------- shaft (one piece with turbine wheel) ----------
    const mSh = mat(0xb8bcc2, { metalness: .75, roughness: .3 });
    {
      const g = new THREE.Group(); g.add(cylX(.085, -2.06, -.62, mSh), cylX(.105, -.62, 1.0, mSh));
      reg('shaft', { full: g, explode: new V3(2.2, 0, 0), anchor: new V3(.2, 0, .15), spins: true });
    }
    // ---------- journal bearings ----------
    const mBr = mat(0xc98a3c, { metalness: .6, roughness: .4 }), cBr = capMat('#e3ab5f');
    reg('journal', Object.assign(both(cut => { const g = new THREE.Group(); g.add(lathe([[.118, -.5], [.165, -.5], [.165, -.22], [.118, -.22]], mBr, cBr, cut), lathe([[.118, .25], [.165, .25], [.165, .53], [.118, .53]], mBr, cBr, cut)); return g; }),
      { explode: new V3(0, -1.5, 0), anchor: new V3(.39, -.17, .1) }));
    // ---------- thrust bearing ----------
    const mTb = mat(0xd39a45, { metalness: .6, roughness: .4 });
    reg('thrust', Object.assign(both(cut => lathe([[.13, -.79], [.33, -.79], [.33, -.71], [.13, -.71]], mTb, capMat('#eebb6c'), cut)), { explode: new V3(-.5, 0, 0), anchor: new V3(-.75, .3, .12) }));
    // ---------- thrust collar + oil deflector (rotate) ----------
    {
      const g = new THREE.Group(), m = mat(0x9aa1a9, { metalness: .7, roughness: .35 });
      g.add(lathe([[.105, -.7], [.27, -.7], [.27, -.63], [.105, -.63]], m, null, false), lathe([[.1, -.93], [.3, -.93], [.3, -.86], [.2, -.8], [.1, -.8]], m, null, false));
      reg('collar', { full: g, explode: new V3(-.95, 0, 0), anchor: new V3(-.88, -.3, .15), spins: true });
    }
    // ---------- piston ring seals ----------
    {
      const g = new THREE.Group(), m = mat(0x2c343c, { metalness: .5, roughness: .5 });
      g.add(lathe([[.1, .72], [.128, .72], [.128, .78], [.1, .78]], m, null, false), lathe([[.1, -1.09], [.205, -1.09], [.205, -1.03], [.1, -1.03]], m, null, false));
      reg('seals', { full: g, explode: new V3(0, 1.3, 0), anchor: new V3(.75, .14, .1) });
    }
    // ---------- heat shield ----------
    const mHs = mat(0xc7ccd1, { metalness: .8, roughness: .3 });
    reg('shield', Object.assign(both(cut => lathe([[.2, .9], [.9, .9], [.955, .965], [.93, .975], [.88, .93], [.2, .93]], mHs, capMat('#e6eaee'), cut)), { explode: new V3(.75, 0, 0), anchor: new V3(.93, -.8, .3) }));

    // ---------- turbine wheel ----------
    const mTw = mat(0xa3927c, { metalness: .65, roughness: .38 });
    const tHub = [[.92, 1.0], [.24, 1.04], [.2, 1.75]], tShr = [[.92, 1.2], [.62, 1.24], [.62, 1.75]];
    const tList = []; for (let i = 0; i < 11; i++) tList.push({ a: i * TAU / 11, u0: 0 });
    const tPhi = (u, v) => -.95 * u * u * (.45 + .8 * v);
    {
      const g = new THREE.Group(); const prof = [[0, .98], [.92, .98]]; for (let i = 0; i <= 14; i++) prof.push(bez(tHub[0], tHub[1], tHub[2], i / 14)); prof.push([.14, 1.82], [0, 1.82]);
      g.add(lathe(prof, mTw, null, false, 'x', true));
      const hex = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .12, 6), mTw); hex.rotation.z = PI / 2; hex.position.x = 1.87; g.add(hex);
      const bg = new THREE.Mesh(blades(tList, tHub, tShr, tPhi), mTw); g.add(bg);
      const dmg = tList.map((b, i) => (i === 1 || i === 5 || i === 6) ? Object.assign({}, b, { u0: .3, h: .7 }) : b);
      const bd = new THREE.Mesh(blades(dmg, tHub, tShr, tPhi), mTw); bd.visible = false; g.add(bd);
      const p = reg('turbWheel', { full: g, explode: new V3(2.2, 0, 0), anchor: new V3(1.45, -.5, .4), spins: true }); p.blOK = bg; p.blBad = bd;
    }
    // ---------- turbine housing ----------
    const mTh = mat(0x6b4a3a, { metalness: .25, roughness: .82, emissive: 0x000000 }), cTh = capMat('#a0745c');
    const tv = M.tVol = new Volute({ th0: 1.5 * PI, dir: -1, r0: .14, r1: .45, slotR: .97, slotX: 1.09, sx: 1, slotW: .22, wall: .07 });
    const tEnd = tv.centre(1);
    const wgY = 1.05;
    reg('turbHousing', Object.assign(both(cut => {
      const g = new THREE.Group();
      g.add(lathe([[.97, 1.2], [.75, 1.48], [.655, 1.78], [.655, 2.9], [.8, 2.9], [.8, 1.86], [.92, 1.56], [1.05, 1.32], [1.05, 1.2]], mTh, cTh, cut));
      g.add(lathe([[.97, .86], [1.12, .86], [1.12, .99], [.97, .99]], mTh, cTh, cut));
      g.add(tv.build(cut, mTh, cTh));
      const inl = lathe([[.45, -1.5], [.52, -1.5], [.52, 0], [.45, 0]], mTh, null, false, 'y'); inl.position.set(tEnd.x, 0, tEnd.z); g.add(inl);
      // inlet flange with hole
      const s = new THREE.Shape(); const a = .78; s.moveTo(-a, -a); s.lineTo(a, -a); s.lineTo(a, a); s.lineTo(-a, a); s.closePath();
      const h = new THREE.Path(); h.absarc(0, 0, .45, 0, TAU, true); s.holes.push(h);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(q => { const b = new THREE.Path(); b.absarc(q[0] * .6, q[1] * .6, .07, 0, TAU, true); s.holes.push(b); });
      const fl = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: false }), mTh); fl.rotation.x = PI / 2; fl.position.set(tEnd.x, -1.5, tEnd.z); g.add(fl);
      // wastegate port stub + pivot bracket
      const port = lathe([[.13, 1.6], [.18, 1.6], [.18, 1.95], [.13, 1.95]], mTh, cTh, cut); port.position.y = wgY; g.add(port);
      const post = new THREE.Mesh(new THREE.BoxGeometry(.24, .8, .1), mTh); post.position.set(1.88, 1.93, -.12); g.add(post);
      return g;
    }), { explode: new V3(3.8, 0, 0), anchor: new V3(1.35, -1.55, 0) }));

    // ---------- wastegate flap + lever (pivot at top) ----------
    {
      const g = new THREE.Group(), m = mat(0xb4572f, { metalness: .5, roughness: .5 });
      const piv = M.wgPivot = new THREE.Group(); piv.position.set(1.99, 2.3, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.06, 1.32, .09), m); arm.position.y = -.64; piv.add(arm);
      const flap = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .05, 24), m); flap.rotation.z = PI / 2; flap.position.set(0, wgY - 2.3, 0); piv.add(flap);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .34, 12), m); pin.rotation.x = PI / 2; piv.add(pin);
      g.add(piv);
      reg('wgate', { full: g, explode: new V3(3.8, 0, 0), anchor: new V3(2.05, 1.05, .15) });
    }
    // ---------- actuator + rod (diaphragm, spring and pressure chamber inside) ----------
    {
      const m = mat(0xc9a227, { metalness: .6, roughness: .4 }), ms = mat(0x9aa1a9, { metalness: .7, roughness: .35 }), cA = capMat('#e9cc62');
      const ay = 1.95, mHose = mat(0x20262c, { metalness: .1, roughness: .9 });
      const p = reg('actuator', Object.assign(both(cut => {
        const g = new THREE.Group();
        const can = lathe([[.05, -.62], [.36, -.62], [.36, -.2], [.05, -.2], [.05, -.23], [.33, -.23], [.33, -.59], [.05, -.59]], m, cA, cut); can.position.y = ay; g.add(can);
        const lip = lathe([[.36, -.44], [.4, -.44], [.4, -.38], [.36, -.38]], m, cA, cut); lip.position.y = ay; g.add(lip);
        const br = new THREE.Mesh(new THREE.BoxGeometry(.08, .5, .3), ms); br.position.set(-.66, 1.6, -.2); g.add(br);
        const br2 = new THREE.Mesh(new THREE.BoxGeometry(.4, .08, .3), ms); br2.position.set(-.86, 1.4, -.2); g.add(br2);
        g.add(pipe([[-.62, ay, 0], [-.9, 2.06, -.05], [-1.2, 2.2, -.25], [-1.335, 2.15, -.37], [-1.343, 2.0, -.381]], .045, mHose));
        return g;
      }), { explode: new V3(-.3, 1.5, 0), anchor: new V3(-.4, 2.0, .36) }));
      const mv = M.wgMove = new THREE.Group();
      const dia = cylX(.325, -.515, -.485, mat(0x1d2126, { metalness: .05, roughness: .95 }), 32); dia.position.y = ay;
      const rod = cylX(.03, -.5, 1.99, ms, 10); rod.position.y = ay; mv.add(dia, rod);
      const hp = []; for (let k = 0; k <= 140; k++) { const t = k / 140, a = t * TAU * 7; hp.push(new V3(t, .2 * Math.cos(a), .2 * Math.sin(a))); }
      const spG = M.wgSpringG = new THREE.Group(); spG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 220, .022, 6, false), mat(0xe8eef4, { metalness: .8, roughness: .25 }))); spG.position.set(-.485, ay, 0); spG.scale.x = .255;
      const aM = M.wgAirMat = new THREE.MeshBasicMaterial({ color: 0x35a7ff, transparent: true, opacity: .2, depthWrite: false });
      const aG = M.wgAirG = new THREE.Group(); aG.add(cylX(.322, 0, 1, aM, 24)); aG.position.set(-.59, ay, 0); aG.scale.x = .075;
      [mv, spG, aG].forEach(x => { x.traverse(n => { if (n.isMesh) n.userData.part = 'actuator'; }); p.spin.add(x); });
    }
    // ---------- V-band clamp ----------
    const mCl = mat(0xd4d8dc, { metalness: .85, roughness: .25 });
    reg('clamp', Object.assign(both(cut => { const g = new THREE.Group(); g.add(halfTorus(1.07, .07, .86, mCl, cut)); return g; }), { explode: new V3(1.35, 0, 0), anchor: new V3(.86, 1.12, 0) }));

    // ---------- pipes ----------
    const mOi = mat(0xe0a800, { metalness: .6, roughness: .35 }), mOo = mat(0xa87400, { metalness: .6, roughness: .4 }), mCo = mat(0x12a594, { metalness: .5, roughness: .4 });
    const P = M.paths = {};
    P.feed = [[oilX, 2.6, -1.15], [oilX, 1.7, -.95], [oilX, 1.32, -.5], [oilX, 1.1, -.08], [oilX, .95, 0]];
    P.drain = [[oilX, -.95, 0], [oilX, -1.5, 0], [oilX, -2.1, -.15], [oilX, -2.7, -.5]];
    P.cin = [[coolX, -2.6, -.9], [coolX, -1.6, -.5], [coolX, -1.05, -.08], [coolX, -.8, 0]];
    P.cout = [[coolX, .8, 0], [coolX, 1.05, -.08], [coolX, 1.3, -.5], [coolX, 1.7, -.95], [coolX, 2.6, -1.15]];
    {
      const g = new THREE.Group(); g.add(pipe(P.feed, .06, mOi)); const bj = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .1, 6), mOi); bj.position.set(oilX, .99, 0); g.add(bj);
      reg('oilIn', { full: g, explode: new V3(0, 1.1, 0), anchor: new V3(oilX, 1.5, -.7) });
      const g2 = new THREE.Group(); g2.add(pipe(P.drain, .15, mOo)); reg('oilOut', { full: g2, explode: new V3(0, -1.0, 0), anchor: new V3(oilX, -1.7, .1) });
      const g3 = new THREE.Group(); g3.add(pipe(P.cin, .055, mCo), pipe(P.cout, .055, mCo));
      [-.83, .83].forEach(y => { const b = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .08, 6), mCo); b.position.set(coolX, y, 0); g3.add(b); });
      reg('coolant', { full: g3, explode: new V3(.9, 0, -1.3), anchor: new V3(coolX, -1.5, -.4) });
    }

    // ---------- internal oil galleries + water jacket (shown with the oil / coolant layers) ----------
    const gal = M.gallery = new THREE.Group(), mG = new THREE.MeshBasicMaterial({ color: 0xffc21a });
    M.galMat = mG;
    const seg = (a, b, r, m) => { const A = new V3(a[0], a[1], a[2] || 0), B = new V3(b[0], b[1], b[2] || 0), d = B.clone().sub(A); const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m); c.position.copy(A).add(B).multiplyScalar(.5); c.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return c; };
    const J = [oilX, .42];
    P.oil = [
      [[oilX, .6], J, [-.36, .42], [-.36, .17], [-.36, 0, -.17], [-.36, -.17], [-.3, -.45], [oilX, -.58]],
      [[oilX, .6], J, [.39, .42], [.39, .17], [.39, 0, -.17], [.39, -.17], [.2, -.45], [oilX, -.58]],
      [[oilX, .6], J, [-.6, .42], [-.75, .3], [-.75, 0, -.3], [-.75, -.3], [-.45, -.5], [oilX, -.58]]
    ];
    [[[oilX, .6], J], [[-.6, .42], [.39, .42]], [[-.36, .42], [-.36, .17]], [[.39, .42], [.39, .17]], [[-.6, .42], [-.75, .3]], [[-.36, -.17], [-.3, -.45]], [[.39, -.17], [.2, -.45]], [[-.75, -.3], [-.45, -.5]], [[-.45, -.5], [oilX, -.58]], [[.2, -.45], [oilX, -.58]], [[-.3, -.45], [oilX, -.58]]]
      .forEach(s => gal.add(seg(s[0], s[1], .035, mG)));
    gal.visible = false; root.add(gal);
    const jk = M.jacket = new THREE.Group(), mJ = new THREE.MeshBasicMaterial({ color: 0x2fd3c0 });
    M.jkFull = halfTorus(.44, .085, coolX, mJ, false); M.jkHalf = halfTorus(.44, .085, coolX, mJ, true); jk.add(M.jkFull, M.jkHalf); jk.add(seg([coolX, .44], [coolX, .6], .05, mJ), seg([coolX, -.44], [coolX, -.6], .05, mJ));
    jk.visible = false; root.add(jk);
    P.jacketR = .44; P.coolX = coolX; P.oilX = oilX; P.wgY = wgY;

    // ---------- gas flows: continuous light colour (air = blue, exhaust = orange-red) + arrows ----------
    M.flowTex = [];
    const fMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
    const col = (r, a0, a1) => [[0, a0], [r, a0], [r, a1], [0, a1]];
    const flow = (fn) => { const g = new THREE.Group(), f = fn(false), c = fn(true); g.add(f, c); g.userData = { f, c }; g.visible = false; g.traverse(n => { n.renderOrder = 2; }); root.add(g); return g; };
    const AIR1 = 0x8fd3ff, AIR2 = 0x7fb4ff, EX1 = 0xff9468, EX2 = 0xffb999;
    const aIn = fMat(AIR1, .5), aInC = fMat(AIR1, .8), aV = fMat(AIR2, .5), aVC = fMat(AIR2, .8);
    M.flowAir = flow(cut => {
      const g = new THREE.Group();
      g.add(lathe(col(.66, -3.7, -2.1), aIn, aInC, cut, 'x', true));
      g.add(lathe([[1.06, -1.29], [1.55, -1.29], [1.55, -1.135], [1.06, -1.135]], aV, aVC, cut, 'x', true));
      g.add(cv.fill(cut, cut ? aVC : aV));
      const o = lathe(col(.4, 0, 2.9), aV, null, false, 'y', true); o.position.set(cEnd.x, 0, cEnd.z); g.add(o);
      return g;
    });
    const eIn = fMat(EX1, .5), eInC = fMat(EX1, .8), eOut = M.exOutMat = fMat(EX2, .5), eOutC = M.exOutCap = fMat(EX2, .8);
    M.flowExh = flow(cut => {
      const g = new THREE.Group();
      const i = lathe(col(.43, -2.3, 0), eIn, null, false, 'y', true); i.position.set(tEnd.x, 0, tEnd.z); g.add(i);
      g.add(tv.fill(cut, cut ? eInC : eIn));
      g.add(lathe(col(.62, 1.95, 3.2), eOut, eOutC, cut, 'x', true));
      return g;
    });
    M.flowByp = flow(cut => { const b = lathe(col(.12, 1.62, 2.45), eIn, eInC, cut, 'x', true); b.position.y = wgY; return b; });
    // arrows: where the gas goes in and comes out
    M.arrows = [];
    const arrow = (kind, key, base, dir, color, sc) => {
      sc = sc || 1; dir = dir.clone().normalize();
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color, metalness: .1, roughness: .5, emissive: color, emissiveIntensity: .35 });
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .62, 20), m); sh.position.y = .31; g.add(sh);
      const hd = new THREE.Mesh(new THREE.ConeGeometry(.4, .55, 24), m); hd.position.y = .62 + .275; g.add(hd);
      g.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir); g.scale.setScalar(sc); g.position.copy(base); g.visible = false; root.add(g);
      M.arrows.push({ g, kind, key, sc, base: base.clone(), dir: dir.clone() });
    };
    arrow('air', 'ar_ai', new V3(-5.05, 0, 0), new V3(1, 0, 0), 0x1e88e5);
    arrow('air', 'ar_ao', new V3(cEnd.x, 3.0, cEnd.z), new V3(0, 1, 0), 0x1e88e5);
    arrow('exh', 'ar_ei', new V3(tEnd.x, -3.6, tEnd.z), new V3(0, 1, 0), 0xe5482b);
    arrow('exh', 'ar_eo', new V3(3.3, 0, 0), new V3(1, 0, 0), 0xe5482b);
    const v = q => new V3(q[0], q[1], q[2]);
    let d = v(P.feed[1]).sub(v(P.feed[0])); arrow('oil', 'ar_oi', v(P.feed[0]).addScaledVector(d.clone().normalize(), -.75), d, 0xe0a800, .6);
    d = v(P.drain[3]).sub(v(P.drain[2])); arrow('oil', 'ar_oo', v(P.drain[3]), d, 0xb07a00, .6);
    d = v(P.cin[1]).sub(v(P.cin[0])); arrow('cool', 'ar_ci', v(P.cin[0]).addScaledVector(d.clone().normalize(), -.75), d, 0x12a594, .6);
    d = v(P.cout[4]).sub(v(P.cout[3])); arrow('cool', 'ar_co', v(P.cout[4]), d, 0x12a594, .6);
    return root;
  };
})();
