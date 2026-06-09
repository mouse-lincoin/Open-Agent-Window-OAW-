import type {
  AgentsResponse,
  CreateWorkspaceRequest,
  FileTreeResponse,
  SessionMessagesResponse,
  Workspace,
  WorkspaceSessionsResponse,
  WorkspacesResponse,
} from '@oaw/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listWorkspaces: () => request<WorkspacesResponse>('/workspaces'),
  createWorkspace: (body: CreateWorkspaceRequest) =>
    request<Workspace>('/workspaces', { method: 'POST', body: JSON.stringify(body) }),
  listSessions: (workspaceId: string) =>
    request<WorkspaceSessionsResponse>(`/workspaces/${workspaceId}/sessions`),
  getMessages: (sessionId: string) =>
    request<SessionMessagesResponse>(`/sessions/${sessionId}/messages`),
  listAgents: () => request<AgentsResponse>('/agents'),
  getFileTree: (workspaceId: string) =>
    request<FileTreeResponse>(`/workspaces/${workspaceId}/files`),
};
