// Recorded sounds for the match-draw show (royalty-free: Mixkit Sound Effects Free License and
// Pixabay Content License; files in /public/sounds, trimmed and levelled). Everything plays
// through the main sound engine's master gain, so the sound button mutes it instantly. A sound
// whose file is missing or can't be decoded falls back to the old synthesized one.
//
// Layers: a music track (dhol + electronic, ducks under big moments), one-shot effects for each
// moment, and the crowd. The crowd is kept short and soft on purpose (a constant stadium roar
// annoyed people): it only murmurs while the spotlight hunts, and each cheer is a short, faded
// burst. Every viewer can switch Music and Crowd off separately (remembered on their device).
import * as synth from '../sound.js';

const FILES = ['crowd', 'open', 'title', 'drumroll', 'slowmo', 'fireball', 'thunder', 'laser', 'rocket', 'meteor', 'curve',
  'shatter', 'cheer', 'clash', 'whistle', 'fanfare', 'fireworks', 'pop', 'dhol-hit', 'music', 'dhols'];
const buffers = new Map(); // name -> AudioBuffer | null (null = missing)
let loading = null;

// Per-device on/off switches (default on).
function pref(key) {
  let on = (() => {
    try {
      return localStorage.getItem(key) !== 'off';
    } catch {
      return true;
    }
  })();
  const fns = new Set();
  return {
    get: () => on,
    set(v) {
      on = v;
      try {
        localStorage.setItem(key, v ? 'on' : 'off');
      } catch { /* storage unavailable */ }
      fns.forEach(fn => fn(v));
    },
    listen(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}
const musicPref = pref('team-draw:music');
const crowdPref = pref('team-draw:crowd');
export const musicOn = musicPref.get;
export const onMusicChange = musicPref.listen;
export const crowdOn = crowdPref.get;
export const onCrowdChange = crowdPref.listen;

// Fetch + decode every file once (only when sound is wanted: silent phones download nothing).
export function preload() {
  if (loading) return loading;
  const ctx = synth.audioContext();
  if (!ctx) return Promise.resolve();
  loading = Promise.all(FILES.map(async name => {
    try {
      const res = await fetch(`/sounds/${name}.mp3`);
      // A missing file may come back as the app's HTML page: only accept real audio.
      if (!res.ok || !/audio|mpeg|octet/.test(res.headers.get('content-type') ?? '')) throw new Error(String(res.status));
      const data = await res.arrayBuffer();
      buffers.set(name, await new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)));
    } catch {
      buffers.set(name, null);
    }
  }));
  return loading;
}
const has = name => Boolean(buffers.get(name));

// One-shot: returns stop(fadeMs).
function play(name, { gain = 1, rate = 1, delay = 0, offset = 0, loop = false, attack = 0 } = {}) {
  const p = synth.playable();
  const buf = buffers.get(name);
  if (!p || !buf) return null;
  const { ctx, master } = p;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  const t = ctx.currentTime + delay / 1000;
  g.gain.setValueAtTime(attack ? 0.0001 : gain, t);
  if (attack) g.gain.linearRampToValueAtTime(gain, t + attack / 1000);
  src.connect(g).connect(master);
  src.start(t, offset);
  let stopped = false;
  const stop = (fadeMs = 250) => {
    if (stopped) return;
    stopped = true;
    try {
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(0.0001, n + fadeMs / 1000);
      src.stop(n + fadeMs / 1000 + 0.05);
    } catch { /* already stopped */ }
  };
  const untrack = synth.trackSound(() => stop(60));
  src.onended = () => { stopped = true; untrack(); };
  return Object.assign(stop, { gain: g, ctx });
}

// ---------- Music bed + crowd murmur ----------
let crowd = null; // only while the spotlight hunts
let music = null;
let bedsWanted = false;
const level = { crowd: 0.1, music: 0.4 };
const ramp = (node, to, ms) => {
  if (!node) return;
  const n = node.ctx.currentTime;
  node.gain.gain.cancelScheduledValues(n);
  node.gain.gain.setValueAtTime(node.gain.gain.value, n);
  node.gain.gain.linearRampToValueAtTime(Math.max(0.0001, to), n + ms / 1000);
};
function startBeds() {
  if (!bedsWanted || !synth.soundOn()) return;
  if (!music && musicPref.get() && has('music')) music = play('music', { gain: level.music, loop: true, attack: 1200 });
}
function crowdUp(ms) {
  if (!crowd && crowdPref.get() && bedsWanted && has('crowd')) crowd = play('crowd', { gain: level.crowd, loop: true, attack: ms });
}
function crowdDown(ms) {
  crowd?.(ms);
  crowd = null;
}
function stopBeds(fade = 600) {
  crowd?.(fade);
  music?.(fade);
  crowd = null;
  music = null;
}
// The arena is on screen: run the beds while sound is on.
export function beds(on) {
  bedsWanted = on;
  if (on) preload().then(startBeds);
  else stopBeds();
}
synth.onSoundChange(status => {
  if (status === 'on') preload().then(startBeds);
  else stopBeds(100);
});
export function setMusic(on) {
  musicPref.set(on);
  if (on) startBeds();
  else {
    music?.(400);
    music = null;
  }
}
export function setCrowd(on) {
  crowdPref.set(on);
  if (!on) {
    crowdDown(300);
    cheers.forEach(stop => stop(300));
  }
}
// A short crowd cheer that fades out by itself (a long roar after every reveal got tiring).
const cheers = new Set();
function cheer(gain, { delay = 0, offset = 0.3, len = 1400 } = {}) {
  if (!crowdPref.get()) return true; // switched off: stay silent, no synth fallback either
  const stop = play('cheer', { gain, delay, offset, attack: 120 });
  if (!stop) return false;
  cheers.add(stop);
  setTimeout(() => {
    stop(700);
    cheers.delete(stop);
  }, delay + len);
  return true;
}
// Music and crowd dip under a big moment, then come back.
function duck(musicTo, crowdTo, holdMs, backMs = 900) {
  ramp(music, level.music * musicTo, 150);
  ramp(crowd, level.crowd * crowdTo, 150);
  setTimeout(() => {
    ramp(music, level.music, backMs);
    ramp(crowd, level.crowd, backMs);
  }, holdMs);
}

