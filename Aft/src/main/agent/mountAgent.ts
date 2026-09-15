import type { BrowserController } from '../browser/BrowserController'
import type { Indexer } from '../data'
import type { DescriptorStore } from '../identity'
import type { ContextStore, ScenarioStore } from '../scenario'
import { ToolDispatcher } from './ToolDispatcher'
import { ToolSocket } from './ToolSocket'
import { browserTools } from './tools/browserTools'
import { identityTools } from './tools/identityTools'
import { runTools } from './tools/runTools'
import { scenarioTools } from './tools/scenarioTools'
import type { AgentEndpoint, ApprovalGate } from './types'

export interface AgentMountOptions {
  endpoint: AgentEndpoint
  controller: BrowserController
  scenarios: ScenarioStore
  indexer: Indexer
  contexts: ContextStore
  descriptors: DescriptorStore
  approve: ApprovalGate
  onStateChange?: (connected: boolean) => void
}

export interface AgentBridge {
  socket: ToolSocket
  dispatcher: ToolDispatcher
  capabilities: string[]
}

let bridge: AgentBridge | null = null

export async function mountAgent(options: AgentMountOptions): Promise<AgentBridge> {
  if (bridge) return bridge

  const dispatcher = new ToolDispatcher({
    approve: options.approve,
    handlers: {
      ...scenarioTools(options.scenarios),
      ...runTools(options.indexer, options.contexts),
      ...identityTools(options.descriptors),
      ...browserTools(options.controller)
    }
  })

  const socket = new ToolSocket({
    endpoint: options.endpoint,
    onStateChange: options.onStateChange,
    onInvocation: (invocation) => {
      void dispatcher.handle(invocation).then((result) => socket.send(result))
    }
  })

  await socket.start()
  await publishCapabilities(options.endpoint, dispatcher.supported())

  bridge = { socket, dispatcher, capabilities: dispatcher.supported() }
  return bridge
}

export function unmountAgent(): void {
  bridge?.socket.stop()
  bridge = null
}

export function agentBridge(): AgentBridge | null {
  return bridge
}

async function publishCapabilities(endpoint: AgentEndpoint, tools: string[]): Promise<void> {
  const body = {
    capabilities: tools.map((toolName) => ({ toolName, schemaVersion: 1, enabled: true }))
  }
  await fetch(endpoint.baseUrl + '/api/v1/devices/' + endpoint.deviceId + '/capabilities', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + endpoint.accessToken
    },
    body: JSON.stringify(body)
  })
}
