import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/*
 * The controls floating over the Emplacements map and the site-photo editor. They are shared by
 * both screens so the toolbar, hint bar, checklist and footer look and behave the same.
 */

/** The map (or photo) and its controls, with the save footer below so the imagery credit stays visible. */
export function MapWorkspace({
  className,
  placing,
  showTags,
  ...props
}: ComponentProps<'div'> & { placing?: boolean; showTags?: boolean }): React.JSX.Element {
  return (
    <div
      data-placing={placing ? '' : undefined}
      data-show-tags={showTags ? '' : undefined}
      className={cn(
        'flex flex-col overflow-hidden rounded-ui border border-app-border bg-app-surface',
        // Leaflet DOM: crosshair while placing, name tags only where useful (see tailwind.css for the tooltip).
        'data-placing:[&_.leaflet-container]:cursor-crosshair',
        '[&_.pin-tag]:hidden [&_.pin-active_.pin-tag]:inline [&_.pin:hover_.pin-tag]:inline data-show-tags:[&_.pin-tag]:inline',
        className,
      )}
      {...props}
    />
  );
}

export function MapArea({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('relative min-h-0 flex-1 bg-[#27332a]', className)} {...props} />;
}

export function MapToolbar({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      role="toolbar"
      className={cn(
        'pointer-events-none absolute top-2.5 right-2.5 left-14 z-1000 flex gap-1.5 overflow-x-auto [scrollbar-width:none] *:pointer-events-auto *:flex-none [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  );
}

export function MapTool({ className, ...props }: ComponentProps<'button'>): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'group inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-ui border border-app-border bg-app-surface px-3 py-1.5 font-[650] whitespace-nowrap text-app-text shadow-[0_1px_4px_rgba(15,23,42,0.3)] transition-colors hover:border-[#bdc9d5] hover:bg-[#eef2fa] disabled:opacity-50 aria-pressed:border-app-primary aria-pressed:bg-app-primary aria-pressed:text-white',
        className,
      )}
      {...props}
    />
  );
}

/** The "placed" tick inside a tool button. */
export function MapDone(): React.JSX.Element {
  return <span className="font-extrabold text-app-ok group-aria-pressed:text-[#7be0b0]">✓</span>;
}

export function MapHint({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      role="status"
      data-map-hint=""
      className={cn(
        'peer absolute top-[62px] left-1/2 z-1000 flex w-max max-w-[calc(100%-20px)] -translate-x-1/2 flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg bg-slate-900/90 px-3.5 py-2.5 text-[0.95rem] text-white shadow-[0_2px_10px_rgba(15,23,42,0.35)] max-[700px]:top-[58px] max-[700px]:px-2.5 max-[700px]:py-2 max-[700px]:text-[0.88rem] [&>span]:flex-[1_1_260px]',
        className,
      )}
      {...props}
    />
  );
}

/** A button of the hint bar: white when it is the main action, outlined when secondary. */
export function MapHintButton({ secondary, className, ...props }: ComponentProps<typeof Button> & { secondary?: boolean }): React.JSX.Element {
  return (
    <Button
      type="button"
      size="sm"
      variant={secondary ? 'ghost' : 'default'}
      className={cn(
        secondary
          ? 'border-white/45 hover:bg-white/12'
          : 'border-white bg-white text-app-text shadow-none hover:border-white hover:bg-white',
        className,
      )}
      {...props}
    />
  );
}

