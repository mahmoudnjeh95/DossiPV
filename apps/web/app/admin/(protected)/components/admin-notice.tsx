'use client';

import { useSearchParams } from 'next/navigation';
import { adminNoticeMessage } from '../../../../lib/admin-notice';

/** Success banner after an admin action: reads `?ok=<key>` (see lib/admin-notice). */
export function AdminNotice(): React.JSX.Element | null {
  const message = adminNoticeMessage(useSearchParams().get('ok'));
  return message ? (
    <p role="status" className="mb-4 mt-0 border-l-[3px] border-app-ok bg-app-ok-bg px-[13px] py-[11px] text-[0.9rem] text-app-ok">
      {message}
    </p>
  ) : null;
}
