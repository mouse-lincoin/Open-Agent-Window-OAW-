import { describe, expect, it } from 'vitest';
import { checkPermission, hasSessionGrant, isAllowDecision } from './index.js';
import type { PermissionGrant } from '@oaw/shared-types';

const baseGrant = (overrides: Partial<PermissionGrant>): PermissionGrant => ({
  id: 'g1',
  sessionId: 's1',
  scope: 'file_write',
  decision: 'allow_session',
  createdAt: Date.now(),
  ...overrides,
});

describe('permission-engine', () => {
  it('allows when session grant exists', () => {
    const grants = [baseGrant({ decision: 'allow_session' })];
    expect(hasSessionGrant(grants, 'file_write')).toBe(true);
    expect(checkPermission(grants, 'file_write')).toEqual({
      allowed: true,
      reason: 'session_grant',
    });
  });

  it('requires request without session grant', () => {
    const grants = [baseGrant({ decision: 'reject' })];
    expect(checkPermission(grants, 'file_write')).toEqual({
      allowed: false,
      reason: 'needs_request',
    });
  });

  it('recognizes allow decisions', () => {
    expect(isAllowDecision('allow_once')).toBe(true);
    expect(isAllowDecision('reject')).toBe(false);
  });
});
