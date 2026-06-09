import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
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

export interface StdioAcpSpawnConfig {
  /** agent-registry id */
  id: string;
  /** 子进程日志前缀 */
  logPrefix: string;
  /** initialized 回退名称 */
  displayName: string;
  command: string;
  args: string[];
  /** 进程 env 追加项（不含 PATH） */
  extraEnv?: Record<string, string>;
}

export interface StdioAcpAdapterOptions {
  workspaceRoot?: string;
  oawSessionId?: string;
  spawn?: StdioAcpSpawnConfig;
}

type MessageHandler = (message: Envelope) => void;

interface PendingPermission {
  resolve: (decision: PermissionDecision) => void;
  options: Parameters<typeof pickPermissionOption>[0];
}

interface PendingDiff {
  resolve: (decision: DiffDecision) => void;
}

export class StdioAcpAdapter implements AgentAdapter {
  readonly name: string;

  private handler: MessageHandler | null = null;
  private process: ChildProcess | null = null;
  private connection: ClientSideConnection | null = null;
  private initResult: InitializeResponse | null = null;
  private acpSessionId: string | null = null;
  private workspaceRoot = process.cwd();
  private oawSessionId: string | undefined;
  private readonly spawnConfig: StdioAcpSpawnConfig;
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly pendingDiffs = new Map<string, PendingDiff>();

  constructor(spawnConfig: StdioAcpSpawnConfig, options: StdioAcpAdapterOptions = {}) {
    this.spawnConfig = spawnConfig;
    this.name = spawnConfig.id;
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.oawSessionId = options.oawSessionId;
  }

  configure(options: StdioAcpAdapterOptions): void {
    if (options.workspaceRoot) this.workspaceRoot = options.workspaceRoot;
    if (options.oawSessionId) this.oawSessionId = options.oawSessionId;
  }

  async start(): Promise<void> {
    if (this.process) return;

    const { command, args } = this.spawnConfig;
    const spawnOpts: SpawnOptions = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildAgentEnv(this.spawnConfig.extraEnv),
    };

    this.process = spawn(command, args, spawnOpts);

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.trim()) {
        console.error(`[${this.spawnConfig.logPrefix}] ${text.trimEnd()}`);
      }
    });

    this.process.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        this.emitError('AGENT_CRASHED', `${this.spawnConfig.logPrefix} exited with code ${code}`);
      } else if (signal) {
        this.emitError('AGENT_CRASHED', `${this.spawnConfig.logPrefix} killed by signal ${signal}`);
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
      throw new Error(`${this.spawnConfig.displayName} agent is not started`);
    }

    switch (message.type) {
      case 'initialize':
        await this.handleInitialize();
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

  private async handleInitialize(): Promise<void> {
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
        agentName: initResult.agentInfo?.name ?? this.spawnConfig.displayName,
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
      this.emitError('INTERNAL', `${this.spawnConfig.displayName} prompt ended with error`);
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

export function isStdioAcpAgent(agent: AgentAdapter): agent is StdioAcpAdapter {
  return agent instanceof StdioAcpAdapter;
}

/** @deprecated 使用 isStdioAcpAgent */
export function isSelfManagedAgent(agent: AgentAdapter): boolean {
  return isStdioAcpAgent(agent);
}

export function configureStdioAcpAgent(
  agent: AgentAdapter,
  options: { workspaceRoot: string; oawSessionId: string },
): void {
  if (isStdioAcpAgent(agent)) {
    agent.configure(options);
  }
}

function resolvePackageEntry(packageName: string, relativeEntry: string): string {
  const pkgJson = require.resolve(`${packageName}/package.json`);
  return join(dirname(pkgJson), relativeEntry);
}

function nodeScriptEntry(packageName: string, relativeEntry: string): { command: string; args: string[] } {
  return {
    command: process.execPath,
    args: [resolvePackageEntry(packageName, relativeEntry)],
  };
}

export function resolveSpawnConfig(agentId: string): StdioAcpSpawnConfig | null {
  switch (agentId) {
    case 'claude-code': {
      const script = process.env.CLAUDE_AGENT_ACP_PATH
        ? { command: process.execPath, args: [process.env.CLAUDE_AGENT_ACP_PATH] }
        : nodeScriptEntry('@agentclientprotocol/claude-agent-acp', 'dist/index.js');
      return {
        id: 'claude-code',
        logPrefix: 'claude-code',
        displayName: 'Claude Code',
        ...script,
      };
    }
    case 'codex': {
      const script = process.env.CODEX_ACP_PATH
        ? { command: process.execPath, args: [process.env.CODEX_ACP_PATH] }
        : nodeScriptEntry('@agentclientprotocol/codex-acp', 'dist/index.js');
      return {
        id: 'codex',
        logPrefix: 'codex',
        displayName: 'Codex',
        ...script,
      };
    }
    case 'gemini-cli': {
      const geminiScript = process.env.GEMINI_CLI_PATH ?? resolvePackageEntry('@google/gemini-cli', 'bundle/gemini.js');
      return {
        id: 'gemini-cli',
        logPrefix: 'gemini-cli',
        displayName: 'Gemini CLI',
        command: process.execPath,
        args: [geminiScript, '--experimental-acp'],
      };
    }
    case 'cursor-cli': {
      const script = process.env.CURSOR_AGENT_ACP_PATH
        ? { command: process.execPath, args: [process.env.CURSOR_AGENT_ACP_PATH] }
        : nodeScriptEntry('cursor-agent-acp', 'dist/index.js');
      return {
        id: 'cursor-cli',
        logPrefix: 'cursor-cli',
        displayName: 'Cursor CLI',
        ...script,
      };
    }
    default:
      return null;
  }
}

function buildAgentEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
  const nodeBinDir = dirname(process.execPath);
  const pathValue = process.env.PATH ?? '';
  const pathWithNode = pathValue.includes(nodeBinDir) ? pathValue : `${nodeBinDir}:${pathValue}`;

  return {
    ...process.env,
    ...extra,
    PATH: pathWithNode,
  };
}
