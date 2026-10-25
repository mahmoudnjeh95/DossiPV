import { CopyButton } from '../../../components/copy-button';

/** One value the payer must type in their app, large and copyable. */
export function CopyRow({ title, shown, value, copyLabel, hint }: { title: string; shown: string; value: string; copyLabel: string; hint?: string | undefined }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-ui border border-app-border bg-app-bg px-4 py-3">
      <div className="min-w-0">
        <div className="text-[0.8rem] font-semibold text-app-muted">{title}</div>
        <div className="text-[1.25rem] leading-tight font-bold break-all tabular-nums">{shown}</div>
        {hint && <div className="text-[0.8rem] font-normal text-app-muted">{hint}</div>}
      </div>
      <CopyButton value={value} label={copyLabel} />
    </div>
  );
}
