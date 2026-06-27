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
  // Radius kept well inside the camera far plane so the dome is never clipped;
  // it follows the camera each frame so it always fills the view.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 20), skyMat);
  sky.renderOrder = -1;
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
      // keep the shadow frustum and the sky dome following the action
      if (focus) {
        sun.target.position.copy(focus);
        sun.position.set(focus.x - 800, focus.y + 1200, focus.z + 600);
        sky.position.copy(focus);
      }
      clouds.update(dt);
    },
    // darken the dome and dim the sun for rainy weather
    setRain(on) {
      if (on) {
        uniforms.top.value.setHex(0x2f3336);
        uniforms.bottom.value.setHex(0x565a5d);
        sun.intensity = 0.45;
        hemi.intensity = 0.6;
      } else {
        uniforms.top.value.setHex(WORLD.skyTop);
        uniforms.bottom.value.setHex(WORLD.skyBottom);
        sun.intensity = 1.0;
        hemi.intensity = 0.95;
      }
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
