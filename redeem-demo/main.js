import * as THREE from "three";

const canvas = document.querySelector("#vault");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const RIPPLES = 64;
const rippleSlots = Array.from({ length: RIPPLES }, () => new THREE.Vector3(0, 0, 20));
const uniforms = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uRipples: { value: rippleSlots },
  uBurst: { value: 0 },
};

const material = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uRes;
    uniform vec3 uRipples[64];
    uniform float uBurst;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.05 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = vUv;
      vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float t = uTime;

      vec2 slope = vec2(0.0);
      for (int i = 0; i < 64; i++) {
        vec2 d = p - uRipples[i].xy;
        float age = uRipples[i].z;
        float fall = exp(-age * 0.9) * exp(-dot(d, d) * 160.0);
        slope += d * fall;
      }
      vec2 sp = p + slope * 0.035;
      float n = fbm(sp * 1.8 + vec2(t * 0.035, -t * 0.02));
      float caustic = pow(sin((sp.x + n) * 6.0 + t * 0.7) * sin((sp.y - n) * 5.0 - t * 0.5), 2.0);

      vec2 warp = vec2(
        fbm(sp * 1.2 + vec2(t * 0.028, 2.4)),
        fbm(sp * 1.2 + vec2(5.1, -t * 0.02))
      );
      vec2 q = sp + (warp - 0.5) * 0.9;
      float sway = sin(q.x * 1.7 + t * 0.12) * 0.07 + sin(q.x * 3.4 - t * 0.05) * 0.025;
      float seam = q.y + 0.08 - q.x * 0.62 + sway;
      float branch = q.y - 0.22 + q.x * 0.15 + sin(q.x * 2.4 + 0.6) * 0.04;
      seam += (fbm(vec2(q.x * 2.6, seam * 5.0) + t * 0.03) - 0.5) * 0.07;

      float core = exp(-abs(seam) * 46.0);
      float halo = exp(-abs(seam) * 11.0);
      float spur = exp(-abs(branch) * 58.0);
      float glint = smoothstep(0.66, 0.94, fbm(q * 13.0 + vec2(t * 0.22, 1.0))) * core;

      vec3 deep = vec3(0.08, 0.05, 0.02);
      vec3 mid = vec3(0.42, 0.26, 0.08);
      vec3 gold = vec3(0.918, 0.702, 0.031);
      vec3 champ = vec3(0.976, 0.91, 0.72);

      vec3 col = mix(deep, mid, smoothstep(0.2, 0.85, n));
      col += champ * caustic * 0.08;
      col += gold * halo * 0.5;
      col += champ * core * 0.95;
      col += gold * spur * 0.4;
      col += vec3(1.0, 0.97, 0.86) * glint * 0.5;

      float ring = abs(length(p) - mix(0.15, 0.72, uBurst));
      float sparks = exp(-ring * mix(30.0, 8.0, uBurst)) * uBurst;
      col += champ * sparks * 1.4;
      col += gold * uBurst * exp(-dot(p, p) * 1.2) * 0.8;

      float vignette = smoothstep(1.15, 0.25, length(p));
      col *= vignette;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(mesh);

function pointerToField(clientX, clientY) {
  const aspect = innerWidth / Math.max(innerHeight, 1);
  return {
    x: (clientX / innerWidth - 0.5) * aspect,
    y: 0.5 - clientY / innerHeight,
  };
}

let rippleCursor = 0;
let latest = 0;
let lastDrop = { x: -9999, y: -9999 };

function placeRipple(index, clientX, clientY, age) {
  const at = pointerToField(clientX, clientY);
  rippleSlots[index].set(at.x, at.y, age);
  latest = index;
}

function stampAlong(clientX, clientY) {
  if (lastDrop.x < -9000) {
    placeRipple(rippleCursor, clientX, clientY, 0);
    rippleCursor = (rippleCursor + 1) % RIPPLES;
    lastDrop = { x: clientX, y: clientY };
    return;
  }
  const dx = clientX - lastDrop.x;
  const dy = clientY - lastDrop.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return;
  const steps = Math.min(32, Math.floor(dist / 2));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    placeRipple(rippleCursor, lastDrop.x + dx * t, lastDrop.y + dy * t, 0);
    rippleCursor = (rippleCursor + 1) % RIPPLES;
  }
  lastDrop = { x: clientX, y: clientY };
}

const target = { x: 0, y: 0, has: false };
const follow = { x: 0, y: 0, ready: false };

