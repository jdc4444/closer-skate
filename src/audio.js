// audio.js — a tiny procedural disco: four-on-the-floor, sidechained pads,
// a warm bassline, plus skate-roll noise tied to your speed.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const BARS = [
  { root: 36, chord: [60, 64, 67, 71] },  // Cmaj7
  { root: 33, chord: [57, 60, 64, 67] },  // Am7
  { root: 41, chord: [57, 60, 65, 69] },  // Fmaj7
  { root: 43, chord: [59, 62, 67, 71] },  // G6
];
const BASS_PATTERN = [0, null, 12, 0, 7, null, 12, 7]; // semitone offsets per 8th

export class DiscoAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.bpm = 117;
  }

  start() {
    if (this.started) { this.ctx.resume(); return; }
    this.started = true;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(this.master);

    // pad bus with slow-breathing lowpass + sidechain gain
    this.padDuck = ctx.createGain();
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padLfo = ctx.createOscillator();
    this.padLfoGain = ctx.createGain();
    this.padLfo.frequency.value = 0.09;
    this.padLfoGain.gain.value = 320;
    this.padLfo.connect(this.padLfoGain).connect(this.padFilter.frequency);
    this.padLfo.start();
    this.padDuck.connect(this.padFilter).connect(this.musicBus);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {            // pinkish noise
      const white = Math.random() * 2 - 1;
      last = 0.97 * last + 0.03 * white;
      d[i] = last * 3.2;
    }

    // skate roll: looping noise, bandpassed, gain driven by speed
    this.roll = ctx.createBufferSource();
    this.roll.buffer = this.noiseBuf;
    this.roll.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'bandpass';
    this.rollFilter.frequency.value = 380;
    this.rollFilter.Q.value = 0.7;
    this.rollGain = ctx.createGain();
    this.rollGain.gain.value = 0;
    this.roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    this.roll.start();

    // wind layer for high speed
    this.wind = ctx.createBufferSource();
    this.wind.buffer = this.noiseBuf;
    this.wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'highpass';
    wf.frequency.value = 2600;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(wf).connect(this.windGain).connect(this.master);
    this.wind.start();

    // scheduler
    this.eighth = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 40);
  }

  schedule() {
    const spb = 60 / this.bpm;
    while (this.nextTime < this.ctx.currentTime + 0.16) {
      this.scheduleEighth(this.eighth, this.nextTime);
      this.eighth = (this.eighth + 1) % 64;   // 8 bars of 8ths -> 4-bar loop x2
      this.nextTime += spb / 2;
    }
  }

  scheduleEighth(e, t) {
    if (this.muted) return;
    const ctx = this.ctx;
    const beat = Math.floor(e / 2) % 4;       // beat in bar
    const bar = Math.floor(e / 8) % 4;
    const off = e % 2 === 1;

    if (!off) this.kick(t);
    if (!off && (beat === 1 || beat === 3)) this.clap(t);
    if (off) this.hat(t);

    const b = BARS[bar];
    const semis = BASS_PATTERN[e % 8];
    if (semis !== null) this.bassNote(midi(b.root + semis), t);

    if (e % 8 === 0) this.padChord(b.chord, t);

    // sidechain pump on every beat
    if (!off) {
      this.padDuck.gain.cancelScheduledValues(t);
      this.padDuck.gain.setTargetAtTime(0.42, t, 0.012);
      this.padDuck.gain.setTargetAtTime(1.0, t + 0.09, 0.11);
    }
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(155, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.2);
  }

  clap(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 1.4;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1600; f.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random()); s.stop(t + 0.15);
  }

  hat(t) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 2.4;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random()); s.stop(t + 0.06);
  }

  bassNote(freq, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 620; f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.20, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.21);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.24);
  }

  padChord(notes, t) {
    const ctx = this.ctx;
    const spb = 60 / this.bpm;
    const dur = spb * 4;
    for (const n of notes) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + dur * 0.25);
        g.gain.setValueAtTime(0.045, t + dur * 0.8);
        g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.02);
        o.connect(g).connect(this.padDuck);
        o.start(t); o.stop(t + dur * 1.05);
      }
    }
  }

  // ------------------------------------------------ SFX
  blip(freqs, type = 'triangle', gap = 0.06, vol = 0.16, dur = 0.3) {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = ctx.createGain();
      const t = t0 + i * gap;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  boost()   { this.blip([midi(76), midi(79), midi(83), midi(88)], 'triangle', 0.05, 0.15); }
  link()    { this.blip([midi(64), midi(67), midi(71)], 'sine', 0.09, 0.18, 0.5); }
  unlink()  { this.blip([midi(67), midi(64)], 'sine', 0.1, 0.07, 0.3); }
  join()    { this.blip([midi(72), midi(76), midi(79), midi(84), midi(88)], 'triangle', 0.07, 0.14, 0.6); }
  stumble() {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    s.connect(f).connect(g).connect(this.master);
    s.start(t); s.stop(t + 0.45);
  }

  setSpeed(v, airborne) {
    if (!this.started) return;
    const target = this.muted || airborne ? 0 : Math.min(1, v / 34) * 0.13;
    this.rollGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.roll.playbackRate.setTargetAtTime(0.7 + v / 55, this.ctx.currentTime, 0.1);
    const wind = this.muted ? 0 : Math.max(0, (v - 26) / 16) * 0.09;
    this.windGain.gain.setTargetAtTime(wind, this.ctx.currentTime, 0.15);
  }

  setMuted(m) {
    this.muted = m;
    if (this.started) {
      this.musicBus.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
      if (m) {
        this.rollGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
    }
  }
}
