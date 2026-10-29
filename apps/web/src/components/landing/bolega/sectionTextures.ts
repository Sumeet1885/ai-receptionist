import type { CSSProperties } from 'react';

// Landing-only, original business and craft-inspired tiles. These are separate
// from publicTexture.ts so no other public page uses these section motifs.
const motifs = {
  hero: '<path d="M20 20h38a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H36L24 64V54h-4a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6Z"/><path d="M28 34v6m7-12v18m7-22v26m7-20v14M64 42h12a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-4v8L60 74H48a6 6 0 0 1-6-6v-6"/>',
  workflow: '<rect x="10" y="14" width="24" height="18" rx="4"/><rect x="62" y="36" width="24" height="18" rx="4"/><rect x="10" y="66" width="24" height="18" rx="4"/><path d="M34 23h12q6 0 6 6v10q0 6 6 6h4m-6-5 6 5-6 5M62 45h-4q-6 0-6 6v18q0 6-6 6H34m6-5-6 5 6 5M18 23h8m44 22h8M18 75h8"/>',
  languages: '<path d="M0 24c24-32 24 32 48 0s24 32 48 0M0 36c24-32 24 32 48 0s24 32 48 0M0 72c24-32 24 32 48 0s24 32 48 0"/>',
  brand: '<path d="M48 88V52m0 0C20 40 30 18 48 36c18-18 28 4 0 16Zm0-16C24 20 42 6 48 24c6-18 24-4 0 12Zm0 36C26 72 24 58 30 58l18 14Zm0 8c22 0 24-14 18-14L48 80Z"/>',
  contrast: '<path d="m-24 24 48-48M0 48 48 0M24 72 72 24M48 96l48-48M72 120l48-48M-20 32 28-16M4 56 52 8M28 80 80 28M52 104l48-48"/>',
  leads: '<rect x="14" y="18" width="50" height="38" rx="5"/><circle cx="28" cy="31" r="5"/><path d="M20 46c0-10 16-10 16 0m6-16h14m-14 8h10m-10 8h8M38 56v16h20" stroke-dasharray="3 4"/><path d="M62 60h16a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-8l-8 6v-6a5 5 0 0 1-5-5V65a5 5 0 0 1 5-5Zm3 10 4 4 7-8"/>',
  usecases: '<path d="M12 40V16h26v24Zm9-18h8m-4-4v8M8 40h34M20 40v-8h10v8M56 24 72 10l16 14M60 22v18h24V22M68 40V30h8v10M12 74l4-12h18l5 12v10H12Zm0 0h27m-21-6h10m30-8v14m4-14v14m4-14v14m-4 0v14m18-28v28m0-28c-8 4-8 16 0 16"/><circle cx="18" cy="84" r="3"/><circle cx="33" cy="84" r="3"/>',
  questions: '<path d="M16 18h34a5 5 0 0 1 5 5v21a5 5 0 0 1-5 5H30l-10 8v-8h-4a5 5 0 0 1-5-5V23a5 5 0 0 1 5-5ZM44 58h32a5 5 0 0 1 5 5v16a5 5 0 0 1-5 5h-3v7l-10-7H44a5 5 0 0 1-5-5V63a5 5 0 0 1 5-5Z"/><path d="M28 29c0-9 14-9 14 0 0 5-7 4-7 9m15 30h20m-20 7h14"/><circle cx="35" cy="43" r=".8"/>',
  contact: '<path d="M32 22h32v8H32Zm4 8c0 10-14 16-14 30 0 24 52 24 52 0 0-14-14-20-14-30M24 58h48M28 70h40"/><path d="m36 48 6-6 6 6 6-6 6 6"/>',
  ticker: '<path d="m0 36 12 12L0 60m24-24 12 12-12 12m24-24 12 12-12 12m24-24 12 12-12 12"/>',
  footer: '<path d="M0 18 24 42 48 18 72 42 96 18M0 30l24 24 24-24 24 24 24-24M0 42l24 24 24-24 24 24 24-24"/>',
} as const;

const textures = Object.fromEntries(Object.entries(motifs).map(([key, motif]) => {
  const businessMotif = ['hero', 'workflow', 'leads', 'usecases', 'questions'].includes(key);
  const colour = key === 'contrast' || key === 'ticker' ? '#b49153' : '#24695c';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g fill="none" stroke="${colour}" stroke-opacity="0.065" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">${motif}</g></svg>`;
  const tile = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return [key, {
    backgroundImage: key === 'hero' ? `linear-gradient(to bottom, var(--color-background) 82px, transparent 150px), ${tile}` : tile,
    backgroundSize: key === 'hero' ? '100% 100%, 180px 180px' : businessMotif ? '180px 180px' : '120px 120px',
    backgroundRepeat: key === 'hero' ? 'no-repeat, repeat' : 'repeat',
  }];
})) as Record<keyof typeof motifs, CSSProperties>;

export function sectionTexture(section: keyof typeof motifs): CSSProperties {
  return textures[section];
}
