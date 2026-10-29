// 테슬라 로드스터 (2026년 10월 공개된 2세대 양산형 디자인 기반의 근사 모델)
// - Ano White 도장, 골드 틴트 유리, 숨은 헤드라이트, 차폭 전체를 가로지르는 테일라이트
// - 능동형 리어윙(여기서는 조종면처럼 움직임), SpaceX 콜드가스 스러스터 노즐 4개
// - 2인승, 길이 약 4.3m / 폭 약 2.0m / 높이 약 1.15m (공식 치수 미발표, 근사치)
// 차의 앞쪽은 -Z, 오른쪽은 +X, 위쪽은 +Y 입니다.

const AXIS_COLORS = { roll: 0xff5a5a, pitch: 0x4cdc6a, yaw: 0x4aa8ff };

function loftGeometry(stations, rings, around) {
  const n = stations.length;
  const interp = (k, u) => {
    const i = Math.min(Math.floor(u), n - 2), t = u - i;
    const p0 = stations[Math.max(i - 1, 0)][k], p1 = stations[i][k];
    const p2 = stations[i + 1][k], p3 = stations[Math.min(i + 2, n - 1)][k];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
  const pos = [];
  const idx = [];
  for (let r = 0; r <= rings; r++) {
    const u = (r / rings) * (n - 1);
    const z = interp(0, u), hw = interp(1, u), yb = interp(2, u), yt = interp(3, u), e = interp(4, u), tw = interp(5, u);
    const yc = (yb + yt) / 2, hh = (yt - yb) / 2;
    for (let a = 0; a < around; a++) {
      const th = (a / around) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      let x = hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      const y = yc + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / e);
      if (s > 0) x *= 1 + (tw - 1) * s;
      pos.push(x, y, z);
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let a = 0; a < around; a++) {
      const i0 = r * around + a, i1 = r * around + (a + 1) % around;
      const j0 = i0 + around, j1 = i1 + around;
      idx.push(i0, j0, i1, i1, j0, j1);
    }
  }
  // 앞뒤 마개
  for (const [r, flip] of [[0, true], [rings, false]]) {
    let cx = 0, cy = 0;
    for (let a = 0; a < around; a++) { cy += pos[(r * around + a) * 3 + 1]; }
    cy /= around;
    const ci = pos.length / 3;
    pos.push(cx, cy, pos[r * around * 3 + 2]);
    for (let a = 0; a < around; a++) {
      const i0 = r * around + a, i1 = r * around + (a + 1) % around;
      if (flip) idx.push(ci, i0, i1); else idx.push(ci, i1, i0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function createRoadster() {
  const root = new THREE.Group();       // 무게중심 (회전 중심)
  const car = new THREE.Group();
  car.position.y = -0.5;
  root.add(car);

  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf3f3ef, roughness: 0.28, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xa8843c, roughness: 0.06, metalness: 0.75, clearcoat: 1, envMapIntensity: 1.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55, metalness: 0.2 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.35, metalness: 0.5 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0xb9b5ae, roughness: 0.28, metalness: 1.0 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.9 });
  const ledWhite = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
  const ledRed = new THREE.MeshBasicMaterial({ color: 0xff2030 });

  // 차체: 낮고 넓은 쐐기형, 긴 보닛, 부풀린 뒤 펜더
  const body = new THREE.Mesh(loftGeometry([
    [-2.17, 0.55, 0.26, 0.40, 3.0, 0.80],
    [-2.10, 0.82, 0.18, 0.50, 3.5, 0.80],
    [-1.90, 0.94, 0.15, 0.58, 4.0, 0.82],
    [-1.72, 0.96, 0.20, 0.64, 4.0, 0.84],
    [-1.55, 0.98, 0.50, 0.69, 4.0, 0.85],   // 앞바퀴 아치
    [-1.35, 0.99, 0.62, 0.72, 4.0, 0.85],
    [-1.15, 0.98, 0.50, 0.73, 4.0, 0.85],
    [-0.98, 0.97, 0.18, 0.74, 4.0, 0.85],
    [-0.45, 0.93, 0.15, 0.79, 4.0, 0.82],
    [0.10, 0.92, 0.15, 0.83, 4.0, 0.80],
    [0.80, 0.98, 0.16, 0.87, 4.0, 0.80],
    [1.02, 1.00, 0.50, 0.88, 4.0, 0.81],    // 뒷바퀴 아치
    [1.25, 1.01, 0.66, 0.89, 4.0, 0.82],
    [1.48, 1.00, 0.52, 0.89, 4.0, 0.83],
    [1.68, 0.98, 0.22, 0.88, 4.0, 0.85],
    [2.05, 0.90, 0.26, 0.83, 4.5, 0.88],
    [2.17, 0.82, 0.32, 0.77, 5.0, 0.90],
  ], 90, 40), paint);
  car.add(body);

  // 골드 틴트 캐노피
  const canopy = new THREE.Mesh(loftGeometry([
    [-0.80, 0.66, 0.68, 0.74, 3, 0.60],
    [-0.45, 0.70, 0.70, 0.95, 3, 0.55],
    [-0.05, 0.68, 0.72, 1.13, 3, 0.55],
    [0.35, 0.64, 0.74, 1.12, 3, 0.55],
    [0.75, 0.56, 0.78, 1.00, 3, 0.55],
    [1.05, 0.44, 0.82, 0.88, 3, 0.60],
  ], 30, 32), glass);
  car.add(canopy);

  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); car.add(o); return o; };
  // 숨은 헤드라이트 (얇은 LED 라인)
  box(1.45, 0.022, 0.04, ledWhite, 0, 0.445, -2.10);
  // 앞 범퍼 흡기구, 스플리터
  box(1.25, 0.11, 0.08, black, 0, 0.27, -2.12);
  box(1.72, 0.03, 0.30, carbon, 0, 0.15, -1.98);
  // 사이드 스커트, 측면 흡기구
  for (const s of [-1, 1]) {
    box(0.05, 0.08, 1.75, carbon, s * 0.95, 0.19, -0.05);
    const intake = box(0.04, 0.2, 0.55, black, s * 0.975, 0.52, 0.95);
    intake.rotation.y = s * 0.08;
  }
  // 뒤: 차폭 전체 테일라이트, 디퓨저
  const tail = box(1.62, 0.05, 0.04, ledRed, 0, 0.70, 2.18);
  box(1.55, 0.18, 0.28, carbon, 0, 0.24, 2.04);

  // SpaceX 콜드가스 스러스터 노즐 4개 (가로 배열)
  const nozzles = [];
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const x of [-0.6, -0.2, 0.2, 0.6]) {
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.115, 0.22, 16, 1, true), titanium);
    nz.rotation.x = Math.PI / 2;
    nz.position.set(x, 0.42, 2.2);
    car.add(nz);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), black);
    inner.position.set(x, 0.42, 2.1);
    car.add(inner);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.8, 14, 1, true), plumeMat);
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(x, 0.42, 2.2 + 0.9);
    car.add(plume);
    nozzles.push(plume);
  }

  // 능동형 리어 윙 (좌/우 분할: 롤=에일러론, 피치=엘리베이터, 끝판=러더처럼 움직임)
  for (const s of [-1, 1]) {
    const post = box(0.04, 0.24, 0.12, carbon, s * 0.52, 0.98, 1.88);
    post.rotation.x = -0.15;
  }
  const wing = {};
  for (const [name, s] of [['left', -1], ['right', 1]]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.46, 1.12, 1.9);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.34), carbon);
    piv.add(blade);
    const plate = new THREE.Group();
    plate.position.set(s * 0.46, 0, 0);
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.4), carbon);
    plate.add(pl);
    piv.add(plate);
    car.add(piv);
    wing[name] = { piv, plate };
  }

  // 바퀴 (앞 21인치, 뒤 22인치 근사)
  const wheels = [];
  function wheel(r, w, x, z) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 30), tireMat);
    tire.rotation.z = Math.PI / 2;
    g.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, w + 0.012, 30), carbon);
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    const side = Math.sign(x);
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, r * 1.35, 0.05), titanium);
      sp.position.x = side * (w / 2 + 0.008);
      sp.rotation.x = (k / 5) * Math.PI;
      g.add(sp);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.03, 12), titanium);
    cap.rotation.z = Math.PI / 2;
    g.add(cap);
    g.position.set(x, r, z);
    car.add(g);
    wheels.push(g);
  }
  wheel(0.34, 0.27, -0.84, -1.35); wheel(0.34, 0.27, 0.84, -1.35);
  wheel(0.36, 0.32, -0.84, 1.25); wheel(0.36, 0.32, 0.84, 1.25);

  car.traverse(o => { if (o.isMesh && o.material !== plumeMat) { o.castShadow = true; } });

  // 자세 제어 가스 분사 (작은 스러스터)
  const puffTex = makeCanvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const puffs = [];
  for (let i = 0; i < 40; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xeaf6ff, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    root.add(sp);
    puffs.push({ sp, life: 0, vel: new THREE.Vector3() });
  }
  let puffIdx = 0;
  function puff(x, y, z, dx, dy, dz) {
    const p = puffs[puffIdx++ % puffs.length];
    p.life = 0.35;
    p.sp.position.set(x, y - 0.5, z);
    p.vel.set(dx, dy, dz).multiplyScalar(6);
    p.sp.visible = true;
  }
  // 각 회전 방향에 대해 [위치, 분사 방향] 2개씩
  const RCS = {
    roll: [[-1.0, 0.2, 0, 0, -1, 0], [1.0, 0.85, 0, 0, 1, 0]],
    pitch: [[0, 0.15, -2.0, 0, -1, 0], [0, 0.95, 2.0, 0, 1, 0]],
    yaw: [[-1.0, 0.45, -1.8, -1, 0, 0], [1.0, 0.45, 1.8, 1, 0, 0]],
  };
  let puffTimer = 0;

  // ---------- 회전축 화살표 (롤/피치/요) ----------
  const gizmo = {};
  function axisGizmo(name, frameRot, radius) {
    const frame = new THREE.Group();
    frame.rotation.set(frameRot[0], frameRot[1], frameRot[2]);
    const color = AXIS_COLORS[name];
    const lineMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false });
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 7.5, 6), lineMat);
    line.rotation.x = Math.PI / 2;           // 프레임의 Z축 방향
    frame.add(line);
    const ring = new THREE.Group();
    const arcMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.06, 8, 64, Math.PI * 1.5), arcMat);
    ring.add(arc);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 12), arcMat);
    // 호의 끝(1.5π 지점)에서 반시계 방향 접선(+X)을 향하도록
    head.position.set(0, -radius, 0);
    head.rotation.z = -Math.PI / 2;
    ring.add(head);
    const mirror = new THREE.Group();
    mirror.add(ring);
    frame.add(mirror);
    ring.visible = false;
    root.add(frame);
    gizmo[name] = { frame, ring, mirror, lineMat, arcMat, level: 0 };
  }
  axisGizmo('roll', [0, 0, 0], 1.7);              // Z축 (앞뒤)
  axisGizmo('pitch', [0, Math.PI / 2, 0], 2.6);   // X축 (좌우)
  axisGizmo('yaw', [-Math.PI / 2, 0, 0], 2.7);    // Y축 (위아래)

  // input: {roll, pitch, yaw} -1..1, boost 0..1, speed m/s
  function update(dt, input, speed, boost) {
    // 바퀴 회전
    for (const w of wheels) w.rotation.x -= speed * dt / 0.35;
    // 리어 윙: 피치는 양쪽 같이, 롤은 반대로 (오른쪽 롤 → 오른쪽 날개 뒷전 위)
    const pitchDef = input.pitch * 0.35, rollDef = input.roll * 0.35;
    wing.left.piv.rotation.x = THREE.MathUtils.lerp(wing.left.piv.rotation.x, -pitchDef + rollDef, 1 - Math.exp(-10 * dt));
    wing.right.piv.rotation.x = THREE.MathUtils.lerp(wing.right.piv.rotation.x, -pitchDef - rollDef, 1 - Math.exp(-10 * dt));
    for (const s of ['left', 'right']) wing[s].plate.rotation.y = THREE.MathUtils.lerp(wing[s].plate.rotation.y, -input.yaw * 0.4, 1 - Math.exp(-10 * dt));
    // 스러스터 분사 불꽃
    for (const p of nozzles) {
      p.material.opacity = boost * 0.85;
      p.scale.set(1, 0.4 + boost * (1.2 + Math.random() * 0.4), 1);
      p.position.z = 2.2 + 0.9 * p.scale.y;
    }
    tail.material.color.setHex(boost > 0.1 ? 0xff5060 : 0xff2030);
    // 자세 제어 분사
    puffTimer -= dt;
    if (puffTimer <= 0) {
      puffTimer = 0.06;
      for (const ax of ['roll', 'pitch', 'yaw']) {
        const v = input[ax];
        if (Math.abs(v) < 0.2) continue;
        // 음(-) 방향이면 롤/요는 좌우를, 피치는 위아래를 뒤집어 분사
        for (const r of RCS[ax]) {
          if (v > 0) puff(r[0], r[1], r[2], r[3], r[4], r[5]);
          else if (ax === 'pitch') puff(r[0], 1.1 - r[1], r[2], r[3], -r[4], r[5]);
          else puff(-r[0], r[1], r[2], -r[3], r[4], r[5]);
        }
      }
    }
    for (const p of puffs) {
      if (!p.sp.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      p.sp.position.addScaledVector(p.vel, dt);
      const t = 1 - p.life / 0.35;
      p.sp.scale.setScalar(0.25 + t * 0.9);
      p.sp.material.opacity = 0.9 * (1 - t);
    }
    // 회전축 화살표: 각 명령의 실제 회전 방향
    // 롤+ : Z축 기준 시계(-), 피치+ : X축 기준 반시계(+), 요+ : Y축 기준 시계(-)
    const sense = { roll: -input.roll, pitch: input.pitch, yaw: -input.yaw };
    for (const ax of ['roll', 'pitch', 'yaw']) {
      const gz = gizmo[ax];
      const s = sense[ax];
      const active = Math.abs(s) > 0.05;
      gz.level = THREE.MathUtils.lerp(gz.level, active ? 1 : 0, 1 - Math.exp(-8 * dt));
      gz.ring.visible = gz.level > 0.03;
      gz.arcMat.opacity = gz.level * 0.95;
      gz.lineMat.opacity = 0.18 + gz.level * 0.7;
      if (active) {
        gz.mirror.scale.x = s > 0 ? 1 : -1;
        gz.ring.rotation.z += dt * 2.5;
      }
    }
  }

  function setGizmoVisible(v) { for (const k in gizmo) gizmo[k].frame.visible = v; }

  return { root, update, setGizmoVisible };
}
