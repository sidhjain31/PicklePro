"""Match-draw music = kaazoom "Dhol And Neon (1 min edit)" with ONLY the high female vocal removed.

Owner (2026-11-17): "the dhol and neon from 0:11 - 0:24 you have to cut that part only, rest keep".
Measured in the app's timeline (app t = raw t - 0.640 s; the app file starts where the raw intro
starts): the high vocal enters at ~9.5 s (850-2600 Hz band jumps +7 dB) and the big dhol section
starts on a downbeat at 25.032 s (beat 0.6255 s, 96 BPM; downbeat grid anchored on the drop at
45.033 s). So the output = app 0 .. 9.406 s (last beat before the voice) + app 25.032 s .. end, joined
with a 0.1 s equal-power crossfade that ends before the voice. Length ~43.8 s; the app loops the
whole file (no loop window). Loudness = the old app file's.

python -I music_cut.py <music_raw.wav> <old_music_app.wav> <out.wav>   (WAVs from towav.mjs;
then: node encode.mjs out.wav music.mp3 112 stereo)
"""
import sys
import wave

import numpy as np

raw_p, app_p, out_p = sys.argv[1:4]
OFFSET = 0.640           # raw = app + OFFSET (cross-correlated)
LEAVE, LAND = 9.406, 25.032  # app seconds: last beat before the vocal / downbeat of the dhol section
X = 0.10                 # crossfade seconds, centred on the join
END = 59.40              # app length


def load(p):
    w = wave.open(p)
    sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, w.getnchannels()).astype(np.float64) / 32768
    return a, sr


raw, sr = load(raw_p)
app, _ = load(app_p)
r = lambda t: int(round((t + OFFSET) * sr))  # app time -> raw sample
h = int(round(X / 2 * sr))
A = raw[r(0): r(LEAVE) + h]
B = raw[r(LAND) - h: r(END)]
th = np.linspace(0, np.pi / 2, 2 * h)[:, None]
join = A[-2 * h:] * np.cos(th) + B[: 2 * h] * np.sin(th)
out = np.concatenate([A[:-2 * h], join, B[2 * h:]])
out[: int(0.02 * sr)] *= np.linspace(0, 1, int(0.02 * sr))[:, None]
out[-int(0.3 * sr):] *= np.linspace(1, 0, int(0.3 * sr))[:, None]
rms = lambda a: np.sqrt((a ** 2).mean())
out *= rms(app) / rms(raw[r(0): r(END)])  # the old app level
peak = np.abs(out).max()
if peak > 0.98:
    out *= 0.98 / peak
w = wave.open(out_p, 'wb')
w.setnchannels(out.shape[1])
w.setsampwidth(2)
w.setframerate(sr)
w.writeframes((np.clip(out, -1, 1) * 32767).round().astype('<i2').tobytes())
w.close()
print(f'{out_p}: {len(out) / sr:.2f} s (cut app {LEAVE}-{LAND} s)')
