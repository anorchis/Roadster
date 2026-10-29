// 롤·피치·요를 배우는 미션들
// update(st, f, dt) 에서 f 는 비행 정보:
//   pos, prevPos, roll(°, +오른쪽), pitch(°, +기수 위), heading(°, 0=북쪽 시계방향),
//   dRoll / dPitch / dYaw (이번 프레임에 조종 입력으로 회전한 각도, °), speed(m/s)

function headingTo(a, b) {
  return (Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI + 360) % 360;
}

const RingKit = {
  geo: null,
  make(scene, center, next, radius) {
    if (!this.geo) this.geo = new THREE.TorusGeometry(1, 0.08, 10, 48);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9 });
    const m = new THREE.Mesh(this.geo, mat);
    m.scale.setScalar(radius);
    m.position.copy(center);
    const n = next.clone().sub(center).normalize();
    m.lookAt(center.clone().add(n));
    scene.add(m);
    return { mesh: m, center: center.clone(), normal: n, radius, passed: false };
  },
  // 선분 prev→cur 이 고리 면을 고리 안쪽으로 통과했는지
  crossed(r, prev, cur) {
    const d0 = prev.clone().sub(r.center).dot(r.normal);
    const d1 = cur.clone().sub(r.center).dot(r.normal);
    if (d0 > 0 || d1 < 0) return false;
    const t = d0 / (d0 - d1);
    const hit = prev.clone().lerp(cur, t);
    return hit.distanceTo(r.center) < r.radius;
  },
  // 목표 고리를 노랗게, 지난 고리는 초록, 나머지는 흐리게
  paint(rings, idx) {
    rings.forEach((r, i) => {
      r.mesh.material.color.setHex(i < idx ? 0x45e27a : i === idx ? 0xffd23f : 0xffffff);
      r.mesh.material.opacity = i < idx ? 0.25 : i === idx ? 0.95 : 0.35;
    });
  },
};

