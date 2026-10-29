import type { CSSProperties } from 'react';

// Original vector motifs inspired by Indian craft geometry, not downloaded artwork.
// Colour is deliberately faint; opaque input/card surfaces keep their existing contrast.
const motifs = {
  phulkari: '<path d="m48 20 12 12-12 12-12-12Zm0 32 12 12-12 12-12-12ZM20 48l12-12 12 12-12 12Zm32 0 12-12 12 12-12 12Z"/><path d="M44 48h8m-4-4v8"/>',
  seed: '<path d="M28 20q16 12 0 24-16-12 0-24ZM68 52q16 12 0 24-16-12 0-24Z"/><circle cx="68" cy="28" r="2"/><circle cx="28" cy="68" r="2"/>',
  paisley: '<path d="M62 16C26 20 20 42 28 62s36 20 42 2c8-22-14-28-8-48ZM58 34c-18 4-24 20-14 28s20-2 18-10"/><circle cx="48" cy="52" r="3"/>',
  arches: '<path d="M12 84V44C12 28 36 24 48 12c12 12 36 16 36 32v40M24 84V48c0-12 16-18 24-24 8 6 24 12 24 24v36M36 84V52c0-6 8-12 12-16 4 4 12 10 12 16v32"/>',
  lotus: '<path d="M48 72C20 60 20 36 28 28c14 4 20 18 20 32C48 46 54 32 68 28c8 8 8 32-20 44Zm0 0C32 50 36 28 48 16c12 12 16 34 0 56Z"/><path d="M28 76q20 10 40 0"/>',
  jaali: '<path d="M0 48 48 0l48 48-48 48Z"/><path d="M24 48 48 24l24 24-24 24Z"/><circle cx="48" cy="48" r="6"/>',
  kolam: '<path d="M48 12c24 0 36 12 36 36S72 84 48 84 12 72 12 48s12-36 36-36Zm0 12c-32 0-32 48 0 48s32-48 0-48Z"/><path d="M12 48q36-36 72 0-36 36-72 0Z"/><circle cx="48" cy="48" r="3"/>',
  bandhani: '<circle cx="24" cy="24" r="5"/><circle cx="72" cy="72" r="5"/><circle cx="24" cy="24" r="1"/><circle cx="72" cy="72" r="1"/><path d="m48 10 4 4-4 4-4-4Zm0 68 4 4-4 4-4-4Z"/>',
  ajrakh: '<path d="m48 16 8 16 18-6-6 18 16 8-16 8 6 18-18-6-8 16-8-16-18 6 6-18-16-8 16-8-6-18 18 6Z"/><path d="m48 34 18 18-18 18-18-18Z"/>',
  weave: '<path d="M0 16h96M0 20h96M0 64h96M0 68h96M16 0v96M20 0v96M64 0v96M68 0v96"/>',
  leaf: '<path d="M48 80V28m0 28C22 56 22 32 26 24c16 0 22 16 22 32Zm0-8c0-20 14-30 24-30 4 18-4 30-24 30Zm0 28c18 0 24-12 24-22-16 0-24 10-24 22Z"/>',
  waves: '<path d="M-24 24Q0 0 24 24t48 0 48 0M-24 36Q0 12 24 36t48 0 48 0M-24 72Q0 48 24 72t48 0 48 0M-24 84Q0 60 24 84t48 0 48 0"/>',
} as const;

export type PublicTexture = keyof typeof motifs;

const textures = Object.fromEntries(Object.entries(motifs).map(([name, motif]) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="#24695c" stroke-opacity="0.075" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${motif}</g></svg>`;
  return [name, {
    backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
    backgroundSize: '112px 112px',
  }];
})) as Record<PublicTexture, CSSProperties>;

export function publicTexture(motif: PublicTexture): CSSProperties {
  return textures[motif];
}