addEventListener("pointermove", (event) => {
  target.x = event.clientX;
  target.y = event.clientY;
  if (!follow.ready) {
    follow.x = target.x;
    follow.y = target.y;
    follow.ready = true;
  }
  target.has = true;
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  uniforms.uRes.value.set(innerWidth, innerHeight);
}
addEventListener("resize", resize);
resize();

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let burst = 0;
const clock = new THREE.Clock();
function frame() {
  const dt = clock.getDelta();
  if (!reduce) uniforms.uTime.value += dt;
  if (!reduce && target.has && follow.ready) {
    const ease = 1 - Math.exp(-dt * 2.4);
    follow.x += (target.x - follow.x) * ease;
    follow.y += (target.y - follow.y) * ease;
    stampAlong(follow.x, follow.y);
  }
  for (let i = 0; i < RIPPLES; i++) rippleSlots[i].z += dt;
  burst += (0 - burst) * Math.min(1, dt * 0.85);
  uniforms.uBurst.value = burst;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

const chrome = document.querySelector(".chrome");
const payBtn = document.querySelector("#payBtn");
const menu = document.querySelector("#menu");
const stage = document.querySelector("#stage");
const home = document.querySelector("#home");
const codeForm = document.querySelector("#codeForm");
const codeRow = document.querySelector("#codeRow");
const inputs = [...codeRow.querySelectorAll("input")];
const phone = document.querySelector("#phone");
const desktop = document.querySelector("#desktop");
const opened = document.querySelector("#opened");
const finder = document.querySelector("#finder");

function setMenu(open) {
  menu.hidden = !open;
  payBtn.setAttribute("aria-expanded", String(open));
}
payBtn.addEventListener("click", () => setMenu(menu.hidden));
document.addEventListener("click", (event) => {
  if (!event.target.closest(".pay-wrap")) setMenu(false);
});

function viewMode() {
  return document.body.dataset.view || (matchMedia("(max-width: 800px)").matches ? "phone" : "desktop");
}
function applyView(mode) {
  document.body.dataset.view = mode;
  for (const button of document.querySelectorAll(".view-toggle button")) {
    button.classList.toggle("on", button.dataset.view === mode);
  }
  const onPhone = mode === "phone" && !document.body.classList.contains("success");
  phone.hidden = !onPhone;
  desktop.hidden = onPhone;
}
applyView(viewMode());
for (const button of document.querySelectorAll(".view-toggle button")) {
  button.addEventListener("click", () => applyView(button.dataset.view));
}

function openStage() {
  setMenu(false);
  document.body.classList.remove("success");
  opened.hidden = true;
  stage.hidden = false;
  home.hidden = true;
  chrome.hidden = true;
  applyView(viewMode());
  inputs.forEach((input) => { input.value = ""; });
  if (viewMode() === "desktop") inputs[0].focus();
}
function closeStage() {
  stage.hidden = true;
  home.hidden = false;
  chrome.hidden = false;
  document.body.classList.remove("success");
  opened.hidden = true;
}

document.querySelector("#redeemItem").addEventListener("click", openStage);
document.querySelector("#closeStage").addEventListener("click", closeStage);
document.querySelector("#done").addEventListener("click", closeStage);
document.querySelector("#toScan").addEventListener("click", () => applyView("phone"));
document.querySelector("#toCode").addEventListener("click", () => {
  applyView("desktop");
  inputs[0].focus();
});

inputs.forEach((input, index) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(-1);
    if (input.value && inputs[index + 1]) inputs[index + 1].focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Backspace" && !input.value && inputs[index - 1]) inputs[index - 1].focus();
  });
  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const digits = (event.clipboardData.getData("text").match(/\d/g) || []).slice(0, 5);
    digits.forEach((digit, i) => { inputs[i].value = digit; });
    (inputs[digits.length] || inputs[4]).focus();
  });
});

const amounts = {
  "48120": "2 000 €",
  "10001": "1 000 €",
  "50000": "500 €",
  "30000": "3 000 €",
  "40000": "4 000 €",
};

function reveal(code) {
  const amount = amounts[code] || "2 000 €";
  document.querySelector("#openedTitle").textContent = `${amount} is yours`;
  document.querySelector("#voucherAmount").textContent = amount;
  document.querySelector("#openedMeta").textContent = `NG-${code} · not activated yet · purpose chosen later`;
  burst = 1;
  document.body.classList.add("success");
  opened.hidden = false;
  desktop.hidden = true;
  phone.hidden = true;
}

codeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = inputs.map((input) => input.value).join("");
  if (code.length < 5) {
    codeRow.classList.remove("shake");
    void codeRow.offsetWidth;
    codeRow.classList.add("shake");
    return;
  }
  reveal(code);
});

let scanning = false;
finder.addEventListener("click", () => {
  if (scanning) return;
  scanning = true;
  finder.classList.add("lock");
  setTimeout(() => {
    finder.classList.remove("lock");
    scanning = false;
    reveal("48120");
  }, 700);
});

addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!stage.hidden) closeStage();
    else setMenu(false);
  }
});