function makeMissions(scene, world) {
  const P = GEO.POI;
  const start = { x: P.start.x, z: P.start.z, y: 230, heading: 75 };

  // 고리 코스 미션 공통
  function ringMission(def) {
    return Object.assign({
      init() {
        const pts = def.points();
        const rings = pts.map((p, i) => {
          const nxt = pts[i + 1] || p.clone().add(p.clone().sub(pts[i - 1]));
          return RingKit.make(scene, p, nxt, def.radius);
        });
        RingKit.paint(rings, 0);
        return { rings, idx: 0 };
      },
      update(st, f) {
        const r = st.rings[st.idx];
        if (r && RingKit.crossed(r, f.prevPos, f.pos)) {
          st.idx++;
          RingKit.paint(st.rings, st.idx);
          Sound.ding(0.5);
        }
        const n = st.rings.length;
        return { progress: st.idx / n, text: `통과한 고리: ${st.idx} / ${n}`, done: st.idx >= n };
      },
      target(st) { const r = st.rings[st.idx]; return r ? { pos: r.center, label: `고리 ${st.idx + 1}` } : null; },
      cleanup(st) { st.rings.forEach(r => scene.remove(r.mesh)); },
    }, def);
  }

  const riverRings = () => {
    const hs = [38, 52, 34, 58, 42, 66, 48];
    return [1, 2, 3, 4, 5, 6, 7].map((i, k) => new THREE.Vector3(GEO.river[i].x, hs[k], GEO.river[i].z));
  };
  const riverSpawn = (() => {
    const a = GEO.river[0], b = GEO.river[1];
    const x = a.x + (a.x - b.x) * 2.5, z = a.z + (a.z - b.z) * 2.5;
    return { x, z, y: 45, heading: headingTo({ x, z }, b) };
  })();

  const homiSpawn = GEO.ll(36.030, 129.445);
  // 영일만을 가로질러 호미곶 북쪽 바다로 돌아 들어간 뒤 상생의 손 위로
  const homiRings = () => {
    const s = new THREE.Vector3(homiSpawn.x, 110, homiSpawn.z);
    const tipN = GEO.ll(36.086, 129.552);
    const t = new THREE.Vector3(tipN.x, 45, tipN.z);
    const side = new THREE.Vector3(-(t.z - s.z), 0, t.x - s.x).normalize();
    const pts = [[0.3, 105, 0], [0.6, 70, 90], [0.88, 90, -60]].map(([f, h, o]) => s.clone().lerp(t, f).setY(h).addScaledVector(side, o));
    pts.push(t, new THREE.Vector3(P.hand.x, 28, P.hand.z - 45));
    return pts;
  };

  const gate = world.gate;
  const sw = world.spacewalk;

  return [
    {
      title: '롤(Roll) 배우기', axis: 'roll',
      desc: '롤은 차의 앞뒤를 꿰뚫는 축을 중심으로 좌우로 <b>기울이는</b> 움직임이에요. 비행기가 날개를 기울이는 것과 같아요.',
      keys: [['D / →', '롤 +', '오른쪽으로 기울기'], ['A / ←', '롤 −', '왼쪽으로 기울기']],
      spawn: start,
      init() { return { phase: 0, hold: 0 }; },
      update(st, f, dt) {
        const dir = st.phase === 0 ? 1 : -1;
        const name = dir > 0 ? '오른쪽(롤 +, D키)' : '왼쪽(롤 −, A키)';
        if (f.roll * dir >= 45) st.hold += dt; else st.hold = Math.max(0, st.hold - dt * 2);
        if (st.hold >= 2) { st.phase++; st.hold = 0; Sound.ding(0.4); }
        const deg = Math.round(Math.abs(f.roll));
        return {
          progress: (st.phase + Math.min(st.hold / 2, 1)) / 2,
          text: st.phase < 2 ? `${name}으로 45° 이상 기울여 2초 버티기<br>지금 ${deg}° ${f.roll >= 0 ? '오른쪽' : '왼쪽'} · ${st.hold.toFixed(1)} / 2.0초` : '',
          done: st.phase >= 2,
        };
      },
    },
    {
      title: '피치(Pitch) 배우기', axis: 'pitch',
      desc: '피치는 좌우를 꿰뚫는 축을 중심으로 <b>앞코를 들거나 숙이는</b> 움직임이에요. 앞코를 들면 올라가고, 숙이면 내려가요.',
      keys: [['W / ↑', '피치 +', '기수(앞코) 올리기'], ['S / ↓', '피치 −', '기수(앞코) 내리기']],
      spawn: { ...start, y: 220 },
      init() { return { phase: 0 }; },
      update(st, f) {
        const alt = Math.round(f.pos.y);
        if (st.phase === 0 && f.pos.y >= 420) { st.phase = 1; Sound.ding(0.4); }
        if (st.phase === 1 && f.pos.y <= 150) { st.phase = 2; }
        const t = st.phase === 0
          ? `피치 +(W키)로 앞코를 들어 고도 420m까지 올라가기<br>지금 고도 ${alt}m · 피치 ${Math.round(f.pitch)}°`
          : `이번엔 피치 −(S키)로 앞코를 숙여 고도 150m 아래로!<br>지금 고도 ${alt}m · 피치 ${Math.round(f.pitch)}°`;
        const p = st.phase === 0 ? Math.min(Math.max((f.pos.y - 220) / 200, 0), 1) * 0.5 : 0.5 + Math.min(Math.max((420 - f.pos.y) / 270, 0), 1) * 0.5;
        return { progress: st.phase >= 2 ? 1 : p, text: t, done: st.phase >= 2 };
      },
    },
    {
      title: '요(Yaw) 배우기', axis: 'yaw',
      desc: '요는 위아래를 꿰뚫는 축을 중심으로 <b>앞코를 좌우로 돌리는</b> 움직임이에요. 기울이지 않고 방향만 바꿔요.',
      keys: [['E', '요 +', '앞코를 오른쪽으로'], ['Q', '요 −', '앞코를 왼쪽으로']],
      spawn: start,
      init() { return { phase: 0, acc: 0 }; },
      update(st, f) {
        const dir = st.phase === 0 ? 1 : -1;
        let warn = '';
        if (Math.abs(f.roll) < 15) st.acc += f.dYaw * dir;
        else warn = '<br><span class="warn-text">기울어졌어요! 롤을 0°로 펴고 요만 써 보세요</span>';
        st.acc = Math.max(0, st.acc);
        if (st.acc >= 90) { st.phase++; st.acc = 0; Sound.ding(0.4); }
        const name = dir > 0 ? '오른쪽(요 +, E키)' : '왼쪽(요 −, Q키)';
        return {
          progress: (st.phase + Math.min(st.acc / 90, 1)) / 2,
          text: st.phase < 2 ? `날개를 수평으로 둔 채 ${name}으로 90° 돌기<br>돈 각도 ${Math.round(st.acc)}° / 90° · 지금 방위 ${Math.round(f.heading)}°${warn}` : '',
          done: st.phase >= 2,
        };
      },
    },
    {
      title: '한 바퀴 롤 (에일러론 롤)', axis: 'roll',
      desc: '롤 키를 계속 누르고 있으면 차가 앞뒤 축을 중심으로 <b>빙글 한 바퀴</b> 돌아요. 거꾸로 뒤집혀도 멈추지 마세요!',
      keys: [['D / →', '롤 +', '계속 누르기'], ['A / ←', '롤 −', '반대 방향도 OK']],
      spawn: { ...start, y: 320 },
      init() { return { acc: 0 }; },
      update(st, f) {
        if (f.dRoll * st.acc < 0) st.acc = 0;
        st.acc += f.dRoll;
        return { progress: Math.min(Math.abs(st.acc) / 360, 1), text: `한 방향으로 돈 롤 각도: ${Math.round(Math.abs(st.acc))}° / 360°`, done: Math.abs(st.acc) >= 360 };
      },
    },
    {
      title: '공중제비 (루프)', axis: 'pitch',
      desc: '피치 + 를 계속 눌러 앞코를 들고 또 들면, 하늘을 향했다가 거꾸로 뒤집혀 <b>동그랗게 한 바퀴</b> 돌아요. 속도가 빨라야 해요!',
      keys: [['W / ↑', '피치 +', '계속 누르기'], ['Space', '스러스터', '속도 올리기']],
      spawn: { ...start, y: 380 },
      init() { return { acc: 0 }; },
      update(st, f) {
        st.acc = Math.max(0, st.acc + f.dPitch);
        return { progress: Math.min(st.acc / 360, 1), text: `피치로 돈 각도: ${Math.round(st.acc)}° / 360°<br>속도 ${Math.round(f.speed * 3.6)} km/h (부스터를 써 보세요)`, done: st.acc >= 360 };
      },
    },
    {
      title: '스페이스워크 선회 비행', axis: 'mix',
      desc: '비행기는 <b>롤로 기울이고 피치로 당겨서</b> 방향을 틀어요. 환호공원 스페이스워크 주위를 크게 한 바퀴 돌아요.',
      keys: [['D / A', '롤', '기울이기'], ['W', '피치 +', '살짝 당기기']],
      spawn: (() => { const p = GEO.ll(36.046, 129.405); return { x: p.x, z: p.z, y: 200, heading: headingTo(p, sw) }; })(),
      init() { return { acc: 0, last: null }; },
      update(st, f) {
        const d = Math.hypot(f.pos.x - sw.x, f.pos.z - sw.z);
        const a = Math.atan2(f.pos.z - sw.z, f.pos.x - sw.x);
        let note = '';
        if (d < 800 && f.pos.y < 600) {
          if (st.last !== null) {
            let da = a - st.last;
            if (da > Math.PI) da -= Math.PI * 2;
            if (da < -Math.PI) da += Math.PI * 2;
            if (da * st.acc < 0 && Math.abs(st.acc) < 0.3) st.acc = 0;
            st.acc += da;
          }
          st.last = a;
        } else { st.last = null; note = '<br>스페이스워크 가까이(800m 안) 가세요'; }
        const deg = Math.abs(st.acc) * 180 / Math.PI;
        return { progress: Math.min(deg / 360, 1), text: `스페이스워크 둘레를 돈 각도: ${Math.round(deg)}° / 360°<br>거리 ${Math.round(d)}m · 롤 ${Math.round(f.roll)}°${note}`, done: deg >= 360 };
      },
      target() { return { pos: new THREE.Vector3(sw.x, sw.y + 30, sw.z), label: '스페이스워크' }; },
    },
    ringMission({
      title: '형산강 고리 통과', axis: 'mix',
      desc: '형산강을 따라 놓인 고리를 차례로 통과해요. 높이는 <b>피치</b>로, 방향은 <b>롤+피치</b> 또는 <b>요</b>로 맞추세요.',
      keys: [['W / S', '피치', '높이 맞추기'], ['A D / Q E', '롤 · 요', '방향 맞추기']],
      spawn: riverSpawn, radius: 18, points: riverRings,
    }),
    {
      title: '칼날 비행: 포스코 게이트', axis: 'roll',
      desc: '포스코 제철소의 좁은 틈은 차를 <b>옆으로 세워야(롤 60° 이상)</b> 지나갈 수 있어요. 칼날처럼 세워서 통과하세요!',
      keys: [['A / D', '롤', '90° 가까이 세우기'], ['W / S', '피치', '높이 맞추기']],
      spawn: { x: gate.x, z: gate.z - 560, y: gate.bottom + 30, heading: 180 },
      init() { return { done: false, msg: '' }; },
      update(st, f) {
        const crossed = f.prevPos.z < gate.z && f.pos.z >= gate.z;
        if (crossed && Math.abs(f.pos.x - gate.x) < gate.gap / 2 + 1 && f.pos.y > gate.bottom && f.pos.y < gate.top) {
          if (Math.abs(f.roll) >= 60) st.done = true;
          else return { progress: 0, text: '', fail: `기울기가 부족했어요 (롤 ${Math.round(Math.abs(f.roll))}°). 60° 이상 옆으로 세워 보세요!` };
        } else if (crossed && !st.done && Math.abs(f.pos.x - gate.x) < 300) {
          return { progress: 0, text: '', fail: '게이트를 지나쳤어요! 틈 사이로 정확히 지나가 보세요.' };
        }
        const dz = Math.round(gate.z - f.pos.z);
        return { progress: st.done ? 1 : Math.min(Math.max(1 - dz / 560, 0), 1) * 0.9, text: `게이트까지 ${Math.max(dz, 0)}m · 지금 롤 ${Math.round(f.roll)}° (60° 이상 필요)`, done: st.done };
      },
      target() { return { pos: new THREE.Vector3(gate.x, (gate.bottom + gate.top) / 2, gate.z), label: '칼날 게이트' }; },
    },
    ringMission({
      title: '호미곶 상생의 손까지', axis: 'mix',
      desc: '영일만을 가로질러 해 뜨는 호미곶 <b>상생의 손</b>까지 날아가요. 지금까지 배운 롤·피치·요를 모두 써 보세요!',
      keys: [['롤', 'A / D', '기울이기'], ['피치 · 요', 'W S / Q E', '높이 · 방향']],
      spawn: { x: homiSpawn.x, z: homiSpawn.z, y: 110, heading: headingTo(homiSpawn, P.hand) },
      radius: 16, points: homiRings,
    }),
    {
      title: '자유 비행', axis: 'free',
      desc: '모든 미션을 마쳤어요! 포항 하늘을 마음껏 날아 보세요. 스페이스워크, 영일대, 포스코, 호미곶을 찾아가 보세요.',
      keys: [['C', '카메라', '시점 바꾸기'], ['Space', '스러스터', '부스트']],
      spawn: start,
      init() { return {}; },
      update() { return { progress: 1, text: '자유 비행 중', done: false }; },
    },
  ];
}
