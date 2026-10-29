// 포항시 지형 데이터 (위도/경도 → 게임 좌표)
// 실제 포항의 해안선·형산강·주요 명소 위치를 단순화한 것입니다.
// 비행 시간이 너무 길지 않도록 수평 거리를 0.35배로 줄였습니다 (높이는 실제에 가깝게).
const GEO = (() => {
  const S = 0.35;
  const LAT0 = 36.04, LON0 = 129.40;
  const M_LAT = 111000, M_LON = 89800;

  function ll(lat, lon) {
    return { x: (lon - LON0) * M_LON * S, z: -(lat - LAT0) * M_LAT * S };
  }

  // 육지 다각형 (영일만 해안선 → 호미곶 → 구룡포 → 남쪽)
  const coastLL = [
    [36.20, 129.20], [36.20, 129.41], [36.16, 129.405], [36.12, 129.398],
    [36.09, 129.402], [36.072, 129.398], [36.064, 129.390], [36.057, 129.380],
    [36.045, 129.376], [36.034, 129.379], [36.022, 129.386], [36.012, 129.398],
    [36.003, 129.410], [35.998, 129.425], [36.005, 129.445], [36.020, 129.470],
    [36.035, 129.495], [36.050, 129.520], [36.065, 129.545], [36.078, 129.565],
    [36.070, 129.575], [36.040, 129.575], [36.010, 129.565], [35.985, 129.555],
    [35.950, 129.540], [35.900, 129.520], [35.900, 129.20],
  ];
  const coast = coastLL.map(p => ll(p[0], p[1]));

  // 형산강 (하구 → 상류)
  const riverLL = [
    [36.029, 129.392], [36.026, 129.382], [36.022, 129.370], [36.018, 129.358],
    [36.013, 129.345], [36.005, 129.330], [35.995, 129.312], [35.985, 129.295],
    [35.972, 129.275], [35.958, 129.255], [35.940, 129.230], [35.920, 129.210],
  ];
  const river = riverLL.map(p => ll(p[0], p[1]));
  const RIVER_HW = 48;

  // 시가지 (평탄하고 건물이 많은 곳)
  const cities = [
    { name: '중앙동·죽도', ...ll(36.040, 129.362), r: 520, density: 1.0 },
    { name: '두호·환여', ...ll(36.060, 129.372), r: 330, density: 0.9 },
    { name: '양덕·장성', ...ll(36.082, 129.385), r: 380, density: 0.9 },
    { name: '이동·대잠', ...ll(36.026, 129.335), r: 480, density: 0.9 },
    { name: '흥해·포항역', ...ll(36.072, 129.343), r: 260, density: 0.5 },
    { name: '송도', ...ll(36.033, 129.374), r: 150, density: 0.8 },
    { name: '오천', ...ll(35.968, 129.405), r: 320, density: 0.7 },
    { name: '구룡포', ...ll(35.988, 129.548), r: 180, density: 0.6 },
    { name: '효자·지곡', ...ll(36.010, 129.322), r: 300, density: 0.6 },
  ];
  const posco = { ...ll(36.006, 129.388), r: 600 };
  const airport = { ...ll(35.988, 129.420), len: 1200, wid: 60, angle: -0.17 };

  // 작은 언덕 (환호공원 등)
  const hills = [
    { ...ll(36.0665, 129.386), r: 130, h: 45 },
    { ...ll(36.0745, 129.562), r: 140, h: 18 },
  ];

  // 명소 좌표
  const POI = {
    start: ll(36.045, 129.405),
    spacewalk: ll(36.0665, 129.3868),
    yeongildae: ll(36.0566, 129.3815),
    hand: ll(36.0768, 129.5688),
    handLeft: ll(36.0766, 129.5650),
    lighthouse: ll(36.0752, 129.5630),
    poscoGate: ll(36.0085, 129.3835),
    station: ll(36.072, 129.343),
    jukdo: ll(36.042, 129.366),
    airport: ll(35.988, 129.420),
    guryongpo: ll(35.988, 129.553),
    postech: ll(36.013, 129.322),
  };

  const bounds = (() => {
    const a = ll(36.20, 129.20), b = ll(35.90, 129.62);
    return { minX: a.x, maxX: b.x, minZ: a.z, maxZ: b.z };
  })();

  // ---------- 노이즈 ----------
  function hash(i, j) {
    let h = i * 374761393 + j * 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z) {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
    return s / 0.97;
  }

  // ---------- 기하 ----------
  function pointInPoly(x, z, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }
  function segDist(x, z, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    const px = a.x + dx * t - x, pz = a.z + dz * t - z;
    return Math.sqrt(px * px + pz * pz);
  }
  function polylineDist(x, z, pts, closed) {
    let d = Infinity;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) d = Math.min(d, segDist(x, z, pts[i], pts[(i + 1) % pts.length]));
    return d;
  }
  const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  function cityFactor(x, z) {
    let f = 0;
    for (const c of cities) {
      const d = Math.hypot(x - c.x, z - c.z);
      f = Math.max(f, 1 - smooth(c.r * 0.8, c.r * 1.5, d));
    }
    const dp = Math.hypot(x - posco.x, z - posco.z);
    f = Math.max(f, 1 - smooth(posco.r * 0.9, posco.r * 1.4, dp));
    const da = Math.hypot(x - airport.x, z - airport.z);
    f = Math.max(f, 1 - smooth(650, 900, da));
    return f;
  }

  // 지면 높이 (바다는 음수)
  function height(x, z) {
    const land = pointInPoly(x, z, coast);
    const dc = polylineDist(x, z, coast, true);
    if (!land) return -1.5 - Math.min(dc * 0.03, 30);

    let h = 0.6 + smooth(0, 70, dc) * 3.5;
    const flat = cityFactor(x, z);
    const dr = polylineDist(x, z, river, false);
    const west = 0.25 + 0.75 * smooth(1800, 4200, -x);
    const mountain = smooth(150, 1600, dc) * (1 - flat) * smooth(RIVER_HW, RIVER_HW + 700, dr);
    const n = fbm(x * 0.0009 + 13.1, z * 0.0009 - 7.7);
    h += mountain * (25 + Math.pow(n, 1.6) * 520 * west);
    h += flat * (fbm(x * 0.004, z * 0.004) * 4);

    for (const hl of hills) {
      const d = Math.hypot(x - hl.x, z - hl.z);
      if (d < hl.r) h += hl.h * (0.5 + 0.5 * Math.cos(Math.PI * d / hl.r));
    }
    if (dr < RIVER_HW * 1.8) h = -3 + (h + 3) * smooth(RIVER_HW * 0.7, RIVER_HW * 1.8, dr);
    return h;
  }

  function isRiver(x, z) { return polylineDist(x, z, river, false) < RIVER_HW * 1.2; }

  return { S, ll, coast, river, RIVER_HW, cities, posco, airport, hills, POI, bounds,
    height, cityFactor, isRiver, fbm, hash, pointInPoly, polylineDist, smooth };
})();