// ---------- Moments of the show ----------
export function arenaOpen() {
  if (!play('open', { gain: 0.9 })) synth.arenaOpen();
  cheer(0.4, { delay: 900, len: 1800 });
}
export function title() {
  duck(0.5, 0.8, 1600);
  if (!play('title', { gain: 0.85 })) { synth.riser(1100); setTimeout(() => synth.slam(0.9), 380); }
}
// Spotlight hunting: drum roll + a soft crowd murmur rising. Returns stop().
export function hunt() {
  crowdUp(2500);
  ramp(music, level.music * 0.55, 400);
  const roll = play('drumroll', { gain: 0.75, attack: 300 });
  const beat = roll ? null : synth.heartbeat();
  return {
    setRate: r => beat?.setRate(r),
    stop: () => {
      roll?.(200);
      beat?.stop();
      ramp(music, level.music, 900);
      crowdDown(1600);
    },
  };
}
export const lock = () => synth.lockOn();
export function toss() {
  duck(0.08, 0.3, 900, 300);
  if (!play('slowmo', { gain: 0.8 })) synth.riser(420);
}
export function smash() {
  // The pop file starts with ~40 ms of encoder padding: skip it so the hit lands on the swing.
  if (!play('pop', { gain: 1, offset: 0.035 })) synth.smashHit();
  synth.boom(0.25);
}
const SHOT = { fireball: 'fireball', thunder: 'thunder', laser: 'laser', rocket: 'rocket', meteor: 'meteor', curve: 'curve' };
export function shot(kind) {
  const name = SHOT[kind] ?? 'fireball';
  // Thunder's sample is the impact; in flight it's a quick laser crackle.
  if (name === 'thunder') return play('laser', { gain: 0.5, rate: 1.4 }) || synth.crackle();
  if (!play(name, { gain: 0.85 })) {
    if (name === 'rocket') synth.launch(900);
    else if (name === 'meteor') synth.fall(950);
    else if (name === 'laser') synth.zap(400);
    else synth.whoosh(800);
  }
  return null;
}
// The crest shatters: crash + a short cheer + a dhol hit when we have it.
export function impact(kind) {
  if (kind === 'thunder' && !play('thunder', { gain: 0.95 })) synth.thunder();
  if (!play('shatter', { gain: 0.9 })) synth.boom(0.9);
  cheer(0.38, { delay: 120, len: 1300 }) || synth.cheer();
  // The dhol stinger is a full groove: a 2.5 s burst of it per reveal, faded out before the next hunt.
  const dhol = play('dhol-hit', { gain: 0.75, delay: 220 });
  if (dhol) setTimeout(() => dhol(700), 2400);
}
export function fate() {
  return synth.zap(220);
}
let lastClash = 0;
export function clash() {
  lastClash = performance.now();
  if (!play('clash', { gain: 0.95 })) synth.slam(1);
}
// The VERSUS slam. Right after the two logos collided (clash) it stays quiet (the clash was the
// big hit); on its own (knockout line-up) it gets the full impact.
export function versus() {
  if (performance.now() - lastClash > 1500 && !play('clash', { gain: 0.85, rate: 0.9 })) synth.versus();
}
export function allSet() {
  if (!play('whistle', { gain: 0.8 })) return synth.whistleAndTrophy();
  play('fanfare', { gain: 0.8, delay: 700 });
  cheer(0.45, { delay: 1200, len: 2200 });
  return undefined;
}
export function champion() {
  duck(0.3, 1, 6000, 2000);
  if (!play('fanfare', { gain: 0.9 })) synth.whistleAndTrophy();
  play('fireworks', { gain: 0.8, delay: 900 });
  cheer(0.55, { delay: 300, len: 3500 });
  play('dhols', { gain: 0.85, delay: 1600 });
}
export function result() {
  if (!cheer(0.32, { offset: 0.5, len: 1200 })) synth.cheer();
}
