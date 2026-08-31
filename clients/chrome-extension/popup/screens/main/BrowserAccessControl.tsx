import { useCallback, useEffect, useState } from 'react';

import { useAppContext } from '../../AppContext.js';
import { sendMessage } from '../../lib/chrome-message.js';

interface BrowserAccessStatus {
  ok: boolean;
  available?: boolean;
  conversationId?: string;
  enabled?: boolean;
  selectedThisInstallation?: boolean;
  reason?: string;
  error?: string;
}

export function BrowserAccessControl() {
  const { health } = useAppContext();
  const [status, setStatus] = useState<BrowserAccessStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const response = await sendMessage<BrowserAccessStatus>({
      type: 'browser-access-current-get',
    });
    setStatus(
      response ?? { ok: false, error: 'Could not read browser access.' },
    );
  }, []);

  useEffect(() => {
    if (health !== 'connected') {
      setStatus(null);
      return;
    }
    void refresh();
  }, [health, refresh]);

  const update = useCallback(async () => {
    if (!status?.available) return;
    setSaving(true);
    const response = await sendMessage<BrowserAccessStatus>({
      type: 'browser-access-current-set',
      enabled: status.selectedThisInstallation !== true,
    });
    setStatus(
      response ?? { ok: false, error: 'Could not update browser access.' },
    );
    setSaving(false);
  }, [status]);

  if (health !== 'connected') return null;

  const selected = status?.selectedThisInstallation === true;
  const summary = !status
    ? 'Checking this tab…'
    : !status.ok
      ? (status.error ?? 'Browser control is unavailable.')
      : !status.available
        ? (status.reason ?? 'Open a Worklin conversation to enable it.')
        : selected
          ? 'Enabled for this conversation on this browser.'
          : status.enabled
            ? 'Enabled on another browser installation.'
            : 'Allow this assistant to use a controlled tab for this conversation.';

  return (
    <div className="mb-2.5 rounded-xl border border-edge bg-surface px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-medium text-fg">Browser use</p>
          <p className="mt-1 text-[11px] leading-4 text-fg-muted">{summary}</p>
        </div>
        {status?.ok && status.available && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void update()}
            className="shrink-0 cursor-pointer rounded-lg border border-edge bg-surface-alt px-2.5 py-1.5 text-[11px] font-medium text-fg transition-colors hover:border-edge-hover hover:bg-surface disabled:cursor-wait disabled:opacity-60"
          >
            {saving
              ? 'Saving…'
              : selected
                ? 'Disable'
                : status.enabled
                  ? 'Use this browser'
                  : 'Enable'}
          </button>
        )}
      </div>
    </div>
  );
}
