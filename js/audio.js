// 간단한 효과음 (Web Audio)
const Sound = (() => {
  let ctx = null, motor, motorGain, filter, hissGain, master;
  let muted = false;

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    motor = ctx.createOscillator(); motor.type = 'sawtooth';
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900;
    motorGain = ctx.createGain(); motorGain.gain.value = 0.0;
    motor.connect(filter).connect(motorGain).connect(master);
    motor.start();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500; bp.Q.value = 0.6;
    hissGain = ctx.createGain(); hissGain.gain.value = 0;
    noise.connect(bp).connect(hissGain).connect(master);
    noise.start();
    Sound.noiseBuf = buf;
  }

  function update(speed, boost, active) {
    if (!ctx) return;
    const t = ctx.currentTime;
    motor.frequency.setTargetAtTime(70 + speed * 2.2, t, 0.1);
    motorGain.gain.setTargetAtTime(active && !muted ? 0.035 : 0, t, 0.1);
    hissGain.gain.setTargetAtTime(active && !muted ? boost * 0.12 : 0, t, 0.05);
  }

  function tone(freq, start, dur, vol = 0.15) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    o.connect(g).connect(master);
    o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur);
  }

  function ding(v = 1) { if (!ctx || muted) return; tone(880, 0, 0.25, 0.12 * v + 0.05); tone(1320, 0.08, 0.3, 0.1 * v + 0.04); }
  function win() { if (!ctx || muted) return; [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.4, 0.14)); }
  function crash() {
    if (!ctx || muted) return;
    const s = ctx.createBufferSource(); s.buffer = Sound.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    s.connect(lp).connect(g).connect(master);
    s.start(); s.stop(ctx.currentTime + 1.3);
  }
  function toggleMute() { muted = !muted; return muted; }
  return { init, update, ding, win, crash, toggleMute };
})();
