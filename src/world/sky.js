import * as THREE from 'three';
import { WORLD } from '../core/config.js';

// Overcast, smoke-stained sky. A gradient dome + low brooding light to match
// the bleak Western-Front mood of the reference art.
export function setupSky(scene) {
  scene.background = new THREE.Color(WORLD.fogColor);
  scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);

  // Gradient sky dome
  const uniforms = {
    top: { value: new THREE.Color(WORLD.skyTop) },
    bottom: { value: new THREE.Color(WORLD.skyBottom) },
    offset: { value: 400 },
    exponent: { value: 0.7 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 bottom;
      uniform float offset; uniform float exponent;
      varying vec3 vWorld;
      void main() {
        float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
        float f = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottom, top, f), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(WORLD.fogFar * 1.1, 24, 16), skyMat);
  scene.add(sky);

  // Lighting — weak sun smothered by cloud, cool ambient fill.
  const hemi = new THREE.HemisphereLight(0xd2cab6, 0x55503f, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xe6dcc4, 1.0);
  sun.position.set(-800, 1200, 600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 1200;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 4000;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.AmbientLight(0x44443c, 0.6);
  scene.add(ambient);

  // Lumpy low cloud bank — big soft sprites drifting overhead.
  const clouds = buildClouds(scene);

  return {
    sun,
    update(dt, focus) {
      // keep the shadow frustum following the action
      if (focus) {
        sun.target.position.copy(focus);
        sun.position.set(focus.x - 800, focus.y + 1200, focus.z + 600);
      }
      clouds.update(dt);
    },
  };
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(150,146,138,0.55)');
  g.addColorStop(0.6, 'rgba(110,106,98,0.3)');
  g.addColorStop(1, 'rgba(80,78,72,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function buildClouds(scene) {
  const tex = cloudTexture();
  const group = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < 40; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, opacity: 0.5,
    }));
    const r = 1200 + Math.random() * 2600;
    const a = Math.random() * Math.PI * 2;
    s.position.set(Math.cos(a) * r, 700 + Math.random() * 500, Math.sin(a) * r);
    const sc = 700 + Math.random() * 900;
    s.scale.set(sc, sc * 0.55, 1);
    group.add(s);
    sprites.push(s);
  }
  scene.add(group);
  return {
    update(dt) {
      for (const s of sprites) {
        s.position.x += dt * 6;
        if (s.position.x > 4200) s.position.x = -4200;
      }
    },
  };
}
