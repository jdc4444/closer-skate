// sky.js — world-fixed gradient dome, sun, clouds drifting under the city.
// The gradient is fixed to true world-up, so riding a wall visibly tilts
// the whole sky: the disorientation is the point.
import * as THREE from 'three';

const _white = new THREE.Color(0xffffff);

export class Sky {
  constructor(scene) {
    this.uniforms = {
      top: { value: new THREE.Color(0x2c2a6e) },
      horizon: { value: new THREE.Color(0xe06a72) },
      below: { value: new THREE.Color(0x451530) },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(760, 32, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.uniforms,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vDir;
          uniform vec3 top; uniform vec3 horizon; uniform vec3 below;
          void main() {
            float y = vDir.y;
            // sunset lives in a thin band at the horizon; below it the world
            // cools off fast (street mirrors mostly sample down here)
            vec3 c = mix(below, horizon, smoothstep(-0.07, 0.0, y));
            c = mix(c, top, smoothstep(0.03, 0.55, y));
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    this.dome.renderOrder = -20;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // sun disc far down the avenue, low on the horizon
    const sc = document.createElement('canvas');
    sc.width = sc.height = 256;
    const g = sc.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(sc);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color: 0xfff1d6, transparent: true,
      fog: false, depthWrite: false,
    }));
    this.sun.scale.setScalar(310);
    this.sun.renderOrder = -15;
    scene.add(this.sun);

    // soft clouds, mostly below street level — the city floats
    const cc = document.createElement('canvas');
    cc.width = 256; cc.height = 128;
    const cg = cc.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 40 + Math.random() * 176, y = 40 + Math.random() * 48;
      const r = 26 + Math.random() * 34;
      const gr = cg.createRadialGradient(x, y, 2, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      cg.fillStyle = gr;
      cg.fillRect(0, 0, 256, 128);
    }
    const cloudTex = new THREE.CanvasTexture(cc);
    cloudTex.colorSpace = THREE.SRGBColorSpace;
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false,
        opacity: 0.16 + Math.random() * 0.12, fog: false,
      }));
      const high = i >= 10;
      sp.position.set(
        (Math.random() - 0.5) * 420,
        high ? 60 + Math.random() * 80 : -26 - Math.random() * 50,
        Math.random() * 700 - 100
      );
      sp.scale.set(120 + Math.random() * 140, 34 + Math.random() * 40, 1);
      sp.userData.drift = (Math.random() - 0.5) * 1.2;
      scene.add(sp);
      this.clouds.push(sp);
    }

    // drifting dust motes for haze sparkle
    const N = 420;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 50 - 10;
      pos[i * 3 + 2] = Math.random() * 500 - 80;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(this.dust);
  }

  update(dt, camPos, playerPos, atm) {
    this.dome.position.copy(camPos);
    this.uniforms.top.value.copy(atm.skyTop);
    this.uniforms.horizon.value.copy(atm.horizon);
    this.uniforms.below.value.copy(atm.skyBelow);
    this.sun.material.color.copy(atm.sun);
    this.sun.position.set(playerPos.x, 4, playerPos.z + 640);

    for (const c of this.clouds) {
      c.material.color.copy(atm.sun).lerp(_white, 0.45);
      c.position.x += c.userData.drift * dt;
      if (c.position.z < playerPos.z - 380) c.position.z += 760;
      if (c.position.z > playerPos.z + 380) c.position.z -= 760;
      if (c.position.x < playerPos.x - 420) c.position.x += 840;
      if (c.position.x > playerPos.x + 420) c.position.x -= 840;
    }
    const dp = this.dust.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const z = dp.getZ(i), x = dp.getX(i);
      if (z < playerPos.z - 270) dp.setZ(i, z + 540);
      else if (z > playerPos.z + 270) dp.setZ(i, z - 540);
      if (x < playerPos.x - 270) dp.setX(i, x + 540);
      else if (x > playerPos.x + 270) dp.setX(i, x - 540);
    }
    dp.needsUpdate = true;
  }
}
