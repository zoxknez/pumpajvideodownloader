import { getLogger } from './logger.js';

const auditLogger = getLogger('audit');

export type AuditPayload = Record<string, unknown> & {
  userId?: string;
  jobId?: string;
};

export function audit(event: string, payload: AuditPayload = {}): void {
  try {
    const body = JSON.stringify({ event, ...payload });
    auditLogger.info(event, body);
  } catch (err) {
    try {
      auditLogger.warn('audit_write_failed', String(err));
    } catch {}
  }
}
