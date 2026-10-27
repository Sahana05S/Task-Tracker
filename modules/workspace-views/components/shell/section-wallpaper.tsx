'use client';

import { usePathname } from 'next/navigation';

import { MORE_ITEMS, NAV_SECTIONS, isTabActive } from '@/modules/workspace-views/components/shell/nav-items';
import { Wallpaper, type WallpaperMotif } from '@/shared/ui/wallpaper';

/** The motif for a path: the active tab's, else its section's, else the quiet default for everything under More. */
export function wallpaperFor(pathname: string): WallpaperMotif {
  for (const section of NAV_SECTIONS) {
    const tab = section.tabs.find((candidate) => isTabActive(pathname, candidate));
    if (tab) return tab.wallpaper ?? section.wallpaper;
  }
  return MORE_ITEMS.find((item) => isTabActive(pathname, item))?.wallpaper ?? 'starfield';
}

/** The section's line art behind every workspace page; it changes with the section, not with each page. */
export function SectionWallpaper() {
  return <Wallpaper motif={wallpaperFor(usePathname())} />;
}
