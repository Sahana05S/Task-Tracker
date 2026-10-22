'use client';

import { useEffect, useState } from 'react';
import type * as React from 'react';
import { PlayIcon, RotateCcwIcon, SkipForwardIcon, SparklesIcon } from 'lucide-react';

import type { CeremonyModel } from '@/modules/recognition/client';
import { Button } from '@/shared/ui/button';

import { AwardCard, categorySentence, FinaleCard, HiddenAwardCard } from './ceremony-cards';
import { REDUCED_MOTION_QUERY, useReducedMotion } from './use-reduced-motion';

/** Steps: 0 = curtain, 1..10 = categories revealed, 11 = monthly star, then done. */
type Step = number;

/**
 * The ceremony's acts: one card per category award, then the monthly star,
 * then the `commendations` slot (the policies module's CommendationsAct, passed
 * in by the /awards page so recognition never imports policies).
 *
 * An official ceremony is revealed one card at a time (Next, Skip, Replay) the
 * first time it is opened in a tab; later visits, reduced motion and a
 * provisional ceremony show everything face up. The live region reads each
 * reveal aloud; hidden cards carry no names.
 */
export function CeremonyStage({ model, viewerId, notes = {}, commendations }: {
  model: CeremonyModel;
  viewerId: string;
  /** Plain-language reasons for unavailable categories, by factor (worded on the server). */
  notes?: Partial<Record<string, string>>;
  commendations?: React.ReactNode;
}) {
  const total = model.categories.length + 1;
  const reduced = useReducedMotion();
  const official = model.status === 'official' && model.publication !== null;
  const seenKey = official ? `tp.ceremony.${model.publication!.ceremonyId}` : null;
  // An official ceremony starts behind the curtain (so the server never shows
  // the winners first); a tab that has seen it, or reduced motion, opens it.
  const [step, setStep] = useState<Step>(seenKey ? 0 : total + 1);
  const [announce, setAnnounce] = useState('');

  useEffect(() => {
    if (!seenKey) return;
    let seen = reduced || Boolean(window.matchMedia?.(REDUCED_MOTION_QUERY).matches);
    try { seen ||= Boolean(window.sessionStorage.getItem(seenKey)); } catch { seen = true; }
    if (seen) setStep(total + 1);
  }, [seenKey, reduced, total]);

  const done = step > total;
  const finish = () => {
    setStep(total + 1);
    setAnnounce(commendations ? 'All awards revealed. Commendations follow.' : 'All awards revealed.');
    try { if (seenKey) window.sessionStorage.setItem(seenKey, '1'); } catch { /* reveal again next time */ }
  };
  const next = () => {
    const to = step + 1;
    if (to > total) return finish();
    setStep(to);
    setAnnounce(to <= model.categories.length
      ? `${categorySentence(model.categories[to - 1], model.names)}.`
      : model.monthlyStar.winnerId ? `Monthly star: ${model.names[model.monthlyStar.winnerId] ?? 'a team member'}.` : 'Monthly star: not awarded.');
    if (to === total) try { if (seenKey) window.sessionStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
  };

  return (
    <div className="grid gap-5">
      <p aria-live="polite" className="sr-only">{announce}</p>

      {step === 0 ? (
        <section className="soft-card relative overflow-hidden px-6 py-10 text-center">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-135 from-primary-subtle via-card to-recognition-subtle" />
          <div className="relative grid justify-items-center gap-3">
            <SparklesIcon className="text-recognition size-8" aria-hidden="true" />
            <h2 className="text-foreground text-xl font-bold tracking-tight">The awards are in</h2>
            <p className="text-muted-foreground max-w-md text-sm">
              {model.categories.length} category awards, then the monthly star. Reveal them one at a time, or see them all at once.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={next}><PlayIcon aria-hidden="true" />Start the ceremony</Button>
              <Button variant="outline" onClick={finish}>Show all</Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section aria-label="Category awards">
            <h2 className="text-foreground mb-3 text-lg font-bold tracking-tight">Category awards</h2>
            <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
              {model.categories.map((award, index) => index < step
                ? <AwardCard key={award.category} award={award} names={model.names} viewerId={viewerId} reveal={!done && index === step - 1} note={notes[award.category]} />
                : <HiddenAwardCard key={award.category} category={award.category} />)}
            </ol>
          </section>
          {step >= total ? (
            <FinaleCard
              star={model.monthlyStar}
              names={model.names}
              viewerId={viewerId}
              celebrate={official && step === total}
              confettiId={`ceremony.${model.publication?.ceremonyId ?? model.month}`}
            />
          ) : null}
          {done && commendations ? <section aria-label="Commendations">{commendations}</section> : null}
        </>
      )}

      {official && step > 0 && !done ? (
        <div className="bg-background/95 sticky bottom-20 z-10 flex justify-center gap-2 py-2 backdrop-blur md:bottom-4">
          <Button onClick={next}>{step >= total ? 'Finish' : step === model.categories.length ? 'Reveal the monthly star' : 'Next award'}</Button>
          <Button variant="outline" onClick={finish}><SkipForwardIcon aria-hidden="true" />Skip</Button>
        </div>
      ) : null}
      {official && done && !reduced ? (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => { setStep(0); setAnnounce(''); }}><RotateCcwIcon aria-hidden="true" />Replay the ceremony</Button>
        </div>
      ) : null}
    </div>
  );
}
