// palettes.js — Miami, 1970-something. Pastel stucco and neon script,
// coral sunsets over a lagoon-wet street. Era names still walk the decades.
import * as THREE from 'three';

export const ERAS = [
  { name: 'OCEAN DRIVE · 1972',
    skyTop: 0x2a1a5e, horizon: 0xff7e4f, skyBelow: 0x241636,
    building: 0xf2e0d0, glass: 0x9fb8c8, street: 0x232a32,
    trim: 0xff5fa2, neon2: 0x2ee6c8, sign: 0xffd166,
    lamp: 0xffd9a0, sun: 0xffb36a, ambient: 0xc98a74, key: 0xe8a87a },
  { name: 'NEON AVENUE · 1982',
    skyTop: 0x1c1248, horizon: 0xd84f9e, skyBelow: 0x1c1238,
    building: 0xead8e0, glass: 0x8aa8c0, street: 0x1f2630,
    trim: 0xff3df0, neon2: 0x00e5ff, sign: 0xffe14d,
    lamp: 0xe8d8ff, sun: 0xff8ad2, ambient: 0xa878a0, key: 0xc090c0 },
  { name: 'THE WHIRL · 1992',
    skyTop: 0x142457, horizon: 0xe87a6a, skyBelow: 0x1c1434,
    building: 0xe2ece4, glass: 0x90b8b8, street: 0x202a30,
    trim: 0x2ee6c8, neon2: 0xff5fa2, sign: 0xfff2b8,
    lamp: 0xcfe8e0, sun: 0xffc28a, ambient: 0x9a8a88, key: 0xc0a890 },
  { name: 'MIDNIGHT CLUB · 2002',
    skyTop: 0x0c1440, horizon: 0xb04a7e, skyBelow: 0x141030,
    building: 0xd8d8e8, glass: 0x7898b8, street: 0x1b222c,
    trim: 0xff7eb8, neon2: 0x4fd8e8, sign: 0xe8f2ff,
    lamp: 0xd8e0ff, sun: 0xe88ab8, ambient: 0x8878a0, key: 0xa890c0 },
  { name: 'THE BALLROOM · 2012',
    skyTop: 0x241445, horizon: 0xe8743e, skyBelow: 0x201430,
    building: 0xf4e4cc, glass: 0xa8b8b0, street: 0x252a2e,
    trim: 0xffd166, neon2: 0xff8fb8, sign: 0xff5fa2,
    lamp: 0xffe2a8, sun: 0xffc06a, ambient: 0xc4927a, key: 0xe0a882 },
];

// the stucco rainbow — every building picks its own, regardless of the night
export const STUCCOS = [0xf2c4c4, 0xf7d9b8, 0xcfe8d8, 0xbfe4e0, 0xf2e8d8, 0xddd0ec, 0xf7c9a8, 0xc8e0f0];

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
