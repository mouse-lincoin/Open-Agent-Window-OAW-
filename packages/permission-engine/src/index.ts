import type {
  PermissionDecision,
  PermissionGrant,
  PermissionScope,
} from '@oaw/shared-types';

export interface PermissionCheckResult {
  allowed: boolean;
  reason: 'session_grant' | 'needs_request' | 'rejected';
}

export function hasSessionGrant(
  grants: PermissionGrant[],
  scope: PermissionScope,
): boolean {
  return grants.some((g) => g.scope === scope && g.decision === 'allow_session');
}

export function checkPermission(
  grants: PermissionGrant[],
  scope: PermissionScope,
): PermissionCheckResult {
  if (hasSessionGrant(grants, scope)) {
    return { allowed: true, reason: 'session_grant' };
  }
  return { allowed: false, reason: 'needs_request' };
}

export function isAllowDecision(decision: PermissionDecision): boolean {
  return decision === 'allow_once' || decision === 'allow_session';
}

export function shouldPersistSessionGrant(decision: PermissionDecision): boolean {
  return decision === 'allow_session';
}

export function createPendingRequestId(): string {
  return crypto.randomUUID();
}