export function MapNotices({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div className={cn('absolute bottom-7 left-2.5 z-1000 grid max-w-[min(460px,calc(100%-20px))] gap-1.5', className)} {...props} />;
}

export function MapNotice({ tone, className, ...props }: ComponentProps<'p'> & { tone: 'info' | 'danger' }): React.JSX.Element {
  return (
    <p
      role="alert"
      className={cn(
        'm-0 rounded-lg px-3 py-2 text-[0.9rem] shadow-[0_1px_6px_rgba(15,23,42,0.3)]',
        tone === 'danger' ? 'bg-app-danger-bg text-app-danger' : 'bg-app-warn-bg text-app-warn',
        className,
      )}
      {...props}
    />
  );
}

export function MapChecklist({ className, ...props }: ComponentProps<'details'>): React.JSX.Element {
  return (
    <details
      className={cn(
        'absolute right-2.5 bottom-7 z-1000 w-[270px] rounded-lg bg-app-surface text-[0.92rem] shadow-[0_2px_10px_rgba(15,23,42,0.3)] max-[700px]:top-[58px] max-[700px]:bottom-auto max-[700px]:w-auto max-[700px]:max-w-[calc(100%-20px)] peer-data-map-hint:max-[700px]:hidden',
        '[&_summary]:cursor-pointer [&_summary]:px-3 [&_summary]:py-[9px] [&_summary]:font-bold [&_ul]:m-0 [&_ul]:list-none [&_ul]:px-1.5 [&_ul]:pt-0 [&_ul]:pb-1.5',
        className,
      )}
      {...props}
    />
  );
}

export function MapCheck({ className, ...props }: ComponentProps<'button'>): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-9 w-full cursor-pointer items-center justify-start gap-2 rounded-ui border-0 bg-transparent px-1.5 py-1 text-left font-medium text-app-text hover:bg-[#eef2fa]',
        className,
      )}
      {...props}
    />
  );
}

export function MapCheckLabel({ className, ...props }: ComponentProps<'span'>): React.JSX.Element {
  return <span className={cn('flex-1 [&_small]:text-app-muted', className)} {...props} />;
}

export function MapCheckState({ done, className, ...props }: ComponentProps<'span'> & { done?: unknown }): React.JSX.Element {
  return <span className={cn('text-[0.85rem] text-app-muted', Boolean(done) && 'font-bold text-app-ok', className)} {...props} />;
}

export function MapCheckLengths({ className, ...props }: ComponentProps<'p'>): React.JSX.Element {
  return <p className={cn('m-0 border-t border-app-border px-3 pt-1.5 pb-2.5 text-app-muted', className)} {...props} />;
}

export function MapFooter({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-app-border bg-app-surface px-2.5 py-2 max-[700px]:gap-x-2 max-[700px]:gap-y-1.5 max-[700px]:[&>button]:w-full',
        className,
      )}
      {...props}
    />
  );
}

export function Segmented({ className, ...props }: ComponentProps<'div'>): React.JSX.Element {
  return <div role="group" className={cn('inline-flex overflow-hidden rounded-ui border border-app-border', className)} {...props} />;
}

export function SegmentedButton({ className, ...props }: ComponentProps<'button'>): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'min-h-10 cursor-pointer border-0 border-l border-app-border bg-app-surface px-3.5 py-1.5 font-semibold text-app-text first:border-l-0 aria-pressed:bg-app-primary aria-pressed:text-white',
        className,
      )}
      {...props}
    />
  );
}

export function FloorField({ className, children, ...props }: ComponentProps<'label'>): React.JSX.Element {
  return (
    <label className={cn('m-0 inline-flex flex-row items-center gap-2 text-[0.92rem] font-normal whitespace-nowrap', className)} {...props}>
      {children}
    </label>
  );
}

export function FloorSelect({ className, ...props }: ComponentProps<typeof Select>): React.JSX.Element {
  return <Select className={cn('min-h-10 w-auto', className)} {...props} />;
}

export function MapFooterSpacer(): React.JSX.Element {
  return <span className="flex-1" />;
}

export function MapMissing({ className, ...props }: ComponentProps<'span'>): React.JSX.Element {
  return <span className={cn('text-[0.88rem] text-app-muted max-[700px]:order-3 max-[700px]:w-full', className)} {...props} />;
}

export function MapError({ className, ...props }: ComponentProps<'span'>): React.JSX.Element {
  return <span role="alert" className={cn('text-[0.9rem] text-app-danger', className)} {...props} />;
}
