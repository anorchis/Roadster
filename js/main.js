// 게임 루프: 입력 → 비행 → 충돌 → 미션 → 카메라 → 화면 표시
(() => {
  const $ = id => document.getElementById(id);
  const DEG = Math.PI / 180;

  // ---------- 렌더러 / 장면 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 40000);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const world = buildWorld(scene, renderer);
  const roadster = createRoadster();
  roadster.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(roadster.root);
  const missions = makeMissions(scene, world);

  // ---------- 입력 ----------
  const keys = new Set();
  const touch = { roll: 0, pitch: 0, yaw: 0, thrUp: false, thrDown: false, boost: false };
  const KEYMAP = {
    roll: { plus: ['KeyD', 'ArrowRight'], minus: ['KeyA', 'ArrowLeft'] },
    pitch: { plus: ['KeyW', 'ArrowUp'], minus: ['KeyS', 'ArrowDown'] },
    yaw: { plus: ['KeyE'], minus: ['KeyQ'] },
  };
  window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) { keys.add(e.code); return; }
    keys.add(e.code);
    if (!started) return;
    if (e.code === 'KeyC') cycleCamera();
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    if (e.code === 'KeyM') $('muteBtn').textContent = Sound.toggleMute() ? '🔇' : '🔊';
    if (e.code === 'KeyG') { showGizmo = !showGizmo; roadster.setGizmoVisible(showGizmo); }
    if (e.code === 'KeyN') nextMission();
    if (e.code === 'KeyH') $('help').classList.toggle('show');
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.querySelectorAll('[data-ax]').forEach(btn => {
    const ax = btn.dataset.ax, dir = +btn.dataset.dir;
    const on = e => { e.preventDefault(); touch[ax] = dir; btn.setPointerCapture && btn.setPointerCapture(e.pointerId); };
    const off = () => { if (touch[ax] === dir) touch[ax] = 0; };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  });
  document.querySelectorAll('[data-btn]').forEach(btn => {
    const k = btn.dataset.btn;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); touch[k] = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => btn.addEventListener(ev, () => { touch[k] = false; }));
  });

  function axisInput(ax) {
    let v = 0;
    if (KEYMAP[ax].plus.some(k => keys.has(k))) v += 1;
    if (KEYMAP[ax].minus.some(k => keys.has(k))) v -= 1;
    if (v === 0) v = touch[ax];
    return v;
  }

  // ---------- 비행 상태 ----------
  const ROLL_RATE = 110, PITCH_RATE = 55, YAW_RATE = 35; // °/s
  const F = {
    pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), quat: new THREE.Quaternion(),
    speed: 60, sinkV: 0, throttle: 0.4, boost: 0, ground: false, driveHeading: 0,
    roll: 0, pitch: 0, heading: 0, dRoll: 0, dPitch: 0, dYaw: 0,
  };
  const cmd = { roll: 0, pitch: 0, yaw: 0 };
  const raw = { roll: 0, pitch: 0, yaw: 0 };
  const fwd = new THREE.Vector3(), upv = new THREE.Vector3(), right = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const fwdSmooth = new THREE.Vector3(0, 0, -1);

  let started = false, paused = false, showGizmo = true;
  let missionIdx = 0, mState = null, mDone = false, mDoneTimer = 0;
  let crashed = false, crashTimer = 0, crashes = 0;
  let camMode = 0;
  const CAM_NAMES = ['추적 카메라 (수평 유지)', '조종석 뒤 (기체와 함께 회전)', '옆에서 보기', '위에서 보기'];

  function spawn() {
    const s = missions[missionIdx].spawn;
    F.pos.set(s.x, s.y, s.z);
    F.prevPos.copy(F.pos);
    F.quat.setFromAxisAngle(AX.y, -s.heading * DEG);
    F.speed = 70; F.sinkV = 0; F.throttle = 0.45; F.boost = 0; F.ground = false;
    cmd.roll = cmd.pitch = cmd.yaw = 0;
    fwdSmooth.set(0, 0, -1).applyQuaternion(F.quat);
    roadster.root.visible = true;
    placeCamera(1);
  }

  function startMission(i) {
    const prev = missions[missionIdx];
    if (mState && prev.cleanup) prev.cleanup(mState);
    missionIdx = Math.max(0, Math.min(i, missions.length - 1));
    const m = missions[missionIdx];
    mState = m.init();
    mDone = false;
    crashed = false;
    $('crash').classList.remove('show');
    booms.forEach(b => { b.sp.visible = false; });
    showMissionInfo(m);
    spawn();
  }
  function restartMission() { startMission(missionIdx); }
  function nextMission() { startMission((missionIdx + 1) % missions.length); }

  function showMissionInfo(m) {
    $('mStep').textContent = m.axis === 'free' ? '자유 비행' : `미션 ${missionIdx + 1} / ${missions.length - 1}`;
    $('mTitle').textContent = m.title;
    $('mDesc').innerHTML = m.desc;
    $('mKeys').innerHTML = m.keys.map(k => `<span class="mk"><kbd>${k[0]}</kbd><b>${k[1]}</b> ${k[2]}</span>`).join('');
    $('missionPanel').dataset.axis = m.axis;
    document.querySelectorAll('.axis').forEach(el => el.classList.toggle('focus', m.axis === el.dataset.axis));
  }

  // ---------- 충돌 ----------
  const probe = new THREE.Vector3();
  function checkCollision() {
    for (const off of [0, 2.0, -2.0]) {
      probe.copy(F.pos).addScaledVector(fwd, off);
      const h = GEO.height(probe.x, probe.z);
      if (h < 0 && probe.y < 0.4) return F.ground ? '물에 빠졌어요 (자동차는 바다·강을 달릴 수 없어요)' : '바다에 빠졌어요';
      if (!F.ground && h >= 0 && probe.y < h + 0.5) return '땅에 거꾸로 부딪혔어요 (바퀴가 아래로 오게 내려앉아야 해요)';
      const hit = Colliders.test(probe, 0.9);
      if (hit) return `${hit}에 부딪혔어요`;
    }
    const b = GEO.bounds, m = 1500;
    if (F.pos.x < b.minX - m || F.pos.x > b.maxX + m || F.pos.z < b.minZ - m || F.pos.z > b.maxZ + m) return '포항을 너무 멀리 벗어났어요';
    return null;
  }

  // 폭발 효과
  const boomTex = makeCanvasTexture(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.4, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(120,40,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const booms = [];
  for (let i = 0; i < 24; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: boomTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.visible = false; scene.add(sp);
    booms.push({ sp, vel: new THREE.Vector3(), life: 0 });
  }
  function explode(p) {
    for (const b of booms) {
      b.sp.position.copy(p); b.sp.visible = true; b.life = 1.2;
      b.vel.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 10);
    }
  }

  function crash(reason) {
    crashed = true; crashTimer = 2.2; crashes++;
    explode(F.pos);
    roadster.root.visible = false;
    Sound.crash();
    $('crash').innerHTML = `<div class="big">쾅! 💥</div><div>${reason}</div><div class="small">처음 위치로 초기화합니다…</div>`;
    $('crash').classList.add('show');
  }
  function fail(reason) {
    crashed = true; crashTimer = 2.2;
    $('crash').innerHTML = `<div class="big">다시 해 봐요!</div><div>${reason}</div><div class="small">미션을 처음부터 다시 시작합니다…</div>`;
    $('crash').classList.add('show');
  }

  // ---------- 비행 물리 ----------
  function fly(dt) {
    raw.roll = axisInput('roll'); raw.pitch = axisInput('pitch'); raw.yaw = axisInput('yaw');
    const k = 1 - Math.exp(-7 * dt);
    for (const a of ['roll', 'pitch', 'yaw']) cmd[a] += (raw[a] - cmd[a]) * k;

    if (keys.has('KeyR') || touch.thrUp) F.throttle = Math.min(1, F.throttle + dt * 0.5);
    if (keys.has('KeyF') || touch.thrDown) F.throttle = Math.max(0, F.throttle - dt * 0.5);
    const boosting = keys.has('Space') || touch.boost;
    F.boost += ((boosting ? 1 : 0) - F.boost) * (1 - Math.exp(-6 * dt));

    if (F.ground) { drive(dt); return; }

    // 조종 입력에 따른 회전 (기체 기준 축)
    F.dRoll = cmd.roll * ROLL_RATE * dt;
    F.dPitch = cmd.pitch * PITCH_RATE * dt;
    F.dYaw = cmd.yaw * YAW_RATE * dt;
    F.quat.multiply(qTmp.setFromAxisAngle(AX.x, F.dPitch * DEG));   // 피치 + : 기수 위
    F.quat.multiply(qTmp.setFromAxisAngle(AX.y, -F.dYaw * DEG));    // 요 + : 기수 오른쪽
    F.quat.multiply(qTmp.setFromAxisAngle(AX.z, -F.dRoll * DEG));   // 롤 + : 오른쪽 아래로

    fwd.set(0, 0, -1).applyQuaternion(F.quat);
    upv.set(0, 1, 0).applyQuaternion(F.quat);
    right.set(1, 0, 0).applyQuaternion(F.quat);
    F.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) / DEG;
    F.roll = Math.atan2(-right.y, upv.y) / DEG;

    // 기울이면(롤) 양력이 옆으로 기울어 그 방향으로 선회
    const lift = GEO.smooth(18, 34, F.speed);
    // (거의 90°로 세운 칼날 비행에서는 양력이 없어 선회하지 않음)
    const knife = THREE.MathUtils.clamp((Math.abs(Math.cos(F.roll * DEG)) - 0.17) * 3, 0, 1);
    const turn = Math.sin(F.roll * DEG) * Math.cos(F.pitch * DEG) * 0.6 * lift * knife;
    F.quat.premultiply(qTmp.setFromAxisAngle(AX.y, -turn * dt));
    F.quat.normalize();
    fwd.set(0, 0, -1).applyQuaternion(F.quat);
    upv.set(0, 1, 0).applyQuaternion(F.quat);
    F.heading = (Math.atan2(fwd.x, -fwd.z) / DEG + 360) % 360;

    // 속도: 스로틀 + 스러스터, 오르막에서는 느려지고 내리막에서는 빨라짐
    const target = 35 + F.throttle * 75 + F.boost * 75;
    F.speed += (target > F.speed ? (12 + F.boost * 30) : -8) * dt * Math.min(1, Math.abs(target - F.speed) / 5);
    F.speed -= 9.8 * Math.sin(F.pitch * DEG) * 0.6 * dt;
    F.speed = THREE.MathUtils.clamp(F.speed, 5, 190);

    // 양력 vs 중력: 수평일 때는 고도 유지, 기울거나 느리면 가라앉음
    F.sinkV += (9.8 * lift * upv.y - 9.8) * 0.55 * dt;
    F.sinkV *= Math.exp(-0.9 * dt);
    F.sinkV = THREE.MathUtils.clamp(F.sinkV, -30, 6);
    // 너무 느리면 기수가 아래로 떨어짐 (실속)
    if (lift < 0.6 && F.pitch > -40) F.quat.multiply(qTmp.setFromAxisAngle(AX.x, -(0.6 - lift) * 1.2 * dt));

    F.prevPos.copy(F.pos);
    F.pos.addScaledVector(fwd, F.speed * dt);
    F.pos.y += F.sinkV * dt;
    if (F.pos.y > 1500) { F.pos.y = 1500; F.sinkV = Math.min(F.sinkV, 0); }
    touchdown();

    roadster.root.position.copy(F.pos);
    roadster.root.quaternion.copy(F.quat);
    roadster.update(dt, cmd, F.speed, F.boost);
  }

  // ---------- 땅에 내려앉기 / 자동차 주행 ----------
  // 바퀴가 아래를 향한 채 땅에 닿으면 착지해서 자동차처럼 달림 (뒤집히거나 거꾸로 꽂히면 충돌)
  const TAKEOFF_SPEED = 120 / 3.6;
  const groundN = new THREE.Vector3(), qGround = new THREE.Quaternion();
  function groundNormal(x, z) {
    const hx = GEO.height(x + 1, z) - GEO.height(x - 1, z);
    const hz = GEO.height(x, z + 1) - GEO.height(x, z - 1);
    return groundN.set(-hx / 2, 1, -hz / 2).normalize();
  }
  function touchdown() {
    let contact = false;
    for (const off of [0, 2.0, -2.0]) {
      probe.copy(F.pos).addScaledVector(fwd, off);
      const h = GEO.height(probe.x, probe.z);
      if (h >= 0 && probe.y < h + 0.5) contact = true;
    }
    if (!contact || upv.y < 0.5 || F.pitch < -40) return;
    if (GEO.height(F.pos.x, F.pos.z) < 0) return;
    F.ground = true;
    F.driveHeading = F.heading;
    F.sinkV = 0;
    F.pos.y = GEO.height(F.pos.x, F.pos.z) + 0.5;
    F.speed = Math.min(F.speed, 70);
    toast('🚗 착지! 이제 땅 위를 달려요<br><small>W(피치 +)를 누르면 120km/h 이상에서 다시 이륙</small>', 2600);
  }

  function drive(dt) {
    // 자동차 핸들 = 요(Yaw): A/D 또는 Q/E 로 방향을 돌림
    const steer = raw.yaw !== 0 ? raw.yaw : raw.roll;
    raw.roll = 0; raw.yaw = steer;
    cmd.roll += (0 - cmd.roll) * (1 - Math.exp(-7 * dt));
    const braking = raw.pitch < 0;

    const turnRate = 55 * Math.min(1, F.speed / 8) / (1 + F.speed / 60);
    F.dYaw = steer * turnRate * dt;
    F.dRoll = 0; F.dPitch = 0;
    F.driveHeading = (F.driveHeading + F.dYaw + 360) % 360;

    // 속도: 스로틀로 가속, S(피치 −)는 브레이크, 오르막은 느려짐
    const target = braking ? 0 : 8 + F.throttle * 52 + F.boost * 60;
    const acc = braking ? -25 : target > F.speed ? 9 + F.boost * 22 : -5;
    F.speed += acc * dt * Math.min(1, Math.abs(target - F.speed) / 3 + (braking ? 1 : 0));

    const n = groundNormal(F.pos.x, F.pos.z);
    qGround.setFromUnitVectors(AX.y, n).multiply(qTmp.setFromAxisAngle(AX.y, -F.driveHeading * DEG));
    F.quat.slerp(qGround, 1 - Math.exp(-12 * dt));
    fwd.set(0, 0, -1).applyQuaternion(qGround);
    F.speed -= 9.8 * fwd.y * dt;
    F.speed = THREE.MathUtils.clamp(F.speed, 0, 130);

    F.prevPos.copy(F.pos);
    F.pos.x += fwd.x * F.speed * dt;
    F.pos.z += fwd.z * F.speed * dt;
    const h = GEO.height(F.pos.x, F.pos.z);
    F.pos.y = Math.max(h, -0.5) + 0.5;

    fwd.set(0, 0, -1).applyQuaternion(F.quat);
    upv.set(0, 1, 0).applyQuaternion(F.quat);
    right.set(1, 0, 0).applyQuaternion(F.quat);
    F.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) / DEG;
    F.roll = Math.atan2(-right.y, upv.y) / DEG;
    F.heading = F.driveHeading;

    // 이륙: 충분히 빠를 때 W(피치 +)로 앞코를 들어 올림
    if (raw.pitch > 0 && F.speed >= TAKEOFF_SPEED) {
      F.ground = false;
      F.quat.multiply(qTmp.setFromAxisAngle(AX.x, 8 * DEG));
      F.pos.y += 0.6;
      F.sinkV = 3;
      toast('✈️ 이륙!', 1400);
    }

    roadster.root.position.copy(F.pos);
    roadster.root.quaternion.copy(F.quat);
    roadster.update(dt, cmd, F.speed, F.boost);
  }

  // ---------- 카메라 ----------
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function cycleCamera() { camMode = (camMode + 1) % CAM_NAMES.length; $('camName').textContent = CAM_NAMES[camMode]; }
  function placeCamera(snap) {
    fwdSmooth.lerp(fwd.lengthSq() ? fwd : fwdSmooth, snap ? 1 : 1 - Math.exp(-3.5 * 0.016)).normalize();
    const flat = new THREE.Vector3(fwdSmooth.x, 0, fwdSmooth.z);
    if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1);
    flat.normalize();
    camera.up.set(0, 1, 0);
    if (camMode === 0) {
      camPos.copy(F.pos).addScaledVector(fwdSmooth, -10).add(new THREE.Vector3(0, 2.8, 0));
      camLook.copy(F.pos).addScaledVector(fwdSmooth, 6);
    } else if (camMode === 1) {
      const back = new THREE.Vector3(0, 2.0, 8.5).applyQuaternion(F.quat);
      camPos.copy(F.pos).add(back);
      camLook.copy(F.pos).addScaledVector(fwd, 8);
      camera.up.set(0, 1, 0).applyQuaternion(F.quat);
    } else if (camMode === 2) {
      const side = new THREE.Vector3(-flat.z, 0, flat.x);
      camPos.copy(F.pos).addScaledVector(side, 13).add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(flat, 2);
      camLook.copy(F.pos);
    } else {
      camPos.copy(F.pos).add(new THREE.Vector3(0, 24, 0)).addScaledVector(flat, -6);
      camLook.copy(F.pos).addScaledVector(flat, 3);
    }
    // 카메라가 땅이나 물 아래로 내려가지 않게
    const gh = Math.max(GEO.height(camPos.x, camPos.z), 0) + 1.5;
    if (camPos.y < gh) camPos.y = gh;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  // ---------- 화면 표시 ----------
  const els = {};
  ['roll', 'pitch', 'yaw'].forEach(a => {
    els[a] = { plus: document.querySelector(`.axis[data-axis="${a}"] .lamp.plus`), minus: document.querySelector(`.axis[data-axis="${a}"] .lamp.minus`), val: $(`val-${a}`), card: document.querySelector(`.axis[data-axis="${a}"]`) };
  });
  const NAMES = {
    roll: { plus: '롤 + (오른쪽으로 기울기)', minus: '롤 − (왼쪽으로 기울기)' },
    pitch: { plus: '피치 + (기수 올리기)', minus: '피치 − (기수 내리기)' },
    yaw: { plus: '요 + (기수를 오른쪽으로)', minus: '요 − (기수를 왼쪽으로)' },
  };
  const compass = d => ['북', '북동', '동', '남동', '남', '남서', '서', '북서'][Math.round(d / 45) % 8];

  function updateHUD() {
    const now = [];
    for (const a of ['roll', 'pitch', 'yaw']) {
      const v = raw[a];
      els[a].plus.classList.toggle('on', v > 0);
      els[a].minus.classList.toggle('on', v < 0);
      els[a].card.classList.toggle('active', v !== 0);
      if (v > 0) now.push(`<span class="now-${a}">${NAMES[a].plus}</span>`);
      if (v < 0) now.push(`<span class="now-${a}">${NAMES[a].minus}</span>`);
    }
    const idleText = F.ground
      ? '🚗 주행 중 · 핸들은 요(A/D, Q/E) · R 가속 · S 브레이크 · W 이륙 (120km/h 이상)'
      : '키를 누르면 여기에 표시돼요';
    $('nowInput').innerHTML = now.length ? (F.ground ? '🚗 ' : '') + '지금 누른 것: ' + now.join(' ') : `<span class="dim">${idleText}</span>`;
    $('modeBadge').textContent = F.ground ? '🚗 주행 모드' : '✈️ 비행 모드';
    $('modeBadge').classList.toggle('drive', F.ground);
    $('nowInput').classList.toggle('show', now.length > 0);

    const r = F.roll, p = F.pitch, h = F.heading;
    const rr = Math.round(r) || 0, pr = Math.round(p) || 0;
    els.roll.val.textContent = `${Math.abs(rr)}° ${rr === 0 ? '수평' : rr > 0 ? '오른쪽' : '왼쪽'}`;
    els.pitch.val.textContent = `${pr > 0 ? '+' : ''}${pr}° ${pr === 0 ? '수평' : pr > 0 ? '위로' : '아래로'}`;
    els.yaw.val.textContent = `${h.toFixed(0).padStart(3, '0')}° ${compass(h)}`;
    $('rollCar').setAttribute('transform', `rotate(${r.toFixed(1)} 50 55)`);
    $('pitchCar').setAttribute('transform', `rotate(${(-p).toFixed(1)} 50 55)`);
    $('yawCar').setAttribute('transform', `rotate(${h.toFixed(1)} 50 50)`);

    $('spd').textContent = Math.round(F.speed * 3.6);
    $('alt').textContent = Math.round(F.pos.y);
    const ground = Math.max(GEO.height(F.pos.x, F.pos.z), 0);
    $('agl').textContent = Math.round(F.pos.y - ground);
    $('thrBar').style.height = `${F.throttle * 100}%`;
    $('boostLamp').classList.toggle('on', F.boost > 0.3);
    $('crashCount').textContent = crashes;

    const b = GEO.bounds;
    const out = F.pos.x < b.minX || F.pos.x > b.maxX || F.pos.z < b.minZ || F.pos.z > b.maxZ;
    let warn = '';
    if (out) warn = '포항 지도 밖이에요! 돌아가세요';
    else if (F.ground) warn = raw.pitch > 0 && F.speed < TAKEOFF_SPEED ? `이륙하려면 120km/h 이상! (지금 ${Math.round(F.speed * 3.6)}km/h · R로 가속)` : '';
    else if (F.speed < 30) warn = '너무 느려요! 실속 — R키 또는 스페이스로 속도를 올려요';
    else if (F.pos.y - ground < 25 && F.sinkV < -3) warn = '고도가 낮아요! 기수를 올려요 (W)';
    $('warn').textContent = warn;
    $('warn').classList.toggle('show', !!warn);
  }

  // 목표 표시 (화면 위 마커 또는 화면 가장자리 화살표)
  const tv = new THREE.Vector3();
  function updateTarget(t) {
    const mk = $('target');
    if (!t) { mk.style.display = 'none'; return; }
    mk.style.display = 'block';
    tv.copy(t.pos).project(camera);
    const dist = Math.round(F.pos.distanceTo(t.pos));
    const behind = tv.z > 1;
    let x = tv.x, y = tv.y;
    if (behind) { x = -x; y = -y; }
    const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.9;
    if (!onScreen) {
      const m = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8, 1e-3);
      x /= m; y /= m;
    }
    const W = window.innerWidth, Hh = window.innerHeight;
    mk.style.left = `${(x * 0.5 + 0.5) * W}px`;
    mk.style.top = `${(-y * 0.5 + 0.5) * Hh}px`;
    mk.classList.toggle('edge', !onScreen);
    $('targetArrow').style.transform = `rotate(${Math.atan2(-y, x) / DEG + 90}deg)`;
    $('targetText').textContent = `${t.label} ${dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : dist + 'm'}`;
  }

  // 미니맵
  const mm = $('minimap'), mg = mm.getContext('2d');
  function drawMinimap(t) {
    const S = mm.width, R = 3200, k = S / (2 * R);
    const cx = F.pos.x, cz = F.pos.z;
    const tx = x => S / 2 + (x - cx) * k, tz = z => S / 2 + (z - cz) * k;
    mg.fillStyle = '#2a6f9e'; mg.fillRect(0, 0, S, S);
    mg.fillStyle = '#6f9a5c';
    mg.beginPath();
    GEO.coast.forEach((p, i) => i ? mg.lineTo(tx(p.x), tz(p.z)) : mg.moveTo(tx(p.x), tz(p.z)));
    mg.closePath(); mg.fill();
    mg.fillStyle = 'rgba(200,200,190,0.55)';
    for (const c of GEO.cities) { mg.beginPath(); mg.arc(tx(c.x), tz(c.z), c.r * k, 0, Math.PI * 2); mg.fill(); }
    mg.fillStyle = 'rgba(120,150,190,0.7)';
    mg.beginPath(); mg.arc(tx(GEO.posco.x), tz(GEO.posco.z), GEO.posco.r * k, 0, Math.PI * 2); mg.fill();
    mg.strokeStyle = '#2a6f9e'; mg.lineWidth = Math.max(2, GEO.RIVER_HW * 2 * k);
    mg.beginPath();
    GEO.river.forEach((p, i) => i ? mg.lineTo(tx(p.x), tz(p.z)) : mg.moveTo(tx(p.x), tz(p.z)));
    mg.stroke();
    mg.font = 'bold 11px sans-serif'; mg.textAlign = 'center';
    const P = GEO.POI;
    for (const [n, p] of [['스페이스워크', P.spacewalk], ['영일대', P.yeongildae], ['상생의 손', P.hand], ['포스코', GEO.posco], ['포항역', P.station], ['공항', P.airport]]) {
      mg.fillStyle = '#ffe27a'; mg.beginPath(); mg.arc(tx(p.x), tz(p.z), 3, 0, Math.PI * 2); mg.fill();
      mg.fillStyle = '#fff'; mg.fillText(n, tx(p.x), tz(p.z) - 6);
    }
    if (t) {
      mg.strokeStyle = '#ff4fd8'; mg.lineWidth = 2;
      mg.beginPath(); mg.arc(tx(t.pos.x), tz(t.pos.z), 6, 0, Math.PI * 2); mg.stroke();
    }
    mg.save();
    mg.translate(S / 2, S / 2); mg.rotate(F.heading * DEG);
    mg.fillStyle = '#fff'; mg.strokeStyle = '#000'; mg.lineWidth = 1;
    mg.beginPath(); mg.moveTo(0, -9); mg.lineTo(6, 7); mg.lineTo(0, 3); mg.lineTo(-6, 7); mg.closePath(); mg.fill(); mg.stroke();
    mg.restore();
    mg.fillStyle = '#fff'; mg.font = 'bold 13px sans-serif'; mg.fillText('N', S / 2, 14);
  }

  function toast(html, ms = 2200) {
    const t = $('toast');
    t.innerHTML = html; t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function togglePause() {
    paused = !paused;
    $('pause').classList.toggle('show', paused);
  }

  // ---------- 메인 루프 ----------
  function step(dt) {
    const m = missions[missionIdx];
    if (crashed) {
      crashTimer -= dt;
      for (const b of booms) {
        if (!b.sp.visible) continue;
        b.life -= dt;
        b.sp.position.addScaledVector(b.vel, dt);
        b.sp.scale.setScalar(3 + (1.2 - b.life) * 14);
        b.sp.material.opacity = Math.max(b.life / 1.2, 0);
        if (b.life <= 0) b.sp.visible = false;
      }
      if (crashTimer <= 0) {
        crashed = false;
        booms.forEach(b => { b.sp.visible = false; });
        $('crash').classList.remove('show');
        restartMission();
      }
    } else {
      fly(dt);
      const hit = checkCollision();
      if (hit) crash(hit);
      else if (!mDone) {
        const r = m.update(mState, F, dt);
        if (r.fail) fail(r.fail);
        else {
          $('mStatus').innerHTML = r.text;
          $('mBar').style.width = `${Math.round(r.progress * 100)}%`;
          if (r.done) {
            mDone = true; mDoneTimer = 3;
            Sound.win();
            const last = missionIdx === missions.length - 2;
            toast(last ? '🏆 모든 미션 성공! 🏆<br><small>이제 자유 비행을 즐겨요</small>' : `🎉 미션 성공! 🎉<br><small>${m.title}</small>`, 2800);
          }
        }
      } else {
        mDoneTimer -= dt;
        if (mDoneTimer <= 0) nextMission();
      }
    }
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!started) {
      // 시작 화면 배경: 로드스터 주위를 천천히 도는 카메라
      const a = now * 0.00015;
      roadster.setGizmoVisible(false);
      camera.position.set(F.pos.x + Math.cos(a) * 9, F.pos.y + 2, F.pos.z + Math.sin(a) * 9);
      camera.up.set(0, 1, 0);
      camera.lookAt(F.pos);
      world.update(dt, camera, F.pos);
      renderer.render(scene, camera);
      return;
    }
    if (paused) { renderer.render(scene, camera); return; }

    // 프레임이 느려도 실제 시간대로 움직이도록 작은 단계로 나눠 계산
    const n = Math.ceil(dt / (1 / 60));
    for (let i = 0; i < n; i++) step(dt / n);
    const m = missions[missionIdx];

    placeCamera(false);
    world.update(dt, camera, F.pos);
    const t = m.target && !crashed ? m.target(mState) : null;
    updateHUD();
    updateTarget(t);
    drawMinimap(t);
    Sound.update(F.speed, F.boost, !crashed);
    renderer.render(scene, camera);
  }

  // ---------- 시작 화면 ----------
  const list = $('missionList');
  missions.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = `ml ml-${m.axis}`;
    b.innerHTML = `<span>${m.axis === 'free' ? '★' : i + 1}</span>${m.title}`;
    b.onclick = () => begin(i);
    list.appendChild(b);
  });
  function begin(i) {
    Sound.init();
    $('start').classList.add('hide');
    $('hud').classList.add('show');
    started = true;
    paused = false;
    $('pause').classList.remove('show');
    roadster.setGizmoVisible(showGizmo);
    last = performance.now();
    startMission(i);
  }
  $('startBtn').onclick = () => begin(0);
  $('menuBtn').onclick = () => { paused = true; $('pause').classList.add('show'); };
  $('resumeBtn').onclick = () => togglePause();
  $('restartBtn').onclick = () => { togglePause(); restartMission(); };
  $('toMenuBtn').onclick = () => { togglePause(); started = false; $('start').classList.remove('hide'); $('hud').classList.remove('show'); };
  $('camBtn').onclick = () => cycleCamera();
  $('muteBtn').onclick = () => { $('muteBtn').textContent = Sound.toggleMute() ? '🔇' : '🔊'; };
  $('camName').textContent = CAM_NAMES[0];

  // 시작 화면에 보여 줄 로드스터 위치
  F.pos.set(GEO.POI.start.x, 160, GEO.POI.start.z);
  F.quat.setFromAxisAngle(AX.y, -75 * DEG);
  roadster.root.position.copy(F.pos);
  roadster.root.quaternion.copy(F.quat);
  requestAnimationFrame(loop);
  // 자동 테스트용: 키를 누른 채로 seconds 초 동안 시뮬레이션
  function simulate(seconds, codes = []) {
    codes.forEach(c => keys.add(c));
    for (let t = 0; t < seconds; t += 1 / 60) step(1 / 60);
    codes.forEach(c => keys.delete(c));
  }
  window.__game = { F, missions, startMission, scene, camera, simulate, world, state: () => ({ missionIdx, mState, crashed, crashes, mDone }) };
})();
