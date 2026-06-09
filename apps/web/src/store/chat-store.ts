import { create } from 'zustand';
import type {
  Diff,
  DiffPayload,
  MessageWithToolCalls,
  PermissionRequestPayload,
  ToolCall,
} from '@oaw/shared-types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  toolCalls?: ToolCall[];
}

export interface TimelineEntry {
  id: string;
  tool: ToolCall['tool'];
  status: ToolCall['status'];
  input: Record<string, unknown>;
  result?: string;
  createdAt: number;
}

interface ChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  streamingText: string;
  toolTimeline: TimelineEntry[];
  pendingPermission: PermissionRequestPayload | null;
  pendingDiff: DiffPayload | null;
  setSessionId: (id: string | null) => void;
  addUserMessage: (content: string) => void;
  appendStream: (delta: string) => void;
  finalizeStream: () => void;
  upsertToolCall: (toolCall: {
    toolCallId: string;
    tool: ToolCall['tool'];
    input: Record<string, unknown>;
    status: ToolCall['status'];
    result?: string;
  }) => void;
  loadHistory: (messages: MessageWithToolCalls[], diffs?: Diff[]) => void;
  setPendingPermission: (req: PermissionRequestPayload | null) => void;
  setPendingDiff: (diff: DiffPayload | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: null,
  messages: [],
  streamingText: '',
  toolTimeline: [],
  pendingPermission: null,
  pendingDiff: null,
  setSessionId: (id) => set({ sessionId: id }),
  addUserMessage: (content) =>
    set((s) => ({
      messages: [...s.messages, { id: crypto.randomUUID(), role: 'user', content }],
    })),
  appendStream: (delta) => set((s) => ({ streamingText: s.streamingText + delta })),
  finalizeStream: () => {
    const { streamingText, messages } = get();
    if (!streamingText) return;
    set({
      messages: [...messages, { id: crypto.randomUUID(), role: 'agent', content: streamingText }],
      streamingText: '',
    });
  },
  upsertToolCall: (toolCall) =>
    set((s) => {
      const entry: TimelineEntry = {
        id: toolCall.toolCallId,
        tool: toolCall.tool,
        status: toolCall.status,
        input: toolCall.input,
        result: toolCall.result,
        createdAt: Date.now(),
      };
      const idx = s.toolTimeline.findIndex((t) => t.id === entry.id);
      const toolTimeline =
        idx >= 0
          ? s.toolTimeline.map((t, i) => (i === idx ? { ...t, ...entry } : t))
          : [...s.toolTimeline, entry];
      return { toolTimeline };
    }),
  loadHistory: (messages, diffs = []) => {
    const chatMessages: ChatMessage[] = messages.map((m) => ({
      id: m.id,
      role: m.role === 'user' ? 'user' : 'agent',
      content: m.content,
      toolCalls: m.toolCalls,
    }));
    const toolTimeline: TimelineEntry[] = messages.flatMap((m) =>
      (m.toolCalls ?? []).map((tc) => ({
        id: tc.id,
        tool: tc.tool,
        status: tc.status,
        input: tc.input,
        result: tc.result,
        createdAt: tc.createdAt,
      })),
    );
    const pendingDiffRecord = [...diffs].reverse().find((d) => d.decision === 'pending');
    const pendingDiff: DiffPayload | null = pendingDiffRecord
      ? {
          diffId: pendingDiffRecord.id,
          path: pendingDiffRecord.path,
          before: pendingDiffRecord.beforeText,
          after: pendingDiffRecord.afterText,
          toolCallId: pendingDiffRecord.toolCallId,
        }
      : null;
    set({
      messages: chatMessages.filter((m) => m.role === 'user' || m.role === 'agent'),
      streamingText: '',
      toolTimeline,
      pendingPermission: null,
      pendingDiff,
    });
  },
  setPendingPermission: (req) => set({ pendingPermission: req }),
  setPendingDiff: (diff) => set({ pendingDiff: diff }),
  reset: () =>
    set({
      sessionId: null,
      messages: [],
      streamingText: '',
      toolTimeline: [],
      pendingPermission: null,
      pendingDiff: null,
    }),
}));
