import { ImageResponse } from 'next/og';

import { STELLAR_STAR_PATHS } from '@/shared/ui/stellar-mark';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Home-screen icon: the Stellar star on the light theme's primary (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#6355e6' }}>
        <svg viewBox="0 0 24 24" width="116" height="116" fill="#ffffff">
          {STELLAR_STAR_PATHS.map((d) => <path key={d} d={d} />)}
        </svg>
      </div>
    ),
    size,
  );
}
