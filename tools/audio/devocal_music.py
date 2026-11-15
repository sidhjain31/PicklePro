"""Vocal-free music bed + reveal dhol hit from kaazoom "Dhol And Neon (1 min edit)".

The track's first ~44 s carry a female vocal (aalaap-style line ~350 Hz, then ~950-1100 Hz, back at
34-44 s); the same voice opens the 15-s stinger that used to be the reveal "dhol-hit". The owner
didn't want the girl's voice (2026-11-16). From ~45 s to ~57 s the track is a clean dhol/electronic
beat (~96 BPM) - both new files are cut from there:

  music.wav    exactly 16 beats, crossfaded seam, written TWICE in a row (the app loops the window
               [LOOP_START, LOOP_START + loop length] inside real audio, avoiding MP3 padding gaps)
  dholhit.wav  one bar (4 beats) + 0.3 s fade, for the 2.5 s burst on every team reveal

python -I devocal_music.py <music_raw.wav> <old_music_app.wav> <old_dholhit_app.wav> <outDir>
(WAVs from towav.mjs; encode with encode.mjs). Prints the loop length for sfx.js (LOOPS.music).
"""
import json
import sys
import wave

import numpy as np

raw_p, old_music_p, old_hit_p, out = sys.argv[1:5]
CLEAN_FROM, CLEAN_TO = 45.0, 57.0  # seconds in the app version (vocal-free beat section)
XFADE = 0.04  # seam crossfade (s)


def load(p):
    w = wave.open(p)
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels()).astype(np.float64) / 32768
    if a.shape[1] == 1:
        a = np.repeat(a, 2, axis=1)
    return a, sr


def save(p, a, sr):
    a = np.clip(a, -1, 1)
    w = wave.open(p, 'wb')
    w.setnchannels(a.shape[1])
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes((a * 32767).round().astype('<i2').tobytes())
    w.close()


def env(a, sr, hop):
    m = a.mean(1)
    n = len(m) // hop
    return np.sqrt((m[: n * hop].reshape(n, hop) ** 2).mean(1))


raw, sr = load(raw_p)
old, sr2 = load(old_music_p)
assert sr == sr2 == 44100, (sr, sr2)

# 1) Where is app time 0 in the raw file? Cross-correlate 10 ms loudness envelopes.
hop = 441
er, eo = env(raw, sr, hop), env(old, sr, hop)
er, eo = er - er.mean(), eo - eo.mean()
cc = np.correlate(er, eo, 'full')
lag = (np.argmax(cc) - (len(eo) - 1)) * hop / sr  # raw_t = app_t + lag
print(f'raw = app + {lag:.3f} s')

# 2) Onset envelope (fine) of the clean section, beat length and exact 16-beat loop length.
fh = 64
fps = sr / fh
seg = raw[int((CLEAN_FROM + lag) * sr): int((CLEAN_TO + lag) * sr)]
e = env(seg, sr, fh)
on = np.maximum(0, np.diff(e))
on -= on.mean()
ac = np.correlate(on, on, 'full')[len(on) - 1:]
lags = np.arange(len(ac)) / fps
r = (lags > 0.45) & (lags < 0.8)
beat = lags[r][np.argmax(ac[r])]
r16 = (lags > beat * 15.6) & (lags < beat * 16.4)
L = lags[r16][np.argmax(ac[r16])]
print(f'beat {beat:.4f} s ({60 / beat:.1f} BPM), 16 beats = {L:.4f} s')

# 3) Start on the first strong hit of the section (the drop's downbeat).
thr = 0.5 * e.max()
first = next(i for i in range(1, len(e) - 1) if e[i] > thr and e[i] >= e[i - 1] and e[i] >= e[i + 1])
start = CLEAN_FROM + lag + first / fps - 0.012  # just before the attack
end_needed = start + L + XFADE
assert end_needed <= CLEAN_TO + lag, (start, end_needed)
s0, n = int(start * sr), int(round(L * sr))
x = int(XFADE * sr)
loop = raw[s0: s0 + n].copy()
tail = raw[s0 + n: s0 + n + x]  # what follows the loop end = what must flow into the loop start
fade = np.linspace(0, 1, x)[:, None]
loop[:x] = loop[:x] * fade + tail * (1 - fade)
music = np.concatenate([loop, loop])  # two copies: the app loops one period inside real audio

# 4) Reveal hit: one bar from the downbeat, 0.3 s fade-out, 5 ms fade-in.
bar = int(round(4 * beat * sr))
hit = raw[s0: s0 + bar + int(0.3 * sr)].copy()
hit[: int(0.005 * sr)] *= np.linspace(0, 1, int(0.005 * sr))[:, None]
hit[bar:] *= np.linspace(1, 0, len(hit) - bar)[:, None]

# 5) Same loudness as the files they replace (the owner was happy with the levels).
rms = lambda a: np.sqrt((a ** 2).mean())
old_hit, _ = load(old_hit_p)
music *= rms(old) / rms(music)
hit *= rms(old_hit[: int(2.5 * sr)]) / rms(hit[: int(2.5 * sr)])
peak = max(np.abs(music).max(), 1e-9)
if peak > 0.98:
    music *= 0.98 / peak
peak = max(np.abs(hit).max(), 1e-9)
if peak > 0.98:
    hit *= 0.98 / peak

save(f'{out}/music.wav', music, sr)
save(f'{out}/dholhit.wav', hit, sr)
info = {'loopSamples': n, 'loopSeconds': n / sr, 'startInRaw': round(start, 3), 'beat': round(beat, 4)}  # exact: sfx.js LOOPS.music
json.dump(info, open(f'{out}/music_loop.json', 'w'))
print(json.dumps(info))
