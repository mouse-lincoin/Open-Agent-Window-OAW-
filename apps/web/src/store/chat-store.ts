import { create } from 'zustand';
import type { DiffPayload, PermissionRequestPayload } from '@oaw/shared-types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
}

interface ChatState {
  sessionId: string | null;
  messages: ChatMessage[];
  streamingText: string;
  pendingPermission: PermissionRequestPayload | null;
  pendingDiff: DiffPayload | null;
  setSessionId: (id: string | null) => void;
  addUserMessage: (content: string) => void;
  appendStream: (delta: string) => void;
  finalizeStream: () => void;
  setPendingPermission: (req: PermissionRequestPayload | null) => void;
  setPendingDiff: (diff: DiffPayload | null) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessionId: null,
  messages: [],
  streamingText: '',
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
  setPendingPermission: (req) => set({ pendingPermission: req }),
  setPendingDiff: (diff) => set({ pendingDiff: diff }),
  reset: () =>
    set({
      sessionId: null,
      messages: [],
      streamingText: '',
      pendingPermission: null,
      pendingDiff: null,
    }),
}));
