import { postEvent } from './api';

/**
 * Funnel + error telemetry. The owner does not talk to users, so this is the only way to learn
 * where they get stuck: one tiny POST per step, fire-and-forget, never throws, never blocks UI.
 */
export type EventName =
  | 'app_open'
  | 'create_started'
  | 'create_picked'
  | 'upload_done'
  | 'transcribe_done'
  | 'create_failed'
  | 'export_started'
  | 'export_done'
  | 'export_failed'
  | 'share_tapped'
  | 'photos_saved'
  | 'paywall_shown'
  | 'session_reopened'
  | 'app_error';

export function track(name: EventName, props: Record<string, string | number | boolean> = {}) {
  postEvent(name, props).catch(() => {});
}

/** JS errors that would otherwise only show in a red box on the user's phone */
export function installErrorReporting() {
  const utils = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: Error, fatal?: boolean) => void; setGlobalHandler(h: (e: Error, fatal?: boolean) => void): void } }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    try {
      track('app_error', {
        message: String(error?.message ?? error).slice(0, 300),
        stack: String(error?.stack ?? '').slice(0, 400),
        fatal: Boolean(isFatal),
      });
    } catch {}
    previous?.(error, isFatal);
  });
}
