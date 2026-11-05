import type { BannerIcon } from '../nav/banner';

/** Decorative direction icons. The text next to them always says the same thing. */
const PATHS: Record<Exclude<BannerIcon, 'left' | 'slight-left' | 'sharp-left'>, string> = {
  straight: 'M12 21V4M6 10l6-6 6 6',
  right: 'M7 21v-9a4 4 0 0 1 4-4h9M15 3l5 5-5 5',
  'slight-right': 'M8 21v-7l9-9M10 5h7v7',
  'sharp-right': 'M7 21V4l10 10M17 8v6h-6',
  'u-turn': 'M17 21V9a5 5 0 0 0-10 0v7M3 12l4 4 4-4',
  bearing: 'M12 21V4M6 10l6-6 6 6',
  finish: 'M6 21V4h11l-2.5 4 2.5 4H6',
  gps: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
};

export function TurnIcon({ icon, rotateDeg = 0, className }: { icon: BannerIcon; rotateDeg?: number; className?: string }) {
  const mirrored = icon === 'left' || icon === 'slight-left' || icon === 'sharp-left';
  const key = (mirrored ? icon.replace('left', 'right') : icon) as keyof typeof PATHS;
  const transform = icon === 'bearing' ? `rotate(${rotateDeg} 12 12)` : mirrored ? 'translate(24 0) scale(-1 1)' : undefined;
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[key]} transform={transform} />
    </svg>
  );
}
