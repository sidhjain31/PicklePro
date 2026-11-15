// Smash Arena — the 3D match-draw show (three.js). A night stadium: floodlights, crowd with camera
// flashes, a big screen with the ICC logo, a pickleball court and net. Every team not yet drawn
// is a glowing crest (its colour + logo) on the far side of the net. For each pick: a spotlight
// hunts across the crests, locks on, the ball is tossed, slow-motion smash, the camera chases the
// shot, the crest shatters and the team's logo rises. The server has already decided; this only
// stages it. Loaded lazily (big library) and only on match-draw pages.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as sfx from './sfx.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const E = {
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t * t,
  outBack: t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  lin: t => t,
};
const NIGHT = '#050d26';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Rounded square with UVs across the whole square, for logos (most are square artwork with the
// team name running edge to edge: a circle would cut it off).
function plateGeo(size, radius) {
  const h = size / 2;
  const r = Math.min(radius, h);
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  const g = new THREE.ShapeGeometry(s, 8);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + h) / size, (pos.getY(i) + h) / size);
  return g;
}
// Logos are drawn just under the bloom threshold so they stay crisp instead of glowing.
const LOGO_LEVEL = 0.88;
const FRAME_LEVEL = 0.84;

export async function createStage(container, { low = false, onLost } = {}) {
  try {
    await document.fonts?.load('900 80px "Big Shoulders Variable"');
  } catch { /* ignore */ }

  // ---------- Renderer, scene, camera ----------
  // Every screen renders at its FULL native resolution (owner: "max resolution on every screen"):
  // a 4K TV gets 3840×2160, an iPhone its full Retina pixels (capped at 3×), with edge smoothing.
  // Phones skip only the glow effect. If a device really can't keep up, quality steps down below.
  const DPR = Math.min(window.devicePixelRatio || 1, 3);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'stage3d-canvas';
  container.prepend(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); onLost?.(); });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  scene.fog = new THREE.FogExp2(NIGHT, 0.016);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  scene.add(camera);

  let composer = null;
  let bloom = null;
  if (!low) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const disposables = [];
  const keep = x => { disposables.push(x); return x; };

  // ---------- Shared textures ----------
  const soft = keep(canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }, false));
  const vertical = keep(canvasTex(4, 128, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 128);
    r.addColorStop(0, 'rgba(255,255,255,0)');
    r.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = r;
    g.fillRect(0, 0, 4, 128);
  }, false));

  const fadeDown = keep(canvasTex(4, 128, (g) => {
    const r = g.createLinearGradient(0, 0, 0, 128);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 4, 128);
  }, false));

  // ---------- Lights ----------
  scene.add(new THREE.HemisphereLight('#8fb2ff', '#0a1433', 1.1));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(6, 14, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#6cc04a', 0.9);
  rim.position.set(-8, 6, -16);
  scene.add(rim);
  const spot = new THREE.SpotLight('#fff1c8', 0, 0, 0.2, 0.55, 0);
  spot.position.set(0, 15, 6);
  scene.add(spot, spot.target);

  // ---------- Court ----------
  const CW = 12;
  const CL = 26.4;
  const courtTex = keep(canvasTex(1024, 2252, (g, w, h) => {
    g.fillStyle = '#1f5fc6';
    g.fillRect(0, 0, w, h);
    const kitchen = h * (7 / 44);
    g.fillStyle = '#2a6fe0';
    g.fillRect(0, h / 2 - kitchen, w, kitchen * 2);
    g.strokeStyle = '#f4f7f2';
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    g.beginPath();
    g.moveTo(0, h / 2 - kitchen); g.lineTo(w, h / 2 - kitchen);
    g.moveTo(0, h / 2 + kitchen); g.lineTo(w, h / 2 + kitchen);
    g.moveTo(w / 2, 0); g.lineTo(w / 2, h / 2 - kitchen);
    g.moveTo(w / 2, h / 2 + kitchen); g.lineTo(w / 2, h);
    g.stroke();
    g.globalAlpha = 0.07;
    for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() > 0.5 ? '#fff' : '#000'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }));
  const court = new THREE.Mesh(keep(new THREE.PlaneGeometry(CW, CL)), keep(new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.5, metalness: 0.08 })));
  court.rotation.x = -Math.PI / 2;
  scene.add(court);
  const surroundTex = keep(canvasTex(512, 512, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w / 2);
    r.addColorStop(0, '#2b7a35');
    r.addColorStop(0.55, '#174d22');
    r.addColorStop(1, '#06180c');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }));
  const surround = new THREE.Mesh(keep(new THREE.PlaneGeometry(90, 110)), keep(new THREE.MeshStandardMaterial({ map: surroundTex, roughness: 0.85 })));
  surround.rotation.x = -Math.PI / 2;
  surround.position.y = -0.02;
  scene.add(surround);

  // Net + posts.
  const netTex = keep(canvasTex(512, 64, (g, w, h) => {
    g.strokeStyle = 'rgba(230,236,255,0.55)';
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }));
  netTex.wrapS = THREE.RepeatWrapping;
  netTex.repeat.set(6, 1);
  const net = new THREE.Mesh(keep(new THREE.PlaneGeometry(CW + 1, 0.86)), keep(new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })));
  net.position.set(0, 0.46, 0);
  scene.add(net);
  const tape = new THREE.Mesh(keep(new THREE.BoxGeometry(CW + 1, 0.06, 0.03)), keep(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.3 })));
  tape.position.set(0, 0.9, 0);
  scene.add(tape);
  const postGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 12));
  const postMat = keep(new THREE.MeshStandardMaterial({ color: '#cfd6e3', metalness: 0.8, roughness: 0.3 }));
  for (const x of [-(CW + 1) / 2, (CW + 1) / 2]) {
    const p = new THREE.Mesh(postGeo, postMat);
    p.position.set(x, 0.47, 0);
    scene.add(p);
  }

  // ---------- Stadium: stands with crowd, flashes, floodlights, big screen ----------
  const crowdTex = keep(canvasTex(2048, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a1230');
    grad.addColorStop(1, '#152454');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const colors = ['#f4e04d', '#6cc04a', '#ffffff', '#1f5fc6', '#e63946', '#ff9f1c', '#9b5de5', '#4cc9f0'];
    for (let row = 0; row < 22; row++) {
      const y = h - 12 - row * 22;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, y + 6, w, 6);
      for (let x = 4; x < w; x += 9 + Math.random() * 3) {
        if (Math.random() < 0.12) continue;
        g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        g.globalAlpha = 0.35 + Math.random() * 0.45;
        g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
        g.fillRect(x - 3, y + 2, 6, 6);
      }
      g.globalAlpha = 1;
    }
  }));
  crowdTex.wrapS = THREE.RepeatWrapping;
  crowdTex.repeat.set(4, 1);
  const stands = new THREE.Mesh(keep(new THREE.CylinderGeometry(46, 30, 15, 72, 1, true)), keep(new THREE.MeshBasicMaterial({ map: crowdTex, side: THREE.BackSide, color: '#9fb1d8' })));
  stands.position.y = 7.2;
  scene.add(stands);
  // Camera flashes in the crowd.
  const FLASHES = low ? 140 : 260;
  const flashPos = new Float32Array(FLASHES * 3);
  const flashCol = new Float32Array(FLASHES * 3);
  for (let i = 0; i < FLASHES; i++) {
    const a = Math.random() * Math.PI * 2;
    const hgt = rnd(1, 13);
    const r = 30 + (hgt / 15) * 15.5;
    flashPos.set([Math.cos(a) * r, hgt + 0.5, Math.sin(a) * r], i * 3);
  }
  const flashGeo = keep(new THREE.BufferGeometry());
  flashGeo.setAttribute('position', new THREE.BufferAttribute(flashPos, 3));
  flashGeo.setAttribute('color', new THREE.BufferAttribute(flashCol, 3));
  const flashes = new THREE.Points(flashGeo, keep(new THREE.PointsMaterial({ size: 1.1, map: soft, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(flashes);
  let flashRate = 3; // per second

  // Floodlight towers with light beams.
  const poleGeo = keep(new THREE.CylinderGeometry(0.22, 0.35, 19, 8));
  const poleMat = keep(new THREE.MeshStandardMaterial({ color: '#2a3550', metalness: 0.6, roughness: 0.5 }));
  const headGeo = keep(new THREE.BoxGeometry(3.4, 1.7, 0.3));
  const headMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const beamGeo = keep(new THREE.ConeGeometry(4.2, 30, 24, 1, true));
  beamGeo.translate(0, -15, 0);
  const beamMat = keep(new THREE.MeshBasicMaterial({ color: '#cfe0ff', alphaMap: fadeDown, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const beams = [];
  for (const [x, z] of [[-17, -20], [17, -20], [-17, 20], [17, 20]]) {
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 9.5, z);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(x, 19.5, z);
    head.lookAt(0, 0, 0);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.copy(head.position);
    beam.quaternion.setFromUnitVectors(V(0, -1, 0), V(-x, -19.5, -z).normalize());
    beams.push(beam);
    scene.add(pole, head, beam);
  }

  // Big screen behind the far baseline: ICC logo + live caption.
  const jumboCanvas = document.createElement('canvas');
  jumboCanvas.width = 1024;
  jumboCanvas.height = 560;
  const jumboTex = keep(new THREE.CanvasTexture(jumboCanvas));
  jumboTex.colorSpace = THREE.SRGBColorSpace;
  const logoImg = new Image();
  logoImg.src = '/logo.png';
  let jumboText = ['MATCH DRAW', 'LIVE'];
  function drawJumbo() {
    const g = jumboCanvas.getContext('2d');
    const { width: w, height: h } = jumboCanvas;
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0b1f52');
    grad.addColorStop(1, '#123786');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6cc04a';
    g.lineWidth = 14;
    g.strokeRect(7, 7, w - 14, h - 14);
    if (logoImg.complete && logoImg.naturalWidth) g.drawImage(logoImg, 40, 70, 300, 300);
    g.fillStyle = '#f4e04d';
    g.font = '900 70px "Big Shoulders Variable", Impact, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(jumboText[0], 380, 170);
    g.fillStyle = '#ffffff';
    g.font = '900 120px "Big Shoulders Variable", Impact, sans-serif';
    let size = 120;
    while (g.measureText(jumboText[1]).width > w - 420 && size > 50) { size -= 6; g.font = `900 ${size}px "Big Shoulders Variable", Impact, sans-serif`; }
    g.fillText(jumboText[1], 380, 300);
    g.fillStyle = '#6cc04a';
    g.font = '800 34px "Archivo Variable", Arial, sans-serif';
    g.fillText('ICC PICKLEBALL · POWERED BY SP TECH', 40, 480);
    jumboTex.needsUpdate = true;
  }
  logoImg.onload = drawJumbo;
  drawJumbo();
  const jumbo = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 7.1)), keep(new THREE.MeshBasicMaterial({ map: jumboTex, toneMapped: false })));
  jumbo.position.set(0, 9, -30);
  const frame = new THREE.Mesh(keep(new THREE.BoxGeometry(13.6, 7.7, 0.4)), poleMat);
  frame.position.set(0, 9, -30.25);
  scene.add(jumbo, frame);

  // ---------- Particles ----------
  function particles(capacity, size, blending = THREE.AdditiveBlending) {
    const pos = new Float32Array(capacity * 3).fill(-999);
    const col = new Float32Array(capacity * 3);
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = keep(new THREE.PointsMaterial({ size, map: soft, vertexColors: true, transparent: true, depthWrite: false, blending }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    const vel = new Float32Array(capacity * 3);
    const life = new Float32Array(capacity);
    const max = new Float32Array(capacity);
    const base = new Float32Array(capacity * 3);
    const grav = new Float32Array(capacity);
    let next = 0;
    return {
      emit(p, v, color, ttl, g = -4) {
        const i = next;
        next = (next + 1) % capacity;
        pos.set([p.x, p.y, p.z], i * 3);
        vel.set([v.x, v.y, v.z], i * 3);
        base.set([color.r, color.g, color.b], i * 3);
        life[i] = max[i] = ttl;
        grav[i] = g;
      },
      update(dt) {
        for (let i = 0; i < capacity; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          const k = Math.max(0, life[i] / max[i]);
          vel[i * 3 + 1] += grav[i] * dt;
          const drag = 1 - dt * 1.4;
          for (let a = 0; a < 3; a++) {
            vel[i * 3 + a] *= drag;
            pos[i * 3 + a] += vel[i * 3 + a] * dt;
            col[i * 3 + a] = base[i * 3 + a] * (blending === THREE.AdditiveBlending ? k : 0.2 + 0.8 * k);
          }
          if (life[i] <= 0) pos[i * 3 + 1] = -999;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
      },
    };
  }
  const sparks = particles(low ? 500 : 900, 0.16);
  const fire = particles(low ? 400 : 800, 0.62);
  const smoke = particles(low ? 160 : 320, 1.1, THREE.NormalBlending);
  const C = hex => new THREE.Color(hex);
  const FIRE = ['#fff2b0', '#ffc93c', '#ff8a2a', '#ff4d1f'].map(C);
  const burst = (p, n, colors, speed = 6, ttl = 0.9, g = -6, sys = sparks) => {
    for (let i = 0; i < n; i++) {
      const d = V(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.3, 1) * speed);
      sys.emit(p, d, colors[i % colors.length], rnd(ttl * 0.5, ttl), g);
    }
  };

  // ---------- Tweens & timing ----------
  const tweens = new Set();
  // Frames can stop (tab in the background, arena scrolled off screen, a throttled phone) but the
  // show's timing must not: every tween also ends by the clock, so the director never stalls and
  // each screen stays on the server's schedule.
  const endTween = tw => {
    if (!tweens.delete(tw)) return;
    clearTimeout(tw.timer);
    try {
      tw.fn(tw.ease(1), 1);
    } catch { /* objects already gone */ }
    tw.resolve();
  };
  const tween = (ms, fn, ease = E.inOut) => new Promise(resolve => {
    const tw = { t0: performance.now(), ms, fn, ease, resolve };
    tw.timer = setTimeout(() => endTween(tw), ms + 150);
    tweens.add(tw);
  });
  const wait = ms => tween(ms, () => {});
  let shakeAmt = 0;
  const shake = a => { shakeAmt = Math.max(shakeAmt, a); };
  const flashLight = new THREE.PointLight('#ffffff', 0, 30, 1.5);
  scene.add(flashLight);
  const flashAt = (p, color = '#ffffff', power = 60) => {
    flashLight.position.copy(p).add(V(0, 1.5, 1.5));
    flashLight.color.set(color);
    flashLight.intensity = power;
  };

  // Shockwave rings on the floor.
  const ringGeo = keep(new THREE.RingGeometry(0.8, 1, 64));
  const shock = (p, color, size = 9, ms = 800) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.05, p.z);
    scene.add(m);
    tween(ms, k => {
      m.scale.setScalar(0.3 + k * size);
      m.material.opacity = 1 - k;
    }, E.out).then(() => { scene.remove(m); m.material.dispose(); });
  };

  // Lightning: a few jagged shapes built once per bolt and flickered between (nothing is built
  // while it flickers, so no stutter). Two tubes each: hot core + glow.
  const bolt = (from, to, { ms = 500, color = '#9fd8ff', width = 0.035, variants = 3 } = {}) => {
    const group = new THREE.Group();
    scene.add(group);
    const core = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const glow = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const len = from.distanceTo(to);
    const frames = [];
    for (let v = 0; v < variants; v++) {
      const pts = [from.clone()];
      for (let i = 1; i < 12; i++) pts.push(from.clone().lerp(to, i / 12).add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(len * 0.045)));
      pts.push(to.clone());
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      const f = new THREE.Group();
      f.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, width, 4), core));
      f.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 36, width * 4, 5), glow));
      f.visible = v === 0;
      group.add(f);
      frames.push(f);
    }
    let last = 0;
    let cur = 0;
    return tween(ms, k => {
      const now = performance.now();
      if (frames.length > 1 && now - last > 60) {
        last = now;
        frames[cur].visible = false;
        cur = (cur + 1) % frames.length;
        frames[cur].visible = true;
      }
      glow.opacity = 0.45 * (1 - k) * (Math.random() < 0.2 ? 0.3 : 1);
    }, E.lin).then(() => {
      frames.forEach(f => f.children.forEach(c => c.geometry.dispose()));
      scene.remove(group);
      core.dispose();
      glow.dispose();
    });
  };

  // ---------- Crests ----------
  const shield = new THREE.Shape();
  {
    const w = 0.62;
    const h = 1.5;
    shield.moveTo(0, 0);
    shield.quadraticCurveTo(w * 0.98, h * 0.2, w, h * 0.62);
    shield.lineTo(w, h * 0.88);
    shield.quadraticCurveTo(w, h, w * 0.84, h);
    shield.lineTo(-w * 0.84, h);
    shield.quadraticCurveTo(-w, h, -w, h * 0.88);
    shield.lineTo(-w, h * 0.62);
    shield.quadraticCurveTo(-w * 0.98, h * 0.2, 0, 0);
  }
  const shieldGeo = keep(new THREE.ExtrudeGeometry(shield, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 12 }));
  shieldGeo.translate(0, 0, -0.06);
  const faceGeo = keep(new THREE.ShapeGeometry(shield, 12));
  const discGeo = keep(plateGeo(1.0, 0.13)); // the logo
  const frameGeo = keep(plateGeo(1.1, 0.18)); // light border around it
  const frameMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
  frameMat.color.setScalar(FRAME_LEVEL);
  const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() ?? 4);
  const padGeo = keep(new THREE.RingGeometry(0.5, 0.7, 48));
  const blobGeo = keep(new THREE.CircleGeometry(0.85, 32));
  const blobMat = keep(new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false, map: soft }));
  const shardGeo = keep(new THREE.TetrahedronGeometry(0.14));
  const shardMats = new Map();
  const shardMat = color => {
    const k = new THREE.Color(color).getHexString();
    if (!shardMats.has(k)) shardMats.set(k, keep(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 })));
    return shardMats.get(k);
  };
  const textures = new Map();
  const loader = new THREE.TextureLoader();
  const texFor = url => {
    if (!url) return null;
    if (!textures.has(url)) {
      const t = loader.load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = ANISO;
      textures.set(url, t);
    }
    return textures.get(url);
  };
  const labelTex = name => canvasTex(512, 112, (g, w, h) => {
    g.fillStyle = 'rgba(5,13,38,0.82)';
    g.beginPath(); g.roundRect(4, 8, w - 8, h - 16, 26); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.stroke();
    let size = 64;
    g.font = `900 ${size}px "Big Shoulders Variable", Impact, sans-serif`;
    const text = name.toUpperCase();
    while (g.measureText(text).width > w - 40 && size > 26) { size -= 3; g.font = `900 ${size}px "Big Shoulders Variable", Impact, sans-serif`; }
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });

  const crests = new Map(); // key -> crest
  let scaleAll = 1;
  function makeCrest(team) {
    const color = new THREE.Color(team.color);
    const group = new THREE.Group();
    const lift = new THREE.Group(); // bobbing part
    group.add(lift);
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3, emissive: color, emissiveIntensity: 0.18 });
    const body = new THREE.Mesh(shieldGeo, bodyMat);
    body.position.y = 0.35;
    const faceMat = new THREE.MeshStandardMaterial({ color: '#0a1533', metalness: 0.3, roughness: 0.55 });
    const face = new THREE.Mesh(faceGeo, faceMat);
    face.scale.set(0.84, 0.84, 1);
    face.position.set(0, 0.35 + 0.12, 0.115);
    const discMat = new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(0, 0.35 + 0.98, 0.15);
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(0, 0.35 + 0.98, 0.135);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(team.name), depthWrite: false, transparent: true }));
    label.scale.set(1.6, 0.35, 1);
    label.position.y = 2.15;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3.4, 3.4, 1);
    glow.position.set(0, 1.1, -0.2);
    lift.add(glow, body, face, frame, disc, label);
    lift.rotation.x = -0.24; // lean back towards the raised camera, so the logo faces the audience
    const pad = new THREE.Mesh(padGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.03;
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.02;
    group.add(blob, pad);
    scene.add(group);
    const crest = { key: team.key, team, group, lift, body, disc, label, glow, pad, color, phase: Math.random() * 6, base: V(), hot: 0, alive: true, hidden: false, hover: false };
    setLogo(crest, team.logoUrl);
    return crest;
  }
  function setLogo(crest, url) {
    const tex = texFor(url);
    crest.disc.material.map = tex;
    if (tex) crest.disc.material.color.setScalar(LOGO_LEVEL);
    else crest.disc.material.color.set(crest.color);
    crest.disc.material.needsUpdate = true;
    crest.logoUrl = url;
  }
  function disposeCrest(c) {
    scene.remove(c.group);
    c.body.material.dispose();
    c.disc.material.dispose();
    c.label.material.map?.dispose();
    c.label.material.dispose();
    c.glow.material.dispose();
    c.pad.material.dispose();
  }

  // Formation on the far half: fewer columns on portrait screens.
  let aspect = 1;
  function layout(keys) {
    const n = keys.length;
    const portrait = aspect < 0.9;
    const cols = portrait ? (n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4) : (n <= 4 ? Math.max(1, n) : n <= 8 ? 4 : n <= 12 ? 6 : 7);
    const rows = Math.ceil(n / Math.max(1, cols));
    scaleAll = n <= 4 ? 1.45 : n <= 8 ? 1.2 : 1;
    const sx = (portrait ? 1.7 : 2.0) * scaleAll;
    const sz = (portrait ? 2.25 : 2.6) * scaleAll;
    const out = new Map();
    keys.forEach((k, i) => {
      const r = Math.floor(i / cols);
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const c = i - r * cols;
      out.set(k, V((c - (inRow - 1) / 2) * sx + (r % 2 ? sx * 0.08 : 0), 0, -2.6 * scaleAll - r * sz));
    });
    return out;
  }

  // ---------- Camera ----------
  const cam = { pos: V(0, 9, 22), look: V(0, 1, -6) };
  let broadcast = { pos: V(0, 9, 22), look: V(0, 1, -6) };
  let camMode = 'broadcast'; // broadcast | free
  function fit() {
    const pts = [...crests.values()].filter(c => c.alive).map(c => c.base);
    if (!pts.length) pts.push(V(0, 0, -5));
    const box = new THREE.Box3().setFromPoints(pts);
    box.expandByVector(V(1.15 * scaleAll, 0, 0.8));
    box.max.y = 2.5 * scaleAll;
    const center = box.getCenter(V());
    center.y = 1.0;
    const dir = V(0, aspect < 0.9 ? 0.78 : 0.56, 1).normalize();
    const test = camera.clone();
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(V(x, y, z));
    let d = 6;
    for (; d < 80; d += 0.5) {
      test.position.copy(center).addScaledVector(dir, d);
      test.lookAt(center);
      test.updateMatrixWorld();
      test.updateProjectionMatrix();
      if (corners.every(p => { const q = p.clone().project(test); return Math.abs(q.x) < (aspect < 0.9 ? 0.93 : 0.84) && q.y < 0.52 && q.y > -0.74; })) break;
    }
    broadcast = { pos: center.clone().addScaledVector(dir, d), look: center.clone().add(V(0, aspect < 0.9 ? -0.2 : 0.4, 0)) };
  }
  const flyTo = (pose, ms = 900, ease = E.inOut) => {
    const p0 = cam.pos.clone();
    const l0 = cam.look.clone();
    return tween(ms, k => {
      cam.pos.lerpVectors(p0, pose.pos, k);
      cam.look.lerpVectors(l0, pose.look, k);
    }, ease);
  };
  const home = (ms = 1000) => {
    camMode = 'free';
    return flyTo(broadcast, ms).then(() => { camMode = 'broadcast'; });
  };

  // ---------- Ball, paddle ----------
  const ballTex = keep(canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f4e04d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c2ad1f';
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc((i * 47) % w, ((i * 29) % h), 7, 0, Math.PI * 2); g.fill(); }
  }));
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.17, 28, 18)), keep(new THREE.MeshStandardMaterial({ map: ballTex, emissive: '#f4e04d', emissiveIntensity: 0.35, roughness: 0.5 })));
  const ballGlow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: soft, color: '#ffd84d', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  ballGlow.scale.set(1.6, 1.6, 1);
  ball.add(ballGlow);
  ball.visible = false;
  scene.add(ball);

  const paddle = new THREE.Group();
  {
    const blade = new THREE.Shape();
    blade.moveTo(-0.21, 0);
    blade.lineTo(0.21, 0);
    blade.quadraticCurveTo(0.25, 0, 0.25, 0.05);
    blade.lineTo(0.25, 0.48);
    blade.quadraticCurveTo(0.25, 0.6, 0.13, 0.6);
    blade.lineTo(-0.13, 0.6);
    blade.quadraticCurveTo(-0.25, 0.6, -0.25, 0.48);
    blade.lineTo(-0.25, 0.05);
    blade.quadraticCurveTo(-0.25, 0, -0.21, 0);
    const faceTex = keep(canvasTex(256, 320, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#1f5fc6');
      gr.addColorStop(1, '#0b1f52');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#6cc04a';
      g.beginPath(); g.moveTo(0, h * 0.75); g.quadraticCurveTo(w * 0.5, h * 0.35, w, h * 0.45); g.lineTo(w, h * 0.6); g.quadraticCurveTo(w * 0.5, h * 0.5, 0, h * 0.95); g.fill();
      g.fillStyle = '#f4e04d';
      g.font = '900 64px "Big Shoulders Variable", Impact, sans-serif';
      g.textAlign = 'center';
      g.fillText('ICC', w / 2, h * 0.3);
    }));
    faceTex.repeat.set(2, 1.6);
    faceTex.offset.set(0.5, 0);
    const bladeMesh = new THREE.Mesh(keep(new THREE.ExtrudeGeometry(blade, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 })), keep(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, metalness: 0.2 })));
    bladeMesh.position.y = 0.32;
    const handle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.045, 0.05, 0.36, 12)), keep(new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.8 })));
    handle.position.y = 0.16;
    paddle.add(bladeMesh, handle);
  }
  const PADDLE_HOME = V(0.95, 0.75, 10.6);
  paddle.position.copy(PADDLE_HOME);
  paddle.rotation.set(-0.3, 0.2, -0.5);
  scene.add(paddle);

  // ---------- Spotlight hunt ----------
  const spotDisc = new THREE.Mesh(keep(new THREE.CircleGeometry(1.1, 48)), keep(new THREE.MeshBasicMaterial({ map: soft, color: '#fff2c4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
  spotDisc.rotation.x = -Math.PI / 2;
  spotDisc.position.y = 0.04;
  const spotCone = new THREE.Mesh(keep(new THREE.ConeGeometry(1.15, 16, 32, 1, true)), keep(new THREE.MeshBasicMaterial({ color: '#fff2c4', alphaMap: vertical, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  spotCone.geometry.translate(0, 8, 0);
  scene.add(spotDisc, spotCone);
  const lockRing = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ color: '#ff4d4d', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
  lockRing.rotation.x = -Math.PI / 2;
  lockRing.position.y = 0.06;
  scene.add(lockRing);
  const spotAt = V(0, 0, -6);
  let spotOn = 0;
  const placeSpot = p => {
    spotAt.copy(p);
    spotDisc.position.set(p.x, 0.04, p.z);
    spotCone.position.set(p.x, 0, p.z);
    spot.target.position.set(p.x, 1, p.z);
  };
  const setHover = keyNow => crests.forEach(c => { c.hover = c.key === keyNow; });

  // ---------- Emblems (a revealed team's logo floating in the air) ----------
  const emblems = new Map(); // side -> emblem
  const ringTorus = keep(plateGeo(1.42, 0.24)); // team-colour frame
  const embDisc = keep(plateGeo(1.26, 0.16));
  function makeEmblem(crest) {
    const g = new THREE.Group();
    const map = crest.disc.material.map;
    const discMat = new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, side: THREE.DoubleSide });
    if (map) discMat.color.setScalar(LOGO_LEVEL);
    else discMat.color.copy(crest.color);
    const disc = new THREE.Mesh(embDisc, discMat);
    disc.position.z = 0.02;
    const ring = new THREE.Mesh(ringTorus, new THREE.MeshStandardMaterial({ color: crest.color, emissive: crest.color, emissiveIntensity: 1.2, metalness: 0.5, roughness: 0.3, side: THREE.DoubleSide }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: crest.color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(3.6, 3.6, 1);
    glow.position.z = -0.1;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: crest.label.material.map, transparent: true, depthWrite: false }));
    label.scale.set(1.9, 0.42, 1);
    label.position.y = -1.0;
    g.add(glow, disc, ring, label);
    scene.add(g);
    return { group: g, slot: null, spin: 0, crest, dispose() { scene.remove(g); disc.material.dispose(); ring.material.dispose(); glow.material.dispose(); label.material.dispose(); } };
  }
  // Slots in front of the camera (top-left = first team, top-right = second, centre = clash).
  const slotLocal = side => {
    const D = 7;
    const halfH = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;
    const x = side === 'a' ? -halfW * 0.6 : side === 'b' ? halfW * 0.6 : 0;
    const y = side === 'mid' ? halfH * 0.15 : halfH * (aspect < 0.9 ? 0.5 : 0.45);
    return { pos: V(x, y, -D), scale: Math.min(1.3, halfW * 0.42) };
  };

  // ---------- Frame loop ----------
  let running = true;
  let paused = false; // e.g. behind the VERSUS screen
  let onScreen = true;
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }, { threshold: 0.01 });
  io.observe(container);
  // Adaptive quality: if frames stay slow, step down (glow off, then lower resolution) until smooth.
  // Steps down only on real overload (under ~24 fps for 2 s). A phone capped at 30 fps (iPhone Low
  // Power Mode, in-app browsers like WhatsApp's) is NOT slow — treating it as slow used to drop
  // phones to 0.75× and made everything blurry. Floors: 1.6× on phones, 1× on computers.
  const LEVELS = low
    ? [{ pr: DPR, bloom: false }, { pr: 2, bloom: false }, { pr: 1.6, bloom: false }]
    : [{ pr: DPR, bloom: true }, { pr: DPR, bloom: false }, { pr: 1.5, bloom: false }, { pr: 1.25, bloom: false }, { pr: 1, bloom: false }];
  let level = 0;
  let useBloom = Boolean(composer) && LEVELS[level].bloom;
  let ftAvg = 16.7;
  let slowFor = 0;
  const applyLevel = () => {
    renderer.setPixelRatio(Math.min(DPR, LEVELS[level].pr));
    useBloom = Boolean(composer) && LEVELS[level].bloom;
    resize();
  };
  const driftV = V();
  const shakeV = V();
  let last = performance.now();
  let t = 0;
  const tmp = V();
  const shatterBits = new Set();
  function frameLoop(now) {
    if (!running) return;
    requestAnimationFrame(frameLoop);
    if (document.hidden || paused || !onScreen) { last = now; return; }
    const frameMs = now - last;
    const dt = Math.min(0.05, frameMs / 1000);
    last = now;
    t += dt;
    if (t > 2.5 && frameMs < 250) {
      ftAvg = ftAvg * 0.94 + frameMs * 0.06;
      if (ftAvg > 42 && level < LEVELS.length - 1) {
        slowFor += dt;
        if (slowFor > 2) {
          level += 1;
          slowFor = 0;
          ftAvg = 16.7;
          applyLevel();
        }
      } else slowFor = 0;
    }
    for (const tw of tweens) {
      const k = Math.min(1, (now - tw.t0) / tw.ms);
      tw.fn(tw.ease(k), k);
      if (k >= 1) {
        tweens.delete(tw);
        clearTimeout(tw.timer);
        tw.resolve();
      }
    }
    // Crests: bob, sway, spotlight heat.
    for (const c of crests.values()) {
      c.lift.position.y = Math.sin(t * 1.6 + c.phase) * 0.06;
      c.lift.rotation.y = Math.sin(t * 0.7 + c.phase) * 0.12;
      const target = c.hover ? 1 : c.locked ? 1.6 : 0;
      c.hot += (target - c.hot) * Math.min(1, dt * 10);
      c.body.material.emissiveIntensity = 0.18 + c.hot * 0.9;
      c.glow.material.opacity = c.hot * 0.55 + (c.fated ? 0.6 + Math.sin(t * 30) * 0.2 : 0);
      const s = (1 + c.hot * 0.08) * scaleAll;
      c.lift.scale.setScalar(s);
    }
    // Emblems follow their slots in front of the camera.
    for (const em of emblems.values()) {
      if (!em.slot) continue;
      const sl = slotLocal(em.slot);
      tmp.copy(sl.pos);
      camera.localToWorld(tmp);
      em.group.position.lerp(tmp, 1 - Math.exp(-dt * 5));
      em.group.quaternion.slerp(camera.quaternion, 1 - Math.exp(-dt * 6));
      const sc = em.group.scale.x + (sl.scale - em.group.scale.x) * (1 - Math.exp(-dt * 5));
      em.group.scale.setScalar(sc);
    }
    // Shards.
    for (const b of shatterBits) {
      b.life -= dt;
      b.vel.y -= 9 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.mesh.position.y < 0.1) { b.mesh.position.y = 0.1; b.vel.y *= -0.35; b.vel.x *= 0.7; b.vel.z *= 0.7; }
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.scale.setScalar(b.size * Math.min(1, b.life * 1.5));
      if (b.life <= 0) { scene.remove(b.mesh); shatterBits.delete(b); }
    }
    sparks.update(dt);
    fire.update(dt);
    smoke.update(dt);
    // Crowd flashes.
    for (let i = 0; i < FLASHES * 3; i++) flashCol[i] *= 0.86;
    if (Math.random() < flashRate * dt * 6) {
      for (let k = 0; k < 3; k++) {
        const i = Math.floor(Math.random() * FLASHES);
        flashCol.set([1.6, 1.6, 1.8], i * 3);
      }
    }
    flashGeo.attributes.color.needsUpdate = true;
    // Light beams only in the wide shot: up close they would wash the picture out.
    beams.forEach((b, i) => { b.visible = camMode === 'broadcast'; b.material.opacity = 0.032 + Math.sin(t * 0.8 + i) * 0.006; });
    // Spotlight.
    spotDisc.material.opacity = spotOn * 0.6;
    spotCone.material.opacity = spotOn * (camMode === 'broadcast' ? 0.07 : 0.02);
    spot.intensity = spotOn * 4;
    lockRing.rotation.z += dt * 2;
    flashLight.intensity *= Math.exp(-dt * 7);
    // Camera.
    if (camMode === 'broadcast') {
      cam.pos.lerp(broadcast.pos, 1 - Math.exp(-dt * 1.5));
      cam.look.lerp(broadcast.look, 1 - Math.exp(-dt * 1.5));
    }
    if (camMode === 'broadcast') driftV.set(Math.sin(t * 0.18) * 0.7, Math.sin(t * 0.13) * 0.25, 0);
    else driftV.set(0, 0, 0);
    shakeAmt *= Math.exp(-dt * 6);
    shakeV.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shakeAmt);
    camera.position.copy(cam.pos).add(driftV).add(shakeV);
    camera.lookAt(cam.look);
    if (useBloom) composer.render();
    else renderer.render(scene, camera);
  }

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    aspect = w / h;
    camera.aspect = aspect;
    camera.fov = aspect < 0.9 ? 58 : 48;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
    relayout(false);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ---------- Team sync ----------
  let order = [];
  let synced = false;
  function relayout(animate = true) {
    const keys = order.filter(k => crests.get(k)?.alive);
    const pos = layout(keys);
    for (const [k, p] of pos) {
      const c = crests.get(k);
      const from = c.group.position.clone();
      c.base.copy(p);
      if (animate && !c.fresh) tween(1100, e => c.group.position.lerpVectors(from, p, e));
      else c.group.position.copy(p);
    }
    fit();
  }

  // ---------- Public API ----------
  const crestTop = c => c.group.position.clone().add(V(0, 1.15 * scaleAll, 0));
  // Close-up on a hit crest: from above and in front, so the rows in front never block the view.
  const impactPose = target => ({ pos: target.clone().add(V(0, 2.3 * scaleAll, 4.8 * scaleAll)), look: target.clone().add(V(0, 1.5 * scaleAll, 0)) });
  const hiddenForView = new Set();
  const clearView = target => {
    for (const c of crests.values()) {
      if (!c.alive || c.hidden) continue;
      if (c.group.position.z > target.z + 0.6 && Math.abs(c.group.position.x - target.x) < 1.9 * scaleAll) {
        c.group.visible = false;
        hiddenForView.add(c);
      }
    }
  };
  const restoreView = () => {
    hiddenForView.forEach(c => { if (!c.hidden) c.group.visible = true; });
    hiddenForView.clear();
  };
  const api = {
    // teams: [{ key, name, color, logoUrl }] in display order; live: keys standing on the court.
    sync(teams, live, { rise = false } = {}) {
      const liveSet = new Set(live);
      order = teams.map(x => x.key);
      let changed = false;
      for (const team of teams) {
        let c = crests.get(team.key);
        if (liveSet.has(team.key) && !c) {
          c = makeCrest(team);
          c.fresh = true;
          crests.set(team.key, c);
          changed = true;
        } else if (c) {
          if (c.logoUrl !== team.logoUrl) setLogo(c, team.logoUrl);
          if (!liveSet.has(team.key) && c.alive && !c.inShow) {
            c.alive = false;
            changed = true;
            const from = c.group.position.y;
            tween(700, e => { c.group.position.y = from - e * 3; }, E.in).then(() => { disposeCrest(c); crests.delete(c.key); });
          }
        }
      }
      const first = !synced;
      synced = true;
      if (changed) relayout(true);
      // First teams on screen: camera straight to the wide shot (no long glide).
      if (first && !rise) { cam.pos.copy(broadcast.pos); cam.look.copy(broadcast.look); }
      const fresh = [...crests.values()].filter(c => c.fresh);
      fresh.forEach((c, i) => {
        c.fresh = false;
        if (!rise) return;
        const p = c.base.clone();
        c.group.position.set(p.x, -3, p.z);
        wait(i * 60).then(() => {
          burst(V(p.x, 0.2, p.z), 6, [c.color, C('#ffffff')], 4, 0.6);
          return tween(900, e => { c.group.position.y = -3 + e * 3; }, E.outBack);
        });
      });
    },
    opening() {
      cam.pos.set(0, 30, 38);
      cam.look.set(0, 0, -6);
      camMode = 'free';
      flashRate = 14;
      setJumbo('LET THE DRAW', 'BEGIN!');
      return wait(400).then(() => flyTo(broadcast, 2600)).then(() => { camMode = 'broadcast'; flashRate = 3; });
    },
    jumbo: setJumbo,
    // Spotlight roams across the live crests, faster and faster until `until` (server ms).
    hunt(until, serverNow, exclude = []) {
      const skip = new Set(exclude);
      const beat = sfx.hunt();
      const start = serverNow();
      let stopped = false;
      let keyNow = null;
      spotOn = 1;
      flashRate = 6;
      const hop = async () => {
        while (!stopped) {
          const prog = Math.min(1, Math.max(0, (serverNow() - start) / Math.max(800, until - start)));
          const pool = [...crests.values()].filter(c => c.alive && !c.hidden && !skip.has(c.key) && c.key !== keyNow);
          if (!pool.length) break;
          const next = pool[Math.floor(Math.random() * pool.length)];
          const from = spotAt.clone();
          const to = next.group.position.clone();
          const ms = 720 - 520 * prog ** 1.2;
          beat.setRate(72 + prog * 110);
          await tween(ms, e => placeSpot(tmp.lerpVectors(from, to, e)), E.inOut);
          if (stopped) break;
          keyNow = next.key;
          setHover(keyNow);
        }
      };
      hop();
      return () => {
        stopped = true;
        beat.stop();
        setHover(null);
      };
    },
    // The whole pick, ~3.6 s: lock, toss, slow-motion smash, chase, shatter, logo rises.
    async strike(keyHit, side, shot, onImpact) {
      const c = crests.get(keyHit);
      if (!c) return;
      c.inShow = true;
      flashRate = 2;
      const target = crestTop(c);
      // 1. Lock on.
      const from = spotAt.clone();
      spotOn = 1;
      await tween(300, e => placeSpot(tmp.lerpVectors(from, c.group.position, e)));
      c.locked = true;
      setHover(null);
      lockRing.position.set(c.group.position.x, 0.06, c.group.position.z);
      tween(450, e => { lockRing.material.opacity = 0.9; lockRing.scale.setScalar(3 - e * 2.2); }, E.out);
      sfx.lock();
      await wait(260);
      // 2. Camera behind the paddle; ball tossed up.
      camMode = 'free';
      const serve = { pos: V(PADDLE_HOME.x + 1.1, 2.0, PADDLE_HOME.z + 3.1), look: V(PADDLE_HOME.x - 0.3, 1.9, PADDLE_HOME.z - 3) };
      ball.visible = true;
      ball.position.set(PADDLE_HOME.x - 0.35, 0.8, PADDLE_HOME.z - 0.35);
      await Promise.all([
        flyTo(serve, 650),
        tween(650, e => { ball.position.y = 0.8 + e * 1.35; ball.rotation.x += 0.05; }, E.out),
      ]);
      // 3. Slow motion at the top: paddle winds up.
      sfx.toss();
      const apex = ball.position.clone();
      await tween(420, e => {
        ball.position.y = apex.y + Math.sin(e * Math.PI) * 0.02;
        paddle.rotation.set(-0.3 - e * 0.9, 0.2, -0.5 + e * 0.4);
        paddle.position.set(PADDLE_HOME.x + e * 0.15, PADDLE_HOME.y + e * 0.9, PADDLE_HOME.z + e * 0.25);
        cam.pos.lerp(V(PADDLE_HOME.x + 0.9, 2.15, PADDLE_HOME.z + 2.3), 0.04);
      }, E.out);
      // 4. Contact!
      tween(120, e => { paddle.rotation.x = -1.2 + e * 2.1; }, E.in).then(() => tween(500, e => {
        paddle.rotation.set(0.9 - e * 1.2, 0.2, -0.1 - e * 0.4);
        paddle.position.lerpVectors(paddle.position.clone(), PADDLE_HOME, e);
      }));
      sfx.smash();
      sfx.shot(shot);
      shake(0.12);
      flashAt(ball.position, '#fff4c4', 18);
      burst(ball.position, 26, [C('#ffffff'), C('#f4e04d')], 7, 0.5, -4);
      if (bloom) tween(500, e => { bloom.strength = 1.1 - e * 0.55; });
      // 5. The shot.
      await flight(shot, ball.position.clone(), target, side, c);
      // 6. Impact.
      ball.visible = false;
      impact(c, target, shot, side);
      onImpact?.();
      const em = makeEmblem(c);
      emblems.get(side)?.dispose();
      emblems.set(side, em);
      em.group.position.copy(target);
      em.group.scale.setScalar(0.7 * scaleAll);
      flyTo(impactPose(target), 520, E.out);
      await tween(1000, e => {
        em.group.position.y = target.y + e * 2.0 * scaleAll;
        em.group.scale.setScalar((0.7 + e * 1.1) * scaleAll);
        em.group.rotation.y = (1 - e) * Math.PI * 2;
      }, E.out);
      // 7. Off to its corner; camera home (finishes during the next hunt).
      em.slot = side;
      c.locked = false;
      lockRing.material.opacity = 0;
      home(1100).then(restoreView);
    },
    // The last two: lift up, lightning arcs between them until fate is revealed.
    fate(keys) {
      let stopped = false;
      const two = keys.map(k => crests.get(k)).filter(Boolean);
      two.forEach(c => { c.fated = true; c.inShow = true; tween(700, e => { c.group.position.y = e * 1.3; }, E.outBack); });
      spotOn = 0;
      setJumbo('THE LAST TWO', 'FATE DECIDES');
      flashRate = 10;
      const arc = () => {
        if (stopped || two.length < 2) return;
        bolt(crestTop(two[0]), crestTop(two[1]), { ms: 260, color: '#d8b4ff' });
        sfx.fate();
        setTimeout(arc, rnd(180, 320));
      };
      arc();
      return () => { stopped = true; two.forEach(c => { c.fated = false; }); };
    },
    async clashFate(aKey, bKey, onImpact) {
      const A = crests.get(aKey);
      const B = crests.get(bKey);
      if (!A || !B) return;
      const mid = A.group.position.clone().lerp(B.group.position, 0.5).setY(1.3);
      const pa = A.group.position.clone();
      const pb = B.group.position.clone();
      flyTo({ pos: mid.clone().add(V(0, 1.2, 6.5 * scaleAll)), look: mid.clone().add(V(0, 0.8, 0)) }, 600);
      await tween(650, e => { A.group.position.lerpVectors(pa, mid, e); B.group.position.lerpVectors(pb, mid, e); }, E.in);
      sfx.clash();
      impact(A, mid.clone().add(V(0, 1, 0)), 'thunder', 'a', true);
      impact(B, mid.clone().add(V(0, 1, 0)), 'thunder', 'b', true);
      onImpact?.();
      for (const [side, c] of [['a', A], ['b', B]]) {
        const em = makeEmblem(c);
        emblems.get(side)?.dispose();
        emblems.set(side, em);
        em.group.position.copy(mid).add(V(side === 'a' ? -0.6 : 0.6, 1, 0));
        em.group.scale.setScalar(0.8);
        em.slot = side;
      }
      await wait(700);
      home(1000);
    },
    // A screen that joined late: show the revealed team straight in its corner.
    place(keyHit, side) {
      const c = crests.get(keyHit);
      if (!c || emblems.has(side)) return;
      c.inShow = true;
      c.hidden = true;
      c.group.visible = false;
      const em = makeEmblem(c);
      emblems.set(side, em);
      em.group.position.copy(camera.position);
      em.group.scale.setScalar(0.2);
      em.slot = side;
    },
    // Both revealed teams fly into each other just before the VERSUS screen.
    async collide() {
      const a = emblems.get('a');
      const b = emblems.get('b');
      if (!a || !b) return;
      a.slot = 'mid';
      b.slot = 'mid';
      await wait(650);
      const p = a.group.position.clone().lerp(b.group.position, 0.5);
      burst(p, 60, [a.crest.color, b.crest.color, C('#ffffff')], 9, 0.8, -2);
      flashAt(p, '#ffffff', 35);
      shake(0.25);
      sfx.clash();
    },
    // Show over: clear emblems and the spotlight, camera home.
    finish() {
      restoreView();
      emblems.forEach(em => em.dispose());
      emblems.clear();
      spotOn = 0;
      flashRate = 3;
      for (const c of crests.values()) { c.inShow = false; c.locked = false; c.fated = false; }
      lockRing.material.opacity = 0;
      setJumbo('MATCH DRAW', 'LIVE');
      if (camMode !== 'broadcast') home(900);
    },
    resize,
    // Stop drawing while something covers the arena (the VERSUS screen).
    pause(v) { paused = Boolean(v); },
    quality: () => ({ level, ftAvg: Math.round(ftAvg * 10) / 10, bloom: useBloom, pixelRatio: renderer.getPixelRatio() }),
    dispose() {
      running = false;
      tweens.forEach(tw => clearTimeout(tw.timer));
      tweens.clear();
      ro.disconnect();
      io.disconnect();
      emblems.forEach(em => em.dispose());
      crests.forEach(disposeCrest);
      textures.forEach(tx => tx.dispose());
      shatterBits.forEach(b => scene.remove(b.mesh));
      disposables.forEach(d => d.dispose?.());
      composer?.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };

  function setJumbo(a, b) {
    jumboText = [a, b];
    drawJumbo();
  }

  // ---------- Shots ----------
  async function flight(shot, from, to, side, crest) {
    const dirSide = side === 'a' ? -1 : 1;
    let path;
    let ms = 850;
    let trail;
    const fireTrail = (p, n = 3, col = FIRE) => { for (let i = 0; i < n; i++) fire.emit(p, V(rnd(-0.6, 0.6), rnd(-0.3, 0.8), rnd(-0.6, 0.6)), col[i % col.length], rnd(0.25, 0.55), 1); };
    const sparkTrail = (p, cols, n = 2) => { for (let i = 0; i < n; i++) sparks.emit(p, V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)), cols[i % cols.length], rnd(0.2, 0.5), -2); };
    const bez = (a, c1, c2, b) => e => {
      const u = 1 - e;
      return V(
        u ** 3 * a.x + 3 * u * u * e * c1.x + 3 * u * e * e * c2.x + e ** 3 * b.x,
        u ** 3 * a.y + 3 * u * u * e * c1.y + 3 * u * e * e * c2.y + e ** 3 * b.y,
        u ** 3 * a.z + 3 * u * u * e * c1.z + 3 * u * e * e * c2.z + e ** 3 * b.z,
      );
    };
    ballGlow.material.color.set('#ffd84d');
    switch (shot) {
      case 'thunder':
        ms = 650;
        path = e => from.clone().lerp(to, e).add(V(0, Math.sin(e * Math.PI) * 0.8, 0));
        ballGlow.material.color.set('#9fd8ff');
        {
          let lastMini = 0;
          trail = p => {
            sparkTrail(p, [C('#9fd8ff'), C('#ffffff')], 4);
            const now = performance.now();
            if (now - lastMini > 140) {
              lastMini = now;
              bolt(p, p.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(0, 1.5))), { ms: 90, width: 0.015, variants: 1 });
            }
          };
        }
        break;
      case 'laser': {
        ms = 420;
        path = e => from.clone().lerp(to, e);
        ballGlow.material.color.set('#7ff3ff');
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#7ff3ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        scene.add(beam);
        trail = p => {
          const len = from.distanceTo(p);
          beam.scale.set(1, Math.max(0.01, len), 1);
          beam.position.copy(from).lerp(p, 0.5);
          beam.quaternion.setFromUnitVectors(V(0, 1, 0), p.clone().sub(from).normalize());
          sparkTrail(p, [C('#7ff3ff'), C('#ffffff')], 3);
        };
        setTimeout(() => tween(400, e => { beam.material.opacity = 0.9 * (1 - e); }).then(() => { scene.remove(beam); beam.geometry.dispose(); beam.material.dispose(); }), ms);
        break;
      }
      case 'rocket':
        ms = 980;
        path = bez(from, from.clone().add(V(dirSide * 4, 3, -3)), to.clone().add(V(-dirSide * 3, 4, 4)), to);
        trail = p => { fireTrail(p, 2); smoke.emit(p, V(rnd(-0.3, 0.3), rnd(0, 0.5), rnd(-0.3, 0.3)), C('#6b7280'), rnd(0.8, 1.3), 0.4); };
        break;
      case 'meteor': {
        ms = 1000;
        const high = V(to.x * 0.4, 22, to.z + 8);
        const sky = V(to.x + dirSide * 2, 24, to.z - 4);
        path = e => (e < 0.4 ? from.clone().lerp(high, E.out(e / 0.4)) : sky.clone().lerp(to, E.in((e - 0.4) / 0.6)));
        trail = (p, e) => { if (e > 0.4) { fireTrail(p, 6); sparkTrail(p, FIRE, 2); } else sparkTrail(p, [C('#ffd84d')], 1); };
        ballGlow.material.color.set('#ff9a3c');
        break;
      }
      case 'curve':
        ms = 1000;
        path = bez(from, from.clone().add(V(dirSide * 9, 1.5, -5)), to.clone().add(V(dirSide * 8, 1, 4)), to);
        ballGlow.material.color.set('#b6ff7a');
        trail = p => sparkTrail(p, [C('#6cc04a'), C('#f4e04d'), C('#b6ff7a')], 4);
        break;
      default: // fireball
        ms = 820;
        path = bez(from, from.clone().add(V(0, 2.5, -4)), to.clone().add(V(0, 2.5, 4)), to);
        ballGlow.material.color.set('#ff9a3c');
        trail = p => { fireTrail(p, 4); sparkTrail(p, FIRE, 1); };
    }
    let prev = from.clone();
    await tween(ms, (e, raw) => {
      const p = path(e);
      ball.position.copy(p);
      ball.rotation.x += 0.4;
      trail(p, raw);
      // Chase camera: behind and above the ball, looking at the target.
      const vel = p.clone().sub(prev);
      prev = p.clone();
      if (shot === 'meteor' && raw > 0.35) {
        if (!hiddenForView.size) clearView(to);
        cam.pos.lerp(impactPose(to).pos.add(V(0, -0.8, 0.6)), 0.08);
        cam.look.lerp(p, 0.25);
      } else if (vel.lengthSq() > 1e-6) {
        const back = vel.normalize().multiplyScalar(-2.4);
        const want = p.clone().add(back).add(V(0, 0.65, 0));
        if (raw > 0.6 && !hiddenForView.size) clearView(to);
        if (raw > 0.72) want.lerp(impactPose(to).pos, (raw - 0.72) / 0.28);
        cam.pos.lerp(want, 0.22);
        cam.look.lerp(to.clone().add(V(0, 0.4, 0)), 0.2);
      }
    }, E.lin);
    void crest;
  }

  function impact(c, at, shot, side, quiet = false) {
    c.hidden = true;
    c.group.visible = false;
    const col = c.color;
    // Shards of the crest.
    for (let i = 0; i < (low ? 18 : 30); i++) {
      const m = new THREE.Mesh(shardGeo, shardMat(i % 4 ? col : '#ffffff'));
      m.position.copy(at).add(V(rnd(-0.5, 0.5), rnd(-0.6, 0.6), rnd(-0.2, 0.2)));
      const size = rnd(0.6, 1.6) * scaleAll;
      m.scale.setScalar(size);
      scene.add(m);
      shatterBits.add({ mesh: m, size, vel: V(rnd(-5, 5), rnd(2, 8), rnd(-5, 4)), spin: V(rnd(-10, 10), rnd(-10, 10), 0), life: rnd(1.1, 1.8) });
    }
    burst(at, 50, [col, C('#ffffff')], 8, 0.9, -5);
    shock(c.group.position, col, 10);
    flashAt(at, '#ffffff', quiet ? 25 : 40);
    shake(shot === 'meteor' ? 0.5 : shot === 'rocket' ? 0.4 : 0.28);
    if (quiet) return;
    sfx.impact(shot);
    switch (shot) {
      case 'thunder':
        bolt(V(at.x + rnd(-2, 2), 26, at.z + rnd(-2, 1)), at, { ms: 650, width: 0.06 });
        burst(at, 40, [C('#9fd8ff'), C('#ffffff')], 10, 0.7, -3);
        break;
      case 'laser':
        burst(at, 40, [C('#7ff3ff'), C('#ffffff')], 11, 0.6, -2);
        break;
      case 'rocket':
        burst(at, 70, FIRE, 7, 1, 1, fire);
        burst(at, 22, [C('#4b5563'), C('#6b7280')], 3, 1.6, 0.6, smoke);
        break;
      case 'meteor':
        burst(at, 90, FIRE, 9, 1.1, 0.5, fire);
        shock(c.group.position, '#ffd27a', 18, 1100);
        break;
      case 'curve':
        burst(at, 60, [C('#6cc04a'), C('#f4e04d'), C('#ffffff')], 9, 1, -6);
        break;
      default:
        burst(at, 60, FIRE, 8, 0.9, 1, fire);
    }
  }

  fit();
  cam.pos.copy(broadcast.pos);
  cam.look.copy(broadcast.look);
  resize();
  try {
    const warm = new THREE.Group();
    warm.position.set(0, 1.5, 6);
    const fake = { color: new THREE.Color('#ffffff'), team: { name: '' }, disc: { material: { map: soft } }, label: { material: { map: soft } } };
    const em = makeEmblem(fake);
    em.group.position.set(0, 1.5, 6);
    warm.add(new THREE.Mesh(shardGeo, shardMat('#ffffff')));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 1, 0)]), 2, 0.02, 3);
    warm.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })));
    warm.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
    warm.add(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
    scene.add(warm);
    renderer.compile(scene, camera);
    if (composer) composer.render(); else renderer.render(scene, camera);
    scene.remove(warm);
    warm.children.forEach(m => { if (m.material !== shardMat('#ffffff')) m.material.dispose(); });
    tube.dispose();
    em.dispose();
  } catch (err) {
    console.warn('3D warm-up skipped', err);
  }
  requestAnimationFrame(frameLoop);
  return api;
}
