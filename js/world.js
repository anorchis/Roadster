// 포항 3D 월드: 하늘, 지형, 바다, 시가지, 포스코, 명소, 충돌체
const Colliders = (() => {
  const CELL = 150;
  const grid = new Map();
  const all = [];
  const key = (ix, iz) => ix * 100003 + iz;

  function insert(c, minX, minZ, maxX, maxZ) {
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = key(ix, iz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(c);
      }
    }
    all.push(c);
  }

  // 방향(yaw)이 있는 상자: 중심, 반폭(hx, hy, hz), 회전각
  function addBox(name, cx, cy, cz, hx, hy, hz, angle = 0) {
    const c = { type: 'box', name, cx, cy, cz, hx, hy, hz, cos: Math.cos(angle), sin: Math.sin(angle) };
    const r = Math.hypot(hx, hz) + 4;
    insert(c, cx - r, cz - r, cx + r, cz + r);
    return c;
  }
  function addSphere(name, x, y, z, r) {
    const c = { type: 'sphere', name, x, y, z, r };
    insert(c, x - r - 4, z - r - 4, x + r + 4, z + r + 4);
    return c;
  }

  // p: 위치, rad: 차체 반경. 부딪힌 물체 이름을 반환
  function test(p, rad) {
    const list = grid.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
    if (!list) return null;
    for (const c of list) {
      if (c.type === 'box') {
        const dx = p.x - c.cx, dz = p.z - c.cz;
        const lx = dx * c.cos - dz * c.sin;
        const lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hx + rad && Math.abs(lz) < c.hz + rad && Math.abs(p.y - c.cy) < c.hy + rad) return c.name;
      } else {
        const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
        if (d < c.r + rad) return c.name;
      }
    }
    return null;
  }
  return { addBox, addSphere, test, all };
})();

function makeCanvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

function makeLabel(text, color = '#ffffff') {
  const tex = makeCanvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = 'rgba(10,20,40,0.72)';
    g.beginPath();
    g.roundRect ? g.roundRect(8, 16, w - 16, h - 32, 30) : g.rect(8, 16, w - 16, h - 32);
    g.fill();
    g.font = 'bold 60px "Noto Sans KR", "Malgun Gothic", sans-serif';
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true, fog: false }));
  sp.scale.set(120, 30, 1);
  return sp;
}

