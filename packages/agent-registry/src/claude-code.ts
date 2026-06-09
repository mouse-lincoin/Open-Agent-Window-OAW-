import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Writable, Readable } from 'node:stream';
import { createEnvelope } from '@oaw/acp-client';
import { readWorkspaceFile } from '@oaw/diff-engine';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type InitializeResponse,
} from '@agentclientprotocol/sdk';
import type { AgentAdapter } from '@oaw/shared-types';
import type {
  DiffDecision,
  Envelope,
  PermissionDecision,
  PermissionResponsePayload,
} from '@oaw/shared-types';
import {
  buildOawToolCallPayload,
  buildPermissionRequestFromAcp,
  extractTextDelta,
  pickPermissionOption,
  toRelativeWorkspacePath,
} from './acp-bridge.js';

const require = createRequire(import.meta.url);

export interface ClaudeCodeAdapterOptions {
  workspaceRoot?: string;
  oawSessionId?: string;
  agentBinaryPath?: string;
}

type MessageHandler = (message: Envelope) => void;

interface PendingPermission {
  resolve: (decision: PermissionDecision) => void;
  options: Parameters<typeof pickPermissionOption>[0];
}

interface PendingDiff {
  resolve: (decision: DiffDecision) => void;
}

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly name = 'claude-code';

  private handler: MessageHandler | null = null;
  private process: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private initResult: InitializeResponse | null = null;
  private acpSessionId: string | null = null;
  private workspaceRoot = process.cwd();
  private oawSessionId: string | undefined;
  private readonly agentBinaryPath: string;
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly pendingDiffs = new Map<string, PendingDiff>();

  constructor(options: ClaudeCodeAdapterOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.oawSessionId = options.oawSessionId;
    this.agentBinaryPath = options.agentBinaryPath ?? resolveClaudeAgentAcpBin();
  }

  configure(options: ClaudeCodeAdapterOptions): void {
    if (options.workspaceRoot) this.workspaceRoot = options.workspaceRoot;
    if (options.oawSessionId) this.oawSessionId = options.oawSessionId;
  }

  async start(): Promise<void> {
    if (this.process) return;

    const env = buildAgentEnv();
    this.process = spawn(process.execPath, [this.agentBinaryPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.trim()) {
        console.error(`[claude-code] ${text.trimEnd()}`);
      }
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        this.emitError('AGENT_CRASHED', `claude-agent-acp exited with code ${code}`);
      } else if (signal) {
        this.emitError('AGENT_CRASHED', `claude-agent-acp killed by signal ${signal}`);
      }
      this.process = null;
      this.connection = null;
    });

    const input = Writable.toWeb(this.process.stdin!);
    const output = Readable.toWeb(this.process.stdout!);
    const stream = ndJsonStream(input, output);
    const client = this.createAcpClient();
    this.connection = new ClientSideConnection(() => client, stream);
  }

  async stop(): Promise<void> {
    this.pendingPermissions.clear();
    this.pendingDiffs.clear();
    this.connection = null;
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.acpSessionId = null;
    this.initResult = null;
  }

  send(message: Envelope): void {
    void this.handleInbound(message);
  }

  onMessage(callback: (message: Envelope) => void): void {
    this.handler = callback;
  }

  private createAcpClient(): Client {
    return {
      sessionUpdate: async (params) => {
        const delta = extractTextDelta(params);
        if (delta) {
          this.emit(
            createEnvelope(
              'session/update',
              { kind: 'text', delta },
              { sessionId: this.oawSessionId },
            ),
          );
        }

        const update = params.update;
        if (update.sessionUpdate === 'tool_call') {
          const payload = buildOawToolCallPayload(update);
          this.emit(
            createEnvelope('tool/call', payload, { sessionId: this.oawSessionId }),
          );
          this.emit(
            createEnvelope(
              'session/update',
              { kind: 'tool_call', toolCall: payload },
              { sessionId: this.oawSessionId },
            ),
          );
        }

        if (update.sessionUpdate === 'tool_call_update') {
          const payload = buildOawToolCallPayload(update);
          this.emit(
            createEnvelope('tool/call', payload, { sessionId: this.oawSessionId }),
          );
        }
      },

      requestPermission: async (params) => {
        const requestId = crypto.randomUUID();
        const oawRequest = buildPermissionRequestFromAcp(params, requestId);

        const decision = await new Promise<PermissionDecision>((resolve) => {
          this.pendingPermissions.set(requestId, {
            resolve,
            options: params.options,
          });
          this.emit(
            createEnvelope('permission/request', oawRequest, { sessionId: this.oawSessionId }),
          );
        });

        const option = pickPermissionOption(params.options, decision);
        if (!option || decision === 'reject') {
          return { outcome: { outcome: 'cancelled' } };
        }

        return {
          outcome: {
            outcome: 'selected',
            optionId: option.optionId,
          },
        };
      },

      readTextFile: async (params) => {
        const relativePath = toRelativeWorkspacePath(this.workspaceRoot, params.path);
        const content = await readWorkspaceFile(this.workspaceRoot, relativePath);
        return { content };
      },

      writeTextFile: async (params) => {
        const relativePath = toRelativeWorkspacePath(this.workspaceRoot, params.path);
        const before = await readWorkspaceFile(this.workspaceRoot, relativePath);
        const diffId = crypto.randomUUID();

        const decision = await new Promise<DiffDecision>((resolve) => {
          this.pendingDiffs.set(diffId, { resolve });
          this.emit(
            createEnvelope(
              'diff',
              {
                diffId,
                path: relativePath,
                before,
                after: params.content,
              },
              { sessionId: this.oawSessionId },
            ),
          );
        });

        if (decision === 'reject') {
          throw new Error('Diff rejected by user');
        }

        return {};
      },
    };
  }

  private async handleInbound(message: Envelope): Promise<void> {
    if (!this.connection) {
      throw new Error('Claude Code agent is not started');
    }

    switch (message.type) {
      case 'initialize':
        await this.handleInitialize(message);
        break;
      case 'session/new':
        await this.handleSessionNew();
        break;
      case 'session/prompt':
        await this.handlePrompt(message);
        break;
      case 'permission/response':
        this.handlePermissionResponse(message.payload as PermissionResponsePayload);
        break;
      case 'diff/decision': {
        const payload = message.payload as { diffId: string; decision: DiffDecision };
        const pending = this.pendingDiffs.get(payload.diffId);
        if (pending) {
          this.pendingDiffs.delete(payload.diffId);
          pending.resolve(payload.decision);
        }
        break;
      }
      case 'session/end':
        await this.stop();
        break;
      default:
        break;
    }
  }

  private async handleInitialize(_message: Envelope): Promise<void> {
    if (!this.connection) return;

    const initResult = await this.connection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
      clientInfo: {
        name: 'open-agent-window',
        version: '0.1.0',
      },
    });
    this.initResult = initResult;

    this.emit(
      createEnvelope('initialized', {
        agentName: initResult.agentInfo?.name ?? 'Claude Code',
        capabilities: {
          streaming: true,
          tools: ['read_file', 'edit_file', 'run_command', 'search'],
          diff: true,
        },
      }),
    );
  }

  private async handleSessionNew(): Promise<void> {
    if (!this.connection) return;

    const session = await this.connection.newSession({
      cwd: this.workspaceRoot,
      mcpServers: [],
    });
    this.acpSessionId = session.sessionId;
  }

  private async handlePrompt(message: Envelope): Promise<void> {
    if (!this.connection || !this.acpSessionId) return;

    const payload = message.payload as { text: string };
    const result = await this.connection.prompt({
      sessionId: this.acpSessionId,
      prompt: [{ type: 'text', text: payload.text }],
    });

    this.emit(
      createEnvelope(
        'session/update',
        { kind: 'done', messageId: crypto.randomUUID() },
        { sessionId: this.oawSessionId },
      ),
    );

    if (result.stopReason === 'error') {
      this.emitError('INTERNAL', 'Claude Code prompt ended with error');
    }
  }

  private handlePermissionResponse(payload: PermissionResponsePayload): void {
    const pending = this.pendingPermissions.get(payload.requestId);
    if (!pending) return;
    this.pendingPermissions.delete(payload.requestId);
    pending.resolve(payload.decision);
  }

  private emit<T>(envelope: Envelope<T>): void {
    this.handler?.(envelope);
  }

  private emitError(
    code: 'AGENT_CRASHED' | 'AGENT_SPAWN_FAILED' | 'INTERNAL',
    message: string,
  ): void {
    this.emit(createEnvelope('error', { code, message }, { sessionId: this.oawSessionId }));
  }
}

export function resolveClaudeAgentAcpBin(): string {
  if (process.env.CLAUDE_AGENT_ACP_PATH) {
    return process.env.CLAUDE_AGENT_ACP_PATH;
  }
  const pkgJson = require.resolve('@agentclientprotocol/claude-agent-acp/package.json');
  return join(dirname(pkgJson), 'dist/index.js');
}

export function isSelfManagedAgent(agent: AgentAdapter): boolean {
  return agent.name === 'claude-code';
}

function buildAgentEnv(): NodeJS.ProcessEnv {
  const nodeBinDir = dirname(process.execPath);
  const pathValue = process.env.PATH ?? '';
  const pathWithNode = pathValue.includes(nodeBinDir) ? pathValue : `${nodeBinDir}:${pathValue}`;

  return {
    ...process.env,
    PATH: pathWithNode,
  };
}
