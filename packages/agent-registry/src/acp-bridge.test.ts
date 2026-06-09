import { describe, expect, it } from 'vitest';
import {
  buildPermissionRequestFromAcp,
  mapToolKindToOawTool,
  pickPermissionOption,
  toRelativeWorkspacePath,
} from './acp-bridge.js';

describe('acp-bridge', () => {
  it('maps tool kinds to OAW tool names', () => {
    expect(mapToolKindToOawTool('read')).toBe('read_file');
    expect(mapToolKindToOawTool('execute')).toBe('run_command');
  });

  it('builds permission request payload', () => {
    const payload = buildPermissionRequestFromAcp(
      {
        sessionId: 's1',
        options: [],
        toolCall: {
          toolCallId: 'tc1',
          title: 'Edit README.md',
          kind: 'edit',
        },
      },
      'req-1',
    );
    expect(payload.requestId).toBe('req-1');
    expect(payload.scope).toBe('file_write');
    expect(payload.toolCallId).toBe('tc1');
  });

  it('picks permission option by OAW decision', () => {
    const options = [
      { optionId: 'once', name: 'Allow once', kind: 'allow_once' as const },
      { optionId: 'always', name: 'Allow always', kind: 'allow_always' as const },
      { optionId: 'reject', name: 'Reject', kind: 'reject_once' as const },
    ];
    expect(pickPermissionOption(options, 'allow_session')?.optionId).toBe('always');
    expect(pickPermissionOption(options, 'reject')?.optionId).toBe('reject');
  });

  it('converts absolute path to workspace-relative path', () => {
    expect(toRelativeWorkspacePath('/workspace', '/workspace/src/app.ts')).toBe('src/app.ts');
  });
});