function buildWorld(scene, renderer) {
  const H = GEO.height;
  const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const labels = [];
  const exclusion = [
    { ...GEO.POI.spacewalk, r: 60 }, { ...GEO.POI.poscoGate, r: 150 },
    { ...GEO.POI.yeongildae, r: 40 }, { ...GEO.POI.station, r: 40 },
  ];
  // 칼날 게이트 앞뒤 비행로는 비워 둠
  for (let d = -300; d <= 650; d += 50) exclusion.push({ x: GEO.POI.poscoGate.x, z: GEO.POI.poscoGate.z - d, r: 80 });
  const excluded = (x, z, pad = 0) => exclusion.some(e => Math.hypot(x - e.x, z - e.z) < e.r + pad);

  // ---------- 하늘 ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      void main(){
        float y = vDir.y;
        vec3 top = vec3(0.16,0.42,0.80), hor = vec3(0.78,0.88,0.97), gnd = vec3(0.45,0.55,0.62);
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y,0.0,1.0),0.55)) : mix(hor, gnd, clamp(-y*4.0,0.0,1.0));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.18);
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(25000, 32, 16), skyMat);
  scene.add(sky);

  // 반사용 환경맵 (차체 도장/유리 반사)
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(envScene, 0.02).texture;
  scene.environment = envMap;

  scene.fog = new THREE.Fog(0xc4dcf0, 2500, 11000);

  // ---------- 조명 ----------
  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.15);
  sun.position.set(450, 550, -700);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 2000;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // ---------- 지형 ----------
  const b = GEO.bounds;
  const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
  const segX = 300, segZ = 260;
  const tgeo = new THREE.PlaneGeometry(W, D, segX, segZ);
  tgeo.rotateX(-Math.PI / 2);
  tgeo.translate((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
  const pos = tgeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = H(x, z);
    pos.setY(i, h);
    const city = GEO.cityFactor(x, z);
    const n = GEO.fbm(x * 0.01, z * 0.01);
    if (h < 0) col.setRGB(0.55, 0.6, 0.5);
    else if (h < 3.2 && city < 0.5) col.setRGB(0.86, 0.80, 0.62); // 모래사장
    else if (h > 380) col.setRGB(0.47, 0.46, 0.42);              // 바위
    else {
      const forest = GEO.smooth(15, 120, h);
      col.setRGB(0.36 - forest * 0.18, 0.55 - forest * 0.2, 0.26 - forest * 0.1);
      col.offsetHSL(0, 0, (n - 0.5) * 0.08);
      col.lerp(new THREE.Color(0.58, 0.58, 0.55), city * 0.75);     // 시가지
    }
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  tgeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tgeo.computeVertexNormals();
  const terrain = new THREE.Mesh(tgeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---------- 바다 ----------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(90000, 90000),
    new THREE.MeshStandardMaterial({ color: 0x1f6c9c, roughness: 0.22, metalness: 0.35, envMapIntensity: 0.9 })
  );
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  scene.add(water);

  // ---------- 시가지 건물 ----------
  const winTex = makeCanvasTexture(64, 128, (g, w, h) => {
    g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5d7590';
    for (let y = 4; y < h - 2; y += 8) for (let x = 3; x < w - 2; x += 10) g.fillRect(x, y, 6, 4);
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const buildings = [];
  for (const c of GEO.cities) {
    const ang = (rnd() - 0.5) * 0.8;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const step = 48;
    for (let u = -c.r * 1.3; u <= c.r * 1.3; u += step) {
      for (let v = -c.r * 1.3; v <= c.r * 1.3; v += step * 0.8) {
        if (rnd() > c.density) continue;
        const x = c.x + u * ca - v * sa + (rnd() - 0.5) * 8;
        const z = c.z + u * sa + v * ca + (rnd() - 0.5) * 8;
        const dist = Math.hypot(x - c.x, z - c.z) / c.r;
        if (dist > 1.25 || rnd() < dist * 0.6) continue;
        const h = H(x, z);
        if (h < 2 || GEO.isRiver(x, z) || excluded(x, z)) continue;
        if (Math.abs(H(x + 20, z) - h) > 6 || Math.abs(H(x, z + 20) - h) > 6) continue;
        const core = 1 - dist;
        let w, d, bh;
        const r = rnd();
        if (r < 0.55) { w = 34 + rnd() * 18; d = 12 + rnd() * 3; bh = 30 + rnd() * 45 + core * 25; }   // 아파트
        else if (r < 0.65 && core > 0.5) { w = 22 + rnd() * 10; d = 22 + rnd() * 10; bh = 70 + rnd() * 60; } // 고층
        else { w = 14 + rnd() * 16; d = 14 + rnd() * 14; bh = 8 + rnd() * 18; }                    // 저층
        buildings.push({ x, z, y: h - 2, w, d, h: bh + 2, ang: -ang, tone: rnd() });
      }
    }
  }
  const bMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshLambertMaterial({ map: winTex }), buildings.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  buildings.forEach((bd, i) => {
    q.setFromAxisAngle(up, bd.ang);
    m4.compose(p3.set(bd.x, bd.y, bd.z), q, s3.set(bd.w, bd.h, bd.d));
    bMesh.setMatrixAt(i, m4);
    const t = bd.tone;
    bMesh.setColorAt(i, col.setHSL(0.08 + t * 0.5, t < 0.7 ? 0.08 : 0.3, 0.72 + t * 0.15));
    Colliders.addBox('건물', bd.x, bd.y + bd.h / 2, bd.z, bd.w / 2, bd.h / 2, bd.d / 2, -bd.ang);
  });
  bMesh.castShadow = true; bMesh.receiveShadow = true;
  scene.add(bMesh);

  // ---------- 숲 ----------
  const trees = [];
  for (let i = 0; i < 9000 && trees.length < 6000; i++) {
    const x = b.minX + rnd() * W, z = b.minZ + rnd() * D;
    const h = H(x, z);
    if (h < 12 || GEO.cityFactor(x, z) > 0.2 || h > 420) continue;
    trees.push({ x, z, y: h, s: 0.7 + rnd() * 0.8, t: rnd() });
  }
  const treeGeo = new THREE.ConeGeometry(5, 14, 6);
  treeGeo.translate(0, 6, 0);
  const tMesh = new THREE.InstancedMesh(treeGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);
  trees.forEach((t, i) => {
    m4.compose(p3.set(t.x, t.y, t.z), q.identity(), s3.set(t.s * 1.4, t.s * 1.4, t.s * 1.4));
    tMesh.setMatrixAt(i, m4);
    tMesh.setColorAt(i, col.setHSL(0.28 + t.t * 0.06, 0.45, 0.18 + t.t * 0.08));
  });
  scene.add(tMesh);

  // ---------- 포스코 제철소 ----------
  const steel = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.8, metalness: 0.3 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a4b32, roughness: 0.9, metalness: 0.2 });
  const shedMats = [0x4f7fae, 0x8fa3b5, 0x5c8f8a, 0xb0b4b8].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2 }));
  const stripeTex = makeCanvasTexture(8, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#d12b22'; g.fillRect(0, i * 8, w, 8); }
  });
  const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6 });
  const poscoAng = -0.6;
  const placed = [];
  const free = (x, z, r) => !placed.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r) && !excluded(x, z, r);
  function poscoSpot(r) {
    for (let k = 0; k < 200; k++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * GEO.posco.r;
      const x = GEO.posco.x + Math.cos(a) * d, z = GEO.posco.z + Math.sin(a) * d;
      if (H(x, z) < 2 || GEO.polylineDist(x, z, GEO.river, false) < GEO.RIVER_HW + r + 10) continue;
      if (GEO.polylineDist(x, z, GEO.coast, true) < r + 10) continue;
      if (!free(x, z, r)) continue;
      placed.push({ x, z, r });
      return { x, z, y: H(x, z) };
    }
    return null;
  }
  const chimneys = [];
  // 고로 (용광로)
  for (let i = 0; i < 4; i++) {
    const s = poscoSpot(45); if (!s) continue;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 62, 16), rust);
    body.position.y = 31; g.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 14, 12), steel);
    top.position.y = 69; g.add(top);
    for (let k = 0; k < 3; k++) {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 48, 12), steel);
      st.position.set(-22, 24, -14 + k * 14); g.add(st);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(30, 40, 30), new THREE.MeshStandardMaterial({ color: 0x3d3d3d, wireframe: true }));
    frame.position.y = 20; g.add(frame);
    const conv = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 70), steel);
    conv.position.set(16, 40, 30); conv.rotation.x = 0.55; g.add(conv);
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = poscoAng;
    g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    scene.add(g);
    Colliders.addBox('포스코 용광로', s.x, s.y + 40, s.z, 30, 40, 30, -poscoAng);
    chimneys.push({ x: s.x, y: s.y + 76, z: s.z });
  }
  // 굴뚝
  for (let i = 0; i < 7; i++) {
    const s = poscoSpot(12); if (!s) continue;
    const hgt = 100 + rnd() * 50;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.2, hgt, 12), stripeMat);
    m.position.set(s.x, s.y + hgt / 2, s.z);
    m.castShadow = true;
    scene.add(m);
    Colliders.addBox('포스코 굴뚝', s.x, s.y + hgt / 2, s.z, 4, hgt / 2, 4);
    chimneys.push({ x: s.x, y: s.y + hgt, z: s.z });
  }
  // 공장 건물
  for (let i = 0; i < 40; i++) {
    const L = 140 + rnd() * 220, Wd = 34 + rnd() * 26, Ht = 18 + rnd() * 20;
    const s = poscoSpot(L * 0.45); if (!s) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(L, Ht, Wd), shedMats[i % shedMats.length]);
    m.position.set(s.x, s.y + Ht / 2 - 1, s.z);
    m.rotation.y = poscoAng;
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    Colliders.addBox('포스코 공장', s.x, s.y + Ht / 2, s.z, L / 2, Ht / 2, Wd / 2, -poscoAng);
  }
  // 가스 홀더
  for (let i = 0; i < 3; i++) {
    const s = poscoSpot(28); if (!s) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 55, 24), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.5 }));
    m.position.set(s.x, s.y + 27, s.z); m.castShadow = true;
    scene.add(m);
    Colliders.addBox('가스 홀더', s.x, s.y + 27, s.z, 24, 28, 24);
  }

  // 칼날 비행 게이트 (포스코 굴뚝 사이 좁은 틈)
  const gate = (() => {
    const p = GEO.POI.poscoGate;
    const gy = H(p.x, p.z);
    const g = new THREE.Group();
    const gap = 10, hgt = 70;
    for (const sx of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(5, hgt, 5), stripeMat);
      pil.position.set(sx * (gap / 2 + 2.5), hgt / 2, 0);
      pil.castShadow = true;
      g.add(pil);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(gap + 10, 4, 5), stripeMat);
    bar.position.y = hgt + 2; g.add(bar);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(gap, hgt - 14),
      new THREE.MeshBasicMaterial({ color: 0x66ffcc, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    glow.position.y = 14 + (hgt - 14) / 2; g.add(glow);
    g.position.set(p.x, gy, p.z);
    scene.add(g);
    // 게이트는 남북 방향으로 통과 (기둥은 x축으로 배치)
    for (const sx of [-1, 1]) Colliders.addBox('칼날 게이트 기둥', p.x + sx * (gap / 2 + 2.5), gy + hgt / 2, p.z, 2.5, hgt / 2, 2.5);
    Colliders.addBox('칼날 게이트', p.x, gy + hgt + 2, p.z, gap / 2 + 5, 2, 2.5);
    return { x: p.x, z: p.z, y: gy, gap, bottom: gy + 14, top: gy + hgt, glow };
  })();

  // 굴뚝 연기
  const smokeTex = makeCanvasTexture(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const smoke = [];
  for (let i = 0; i < 140; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xe8e8e8, transparent: true, depthWrite: false }));
    sp.userData = { life: rnd() * 12, src: chimneys[i % chimneys.length] };
    scene.add(sp);
    smoke.push(sp);
  }

  // ---------- 포항공항 활주로 ----------
  {
    const a = GEO.airport;
    let y = 0;
    for (let t = -0.5; t <= 0.5; t += 0.05) y = Math.max(y, H(a.x + Math.cos(a.angle) * a.len * t, a.z - Math.sin(a.angle) * a.len * t));
    const rwTex = makeCanvasTexture(64, 1024, (g, w, h) => {
      g.fillStyle = '#3a3c40'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      for (let i = 0; i < h; i += 64) g.fillRect(30, i, 4, 32);
      g.fillRect(4, 0, 3, h); g.fillRect(w - 7, 0, 3, h);
    });
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(a.wid, a.len), new THREE.MeshLambertMaterial({ map: rwTex }));
    rw.rotation.x = -Math.PI / 2;
    rw.rotation.z = Math.PI / 2 + a.angle;
    rw.position.set(a.x, y + 0.4, a.z);
    rw.receiveShadow = true;
    scene.add(rw);
    const term = new THREE.Mesh(new THREE.BoxGeometry(120, 14, 30), new THREE.MeshLambertMaterial({ color: 0xdfe5ea }));
    term.position.set(a.x + 30, H(a.x + 30, a.z + 110) + 7, a.z + 110);
    scene.add(term);
    Colliders.addBox('공항 터미널', term.position.x, term.position.y, term.position.z, 60, 7, 15);
  }

  // ---------- 형산강 다리 ----------
  const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.6 });
  for (const idx of [2, 4, 6]) {
    const a = GEO.river[idx], c = GEO.river[idx + 1];
    const dir = Math.atan2(c.z - a.z, c.x - a.x);
    const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
    const L = GEO.RIVER_HW * 4.2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 2, 22), bridgeMat);
    deck.position.set(mx, 11, mz);
    deck.rotation.y = -dir + Math.PI / 2;
    deck.castShadow = true; deck.receiveShadow = true;
    scene.add(deck);
    Colliders.addBox('다리', mx, 11, mz, L / 2, 1.5, 11, dir - Math.PI / 2);
    for (let k = -2; k <= 2; k++) {
      const px = mx + Math.cos(dir + Math.PI / 2) * k * L / 5, pz = mz + Math.sin(dir + Math.PI / 2) * k * L / 5;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 16, 8), bridgeMat);
      pil.position.set(px, 3, pz);
      scene.add(pil);
    }
  }

  // ---------- 스페이스워크 (환호공원) ----------
  const spacewalk = (() => {
    const p = GEO.POI.spacewalk;
    const gy = H(p.x, p.z);
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const t = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(28 * Math.sin(t), 13 + 9 * Math.sin(3 * t + 0.5) + 4 * Math.cos(t), 22 * Math.sin(2 * t)));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const g = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.85, roughness: 0.25 });
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 400, 0.9, 10, true), steelMat));
    // 난간 레일 2줄
    for (const off of [-1.4, 1.4]) {
      const rp = curve.getSpacedPoints(300).map((v, i, arr) => {
        const n = arr[(i + 1) % arr.length].clone().sub(v).normalize();
        const side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();
        return v.clone().addScaledVector(side, off).add(new THREE.Vector3(0, 1.1, 0));
      });
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp, true), 400, 0.12, 6, true), steelMat));
    }
    // 기둥과 조명
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff1a8 });
    for (let i = 0; i < 16; i++) {
      const v = curve.getPointAt(i / 16);
      const col2 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, v.y, 6), steelMat);
      col2.position.set(v.x, v.y / 2, v.z);
      g.add(col2);
    }
    for (let i = 0; i < 80; i++) {
      const v = curve.getPointAt(i / 80);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), lightMat);
      l.position.copy(v).add(new THREE.Vector3(0, 1.3, 0));
      g.add(l);
    }
    g.position.set(p.x, gy, p.z);
    g.traverse(o => { o.castShadow = true; });
    scene.add(g);
    for (let i = 0; i < 90; i++) {
      const v = curve.getPointAt(i / 90);
      Colliders.addSphere('스페이스워크', p.x + v.x, gy + v.y, p.z + v.z, 2.5);
    }
    return { x: p.x, y: gy, z: p.z };
  })();

  // ---------- 영일대 해상누각 ----------
  {
    const p = GEO.POI.yeongildae;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x8e2f22, roughness: 0.7 });
    const green = new THREE.MeshStandardMaterial({ color: 0x2f7d5d, roughness: 0.7 });
    const tile = new THREE.MeshStandardMaterial({ color: 0x3b4146, roughness: 0.8 });
    const stone = new THREE.MeshStandardMaterial({ color: 0xc9c3b6, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 18), stone);
    base.position.y = 1.5; g.add(base);
    for (const lv of [0, 1]) {
      const y0 = 3.5 + lv * 6.5, sz = lv ? 5 : 7;
      for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) for (const k of [0.4, 1]) {
        if (k === 0.4 && lv === 1) continue;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 8), wood);
        c.position.set(i * sz * k, y0 + 3, j * sz * k);
        g.add(c);
      }
      const floor = new THREE.Mesh(new THREE.BoxGeometry(sz * 2 + 2, 0.6, sz * 2 + 2), wood);
      floor.position.y = y0 + 6.2; g.add(floor);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(sz * 2 + 1, 0.8, sz * 2 + 1), green);
      trim.position.y = y0 + 5.6; g.add(trim);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(sz * 1.75, lv ? 5 : 3.2, 4, 1, true), tile);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = y0 + 6.5 + (lv ? 2.5 : 1.0);
      g.add(roof);
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 0.8), tile);
    ridge.position.y = 20; g.add(ridge);
    // 해안으로 이어지는 다리
    const shoreX = GEO.ll(36.0566, 129.3797).x;
    const len = p.x - shoreX;
    const br = new THREE.Mesh(new THREE.BoxGeometry(len, 1, 4), stone);
    br.position.set(-len / 2, 2.5, 0); g.add(br);
    g.position.set(p.x, 0, p.z);
    g.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
    scene.add(g);
    Colliders.addBox('영일대', p.x, 11, p.z, 10, 11, 10);
    Colliders.addBox('영일대 다리', p.x - len / 2, 2.5, p.z, len / 2, 1.5, 2);
  }

  // ---------- 호미곶: 상생의 손 + 등대 ----------
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a6136, metalness: 0.75, roughness: 0.38 });
  function makeHand(mirror) {
    const g = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, 6, 14), bronze);
    arm.position.y = 0; g.add(arm);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.2, 1.0), bronze);
    palm.position.y = 4.4; g.add(palm);
    const fingers = [[-1.0, 2.5, 0.12], [-0.34, 3.0, 0.04], [0.32, 2.85, -0.04], [0.96, 2.3, -0.12]];
    for (const [fx, L, tilt] of fingers) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, L, 4, 10), bronze);
      f.position.set(fx + tilt * L * 0.5, 6.0 + L / 2 + 0.1, 0);
      f.rotation.z = -tilt;
      g.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 2.0, 4, 10), bronze);
    thumb.position.set(1.85, 4.3, 0.25);
    thumb.rotation.z = -0.85;
    g.add(thumb);
    if (mirror) g.scale.x = -1;
    g.traverse(o => { o.castShadow = true; });
    return g;
  }
  {
    const p = GEO.POI.hand;
    const hand = makeHand(false);
    hand.position.set(p.x, -0.5, p.z);
    hand.rotation.y = Math.PI / 2;
    scene.add(hand);
    Colliders.addBox('상생의 손', p.x, 4.5, p.z, 2.6, 5.5, 3.2);

    const lp = GEO.POI.handLeft;
    const ly = H(lp.x, lp.z);
    const left = makeHand(true);
    left.scale.multiplyScalar(0.7);
    left.position.set(lp.x, ly + 1, lp.z);
    left.rotation.y = -Math.PI / 2;
    scene.add(left);
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 1, 32), new THREE.MeshLambertMaterial({ color: 0xcfc8b8 }));
    plaza.position.set(lp.x, ly - 0.2, lp.z);
    plaza.receiveShadow = true;
    scene.add(plaza);
    Colliders.addBox('상생의 손(왼손)', lp.x, ly + 4, lp.z, 2, 4.5, 2);

    const L = GEO.POI.lighthouse;
    const lyy = H(L.x, L.z);
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.8, 26, 8), new THREE.MeshStandardMaterial({ color: 0xf6f6f2, roughness: 0.5 }));
    tower.position.y = 13; lh.add(tower);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3, 8), new THREE.MeshStandardMaterial({ color: 0xfff6b0, emissive: 0xffe680, emissiveIntensity: 0.6 }));
    lamp.position.y = 27.5; lh.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 8), new THREE.MeshStandardMaterial({ color: 0xc0332b }));
    cap.position.y = 30.5; lh.add(cap);
    lh.position.set(L.x, lyy, L.z);
    lh.traverse(o => { o.castShadow = true; });
    scene.add(lh);
    Colliders.addBox('호미곶 등대', L.x, lyy + 16, L.z, 3.8, 16, 3.8);
  }

  // ---------- 포항역 ----------
  {
    const p = GEO.POI.station;
    const y = H(p.x, p.z);
    const st = new THREE.Mesh(new THREE.BoxGeometry(90, 16, 34), new THREE.MeshStandardMaterial({ color: 0xd8e2ea, roughness: 0.3, metalness: 0.4 }));
    st.position.set(p.x, y + 8, p.z);
    st.castShadow = true;
    scene.add(st);
    Colliders.addBox('포항역', p.x, y + 8, p.z, 45, 8, 17);
  }

  // ---------- 영일만 배 ----------
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x7a2a22, roughness: 0.7 });
  const deckMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
  [[36.020, 129.410, 0.4], [36.028, 129.425, 1.2], [36.045, 129.440, 0.2], [36.012, 129.418, -0.4], [36.060, 129.470, 0.9]].forEach(([la, lo, a]) => {
    const p = GEO.ll(la, lo);
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(150, 12, 24), shipMat);
    hull.position.y = 3; g.add(hull);
    const br = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 20), deckMat);
    br.position.set(-60, 17, 0); g.add(br);
    for (let k = 0; k < 4; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 20), new THREE.MeshStandardMaterial({ color: [0x2a6fb0, 0xd08a2a, 0x3a9a5a, 0xb03a3a][k] }));
      box.position.set(-25 + k * 24, 12, 0); g.add(box);
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = a;
    g.traverse(o => { o.castShadow = true; });
    scene.add(g);
    Colliders.addBox('배', p.x, 8, p.z, 75, 17, 12, -a);
  });

  // ---------- 구름 ----------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
  const cloudGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 40; i++) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(cloudGeo, cloudMat);
      const r = 40 + rnd() * 50;
      s.scale.set(r * 1.5, r * 0.7, r);
      s.position.set((rnd() - 0.5) * 220, (rnd() - 0.5) * 30, (rnd() - 0.5) * 120);
      g.add(s);
    }
    g.position.set(b.minX + rnd() * W, 700 + rnd() * 500, b.minZ + rnd() * D);
    scene.add(g);
  }

  // ---------- 이름표 ----------
  const addLabel = (text, x, y, z, color) => { const l = makeLabel(text, color); l.position.set(x, y, z); scene.add(l); labels.push(l); };
  const P = GEO.POI;
  addLabel('스페이스워크', P.spacewalk.x, spacewalk.y + 50, P.spacewalk.z, '#ffe27a');
  addLabel('영일대', P.yeongildae.x, 40, P.yeongildae.z, '#ffe27a');
  addLabel('상생의 손', P.hand.x, 30, P.hand.z, '#ffe27a');
  addLabel('호미곶 등대', P.lighthouse.x, 60, P.lighthouse.z);
  addLabel('포스코 제철소', GEO.posco.x, 190, GEO.posco.z, '#9fd3ff');
  addLabel('포항역', P.station.x, H(P.station.x, P.station.z) + 45, P.station.z);
  addLabel('죽도시장', P.jukdo.x, 90, P.jukdo.z);
  addLabel('포항공항', P.airport.x, 70, P.airport.z);
  addLabel('구룡포', P.guryongpo.x, 60, P.guryongpo.z);
  addLabel('포스텍', P.postech.x, H(P.postech.x, P.postech.z) + 60, P.postech.z);
  const rv = GEO.river[3];
  addLabel('형산강', rv.x, 60, rv.z, '#a6e4ff');
  addLabel('영일만', GEO.ll(36.05, 129.46).x, 120, GEO.ll(36.05, 129.46).z, '#a6e4ff');

  function update(dt, camera, focus) {
    sun.position.set(focus.x + 450, focus.y + 550, focus.z - 700);
    sun.target.position.copy(focus);
    sky.position.copy(camera.position);
    for (const l of labels) {
      const d = l.position.distanceTo(camera.position);
      const s = Math.min(Math.max(d * 0.045, 4), 260);
      l.scale.set(s * 4, s, 1);
      l.visible = d > 160 && d < 7000;
    }
    for (const sp of smoke) {
      const u = sp.userData;
      u.life += dt;
      if (u.life > 12) u.life = 0;
      const t = u.life / 12;
      sp.position.set(u.src.x + t * 90, u.src.y + t * 70, u.src.z - t * 30);
      const s = 8 + t * 45;
      sp.scale.set(s, s, 1);
      sp.material.opacity = 0.55 * (1 - t);
    }
    gate.glow.material.opacity = 0.14 + 0.08 * Math.sin(performance.now() * 0.005);
  }

  return { update, gate, spacewalk, sun };
}
