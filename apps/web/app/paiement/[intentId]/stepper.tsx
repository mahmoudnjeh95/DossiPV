import { cn } from '@/lib/utils';

const STEPS = ['Envoyer', 'Déclarer', 'Validation'];

/** The three stages of a transfer; `current` is the 1-based step the payer is on, 4 when everything is done. */
export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }): React.JSX.Element {
  return (
    <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label="Étapes du paiement">
      {STEPS.map((name, index) => {
        const n = index + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={name} className="flex flex-1 items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full border text-[0.8rem] font-bold',
                done && 'border-app-ok bg-app-ok text-white',
                active && 'border-app-primary bg-app-primary text-white',
                !done && !active && 'border-app-border bg-app-surface text-app-muted',
              )}
            >
              {done ? '✓' : n}
            </span>
            <span className={cn('text-[0.85rem] font-semibold max-sm:hidden', !done && !active && 'text-app-muted')}>{name}</span>
            {n < STEPS.length && <span aria-hidden="true" className={cn('h-0.5 flex-1 rounded', done ? 'bg-app-ok' : 'bg-app-border')} />}
          </li>
        );
      })}
    </ol>
  );
}
