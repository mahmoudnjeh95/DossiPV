'use client';

import { useSearchParams } from 'next/navigation';
import { adminNoticeMessage } from '../../../../lib/admin-notice';

/** Success banner after an admin action: reads `?ok=<key>` (see lib/admin-notice). */
export function AdminNotice(): React.JSX.Element | null {
  const message = adminNoticeMessage(useSearchParams().get('ok'));
  return message ? (
    <p role="status" className="admin-notice">
      {message}
    </p>
  ) : null;
}
