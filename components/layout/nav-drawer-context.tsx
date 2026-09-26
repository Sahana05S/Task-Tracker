'use client';

import * as React from 'react';

/**
 * Open state for the expanded navigation drawer.
 *
 * The drawer lives in the shell, but the button that opens it lives in each
 * page's header — those are siblings, not ancestor and descendant, so the state
 * has to be shared rather than passed. A context keeps it to one instance: the
 * Sheet is mounted once no matter how many headers are on screen.
 */
interface NavDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const NavDrawerContext = React.createContext<NavDrawerContextValue | null>(null);

export function NavDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const value = React.useMemo<NavDrawerContextValue>(
    () => ({ open, setOpen }),
    [open],
  );

  return (
    <NavDrawerContext.Provider value={value}>
      {children}
    </NavDrawerContext.Provider>
  );
}

/**
 * Reads the drawer state.
 *
 * Throws rather than returning a no-op when used outside the provider: a menu
 * button that silently does nothing is harder to diagnose than one that fails
 * immediately.
 */
export function useNavDrawer(): NavDrawerContextValue {
  const context = React.useContext(NavDrawerContext);

  if (!context) {
    throw new Error('useNavDrawer must be used within a NavDrawerProvider.');
  }

  return context;
}
