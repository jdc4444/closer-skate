// palettes.js — era moods. Porcelain architecture, saturated duochrome skies.
import * as THREE from 'three';

export const ERAS = [
  { name: 'THE BOARDWALK · 1972',
    skyTop: 0x2c2a6e, horizon: 0xe06a72, skyBelow: 0x451530,
    building: 0xf4dcd4, street: 0xc9a4ae, trim: 0xff5aa8, neon2: 0xffd166,
    lamp: 0xffc890, sun: 0xfff1d6, ambient: 0xffd2b8 },
  { name: 'NEON AVENUE · 1982',
    skyTop: 0x1c1450, horizon: 0xb44fd0, skyBelow: 0x2a1045,
    building: 0xe8d8f2, street: 0xa890c8, trim: 0xff3df0, neon2: 0xffe14d,
    lamp: 0xffd166, sun: 0xffc2f8, ambient: 0xe0b8ff },
  { name: 'THE WHIRL · 1992',
    skyTop: 0x1c3a9e, horizon: 0xe87ab8, skyBelow: 0x1c2160,
    building: 0xe4ecfa, street: 0x92a8d8, trim: 0xff5ad8, neon2: 0x62e0ff,
    lamp: 0xbfe0ff, sun: 0xffe2f8, ambient: 0xb8d0ff },
  { name: 'MIDNIGHT CLUB · 2002',
    skyTop: 0x06283a, horizon: 0x2eb8b0, skyBelow: 0x0a2832,
    building: 0xddf2ee, street: 0x7fb0ac, trim: 0x3df2d8, neon2: 0xff6a86,
    lamp: 0xe2f4ff, sun: 0xd8fff2, ambient: 0xbef2ec },
  { name: 'THE BALLROOM · 2012',
    skyTop: 0x441430, horizon: 0xe88a6a, skyBelow: 0x3a0e20,
    building: 0xfae8da, street: 0xd2a48e, trim: 0xffd166, neon2: 0xff8fb8,
    lamp: 0xffe2a8, sun: 0xfff6dc, ambient: 0xffdcc2 },
];

export function eraPalette(i) { return ERAS[((i % ERAS.length) + ERAS.length) % ERAS.length]; }

// "NIGHT 3 · THE WHIRL · 1992"
export function nightLabel(night) {
  const base = eraPalette(night).name.split('·')[0].trim();
  return `NIGHT ${night + 1} · ${base} · ${1972 + night * 10}`;
}

export function venueName(night) {
  return eraPalette(night).name.split('·')[0].trim();
}

// nightFloat: night index + 0..1 transition into the next
const _a = new THREE.Color(), _b = new THREE.Color();
export function blendedAtmosphere(nightFloat) {
  const i = Math.floor(nightFloat);
  const k = nightFloat - i;
  const A = eraPalette(i), B = eraPalette(i + 1);
  const mix = (key) => _a.setHex(A[key]).lerp(_b.setHex(B[key]), k).clone();
  return {
    skyTop: mix('skyTop'), horizon: mix('horizon'), skyBelow: mix('skyBelow'),
    ambient: mix('ambient'), sun: mix('sun'), lamp: mix('lamp'),
  };
}
