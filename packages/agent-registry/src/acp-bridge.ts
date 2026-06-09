import type {
  PermissionDecision,
  PermissionScope,
  ToolCallStatus,
  ToolName,
} from '@oaw/shared-types';
import type {
  PermissionOption,
  PermissionOptionKind,
  RequestPermissionRequest,
  SessionNotification,
  ToolCall,
  ToolCallUpdate,
  ToolKind,
} from '@agentclientprotocol/sdk';

export function mapToolKindToOawTool(kind: ToolKind | undefined | null): ToolName {
  switch (kind) {
    case 'read':
      return 'read_file';
    case 'edit':
    case 'delete':
    case 'move':
      return 'edit_file';
    case 'search':
      return 'search';
    case 'execute':
      return 'run_command';
    default:
      return 'edit_file';
  }
}

export function mapToolKindToPermissionScope(kind: ToolKind | undefined | null): PermissionScope {
  switch (kind) {
    case 'execute':
      return 'terminal_execute';
    case 'read':
      return 'file_write';
    default:
      return 'file_write';
  }
}

export function mapAcpStatusToOaw(status: ToolCallUpdate['status']): ToolCallStatus {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'running';
    case 'pending':
    default:
      return 'pending';
  }
}

export function buildOawToolCallPayload(
  toolCall: ToolCall | ToolCallUpdate,
): {
  toolCallId: string;
  tool: ToolName;
  input: Record<string, unknown>;
  status: ToolCallStatus;
} {
  const kind = 'kind' in toolCall ? toolCall.kind : undefined;
  return {
    toolCallId: toolCall.toolCallId,
    tool: mapToolKindToOawTool(kind),
    input: {
      title: toolCall.title,
      rawInput: toolCall.rawInput ?? null,
    },
    status: mapAcpStatusToOaw(toolCall.status),
  };
}

export function buildPermissionRequestFromAcp(
  params: RequestPermissionRequest,
  requestId: string,
): {
  requestId: string;
  scope: PermissionScope;
  detail: string;
  toolCallId?: string;
} {
  return {
    requestId,
    scope: mapToolKindToPermissionScope(params.toolCall.kind),
    detail: params.toolCall.title ?? 'Permission required',
    toolCallId: params.toolCall.toolCallId,
  };
}

export function pickPermissionOption(
  options: PermissionOption[],
  decision: PermissionDecision,
): PermissionOption | null {
  const kindMap: Record<PermissionDecision, PermissionOptionKind> = {
    allow_once: 'allow_once',
    allow_session: 'allow_always',
    reject: 'reject_once',
  };
  const targetKind = kindMap[decision];
  return (
    options.find((option) => option.kind === targetKind) ??
    (decision === 'reject'
      ? options.find((option) => option.kind === 'reject_always')
      : undefined) ??
    null
  );
}

export { toRelativeWorkspacePath } from '@oaw/diff-engine';

export function extractTextDelta(notification: SessionNotification): string | null {
  const update = notification.update;
  if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
    return update.content.text;
  }
  return null;
}
