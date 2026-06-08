# Open Agent Window

Universal ACP Client

## Architecture

Browser
↓
WebSocket

Gateway
↓
ACP

Agent

---

## Tech Stack

Frontend

* Next.js
* React
* TypeScript
* Monaco Editor
* Zustand
* TanStack Query

Backend

* NestJS
* WebSocket
* Redis
* PostgreSQL

Infra

* Docker
* Kubernetes
* Nginx

---

## Project Structure

apps/

web/
gateway/
api/

packages/

acp-client/
agent-registry/
diff-engine/
permission-engine/
shared-types/

---

## ACP Flow

Browser

↓

ACP Client

↓

Gateway

↓

ACP Agent

---

## Session Lifecycle

initialize

↓

session/new

↓

session/prompt

↓

session/update

↓

session/end

---

## Gateway Responsibilities

1. Agent Process Management

spawn()

kill()

restart()

2. ACP Transport

stdio

WebSocket

3. Session Isolation

workspace isolation

4. Permission Management

command approval

---

## Agent Adapter

interface AgentAdapter {

name: string

start(): Promise<void>

stop(): Promise<void>

send(message)

onMessage(callback)

}

---

## Supported Agents

Claude Code

Codex

Gemini CLI

Kiro

OpenHands

Custom ACP Agent

---

## Workspace Model

Workspace

├── Files

├── Sessions

├── Agents

└── Permissions

---

## Permission Levels

Read Only

File Write

Terminal Execute

Git Push

System Access

---

## Diff Flow

Agent

↓

Patch

↓

Diff Engine

↓

Monaco Diff

↓

Accept / Reject

---

## Future Roadmap

v1

Single Agent

v2

Multi Agent

v3

Agent Marketplace

v4

Cloud Workspace

v5

Enterprise Edition
