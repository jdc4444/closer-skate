// palettes.js — neon-noir nights. Era names keep the treatment's journey
// through the decades; the city itself is dark glass and neon.
import * as THREE from 'three';

export const ERAS = [
  { name: 'THE BOARDWALK · 1972',
    skyTop: 0x0c0817, horizon: 0x551b38, skyBelow: 0x0a0610,
    building: 0x2a2230, glass: 0x171320, street: 0x16141c,
    trim: 0xff4fa3, neon2: 0xff8a3d, sign: 0xffd166,
    lamp: 0xffc890, sun: 0xff9e6a, ambient: 0x6a5070, key: 0x9a86c8 },
  { name: 'NEON AVENUE · 1982',
    skyTop: 0x070918, horizon: 0x3a1668, skyBelow: 0x05040e,
    building: 0x232136, glass: 0x121424, street: 0x131520,
    trim: 0xff3df0, neon2: 0x00e5ff, sign: 0xffe14d,
    lamp: 0xc8d8ff, sun: 0xd86aff, ambient: 0x4c5588, key: 0x8a9ae0 },
  { name: 'THE WHIRL · 1992',
    skyTop: 0x060c22, horizon: 0x14367d, skyBelow: 0x04060f,
    building: 0x1f2738, glass: 0x101828, street: 0x121724,
    trim: 0x4fc8ff, neon2: 0xff5ad8, sign: 0x9fffcf,
    lamp: 0xbfe0ff, sun: 0x8ab8ff, ambient: 0x44588c, key: 0x7e9ad8 },
  { name: 'MIDNIGHT CLUB · 2002',
    skyTop: 0x04100f, horizon: 0x0c4a44, skyBelow: 0x030a09,
    building: 0x1c2a2a, glass: 0x0f1a1a, street: 0x101a19,
    trim: 0x3df2d8, neon2: 0xff6a86, sign: 0xe2f4ff,
    lamp: 0xd2fff2, sun: 0x5ee8d0, ambient: 0x3a6660, key: 0x74b0a6 },
  { name: 'THE BALLROOM · 2012',
    skyTop: 0x120a14, horizon: 0x5c2440, skyBelow: 0x0a0508,
    building: 0x2e2430, glass: 0x1a1218, street: 0x171318,
    trim: 0xffd166, neon2: 0xff8fb8, sign: 0xff5aa8,
    lamp: 0xffe2a8, sun: 0xffb86a, ambient: 0x705468, key: 0xc89a92 },
];

export function eraPalette(i) { return ERAS[((i % ERAS.length) + ERAS.length) % ERAS.length]; }

export function nightLabel(night) {
  const base = eraPalette(night).name.split('·')[0].trim();
  return `NIGHT ${night + 1} · ${base} · ${1972 + night * 10}`;
}

export function venueName(night) {
  return eraPalette(night).name.split('·')[0].trim();
}

const _a = new THREE.Color(), _b = new THREE.Color();
export function blendedAtmosphere(nightFloat) {
  const i = Math.floor(nightFloat);
  const k = nightFloat - i;
  const A = eraPalette(i), B = eraPalette(i + 1);
  const mix = (key) => _a.setHex(A[key]).lerp(_b.setHex(B[key]), k).clone();
  return {
    skyTop: mix('skyTop'), horizon: mix('horizon'), skyBelow: mix('skyBelow'),
    ambient: mix('ambient'), sun: mix('sun'), lamp: mix('lamp'), key: mix('key'),
  };
}
