import type { CSSProperties } from 'react';
import styles from './taskpulse-beaver.module.css';

export type BeaverState = 'neutral' | 'focused' | 'thinking' | 'celebrating' | 'confused' | 'stuck' | 'overloaded' | 'oops';
const CELLS: Record<BeaverState, readonly [number, number]> = {
  neutral: [0, 0], focused: [1, 0], thinking: [2, 0], celebrating: [3, 0],
  confused: [0, 1], stuck: [1, 1], overloaded: [2, 1], oops: [3, 1],
};

/** Decorative by default: the surrounding UI must state the actual work status. */
export function TaskPulseBeaver({ state = 'neutral', size = 96, label }: {
  state?: BeaverState; size?: number; label?: string;
}) {
  const [column, row] = CELLS[state];
  return <span
    className={`${styles.beaver} ${state === 'neutral' ? styles.neutral : styles.atlas} ${state === 'celebrating' ? styles.celebrate : ''}`}
    style={{ width: size, height: size, '--beaver-x': `${column * 100 / 3}%`, '--beaver-y': `${row * 100}%` } as CSSProperties}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  />;
}
