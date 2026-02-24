declare const chrome: any;

interface SessionInitPayload {
  gatewayUrl: string;
  sessionId: string;
  authToken?: string;
}

interface TabBridgeState {
  tabId: number;
  socket: WebSocket;
  payload: SessionInitPayload;
  queuedMessages: string[];
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  manuallyClosed: boolean;
}

const tabSockets = new Map<number, TabBridgeState>();

export function startBackgroundBridge(): void {
  chrome.runtime.onMessage.addListener((message: any, sender: any) => {
    const tabId = sender?.tab?.id;
    if (typeof tabId !== "number") {
      return;
    }

    if (message?.type === "bridge:init") {
      ensureSocket(tabId, message.payload as SessionInitPayload);
      return;
    }

    if (message?.type === "bridge:disconnect") {
      disconnectTab(tabId);
      return;
    }

    if (message?.type === "bridge:toGateway") {
      const bridge = tabSockets.get(tabId);
      if (!bridge) {
        return;
      }
      sendToGateway(bridge, message.payload);
    }
  });

  chrome.tabs.onRemoved.addListener((tabId: number) => {
    disconnectTab(tabId);
  });
}

function ensureSocket(tabId: number, payload: SessionInitPayload): void {
  const existing = tabSockets.get(tabId);
  if (existing) {
    return;
  }
  const state: TabBridgeState = {
    tabId,
    socket: createSocket(payload),
    payload,
    queuedMessages: [],
    reconnectAttempts: 0,
    manuallyClosed: false
  };
  tabSockets.set(tabId, state);
  attachSocket(state, state.socket);
}

function disconnectTab(tabId: number): void {
  const state = tabSockets.get(tabId);
  if (!state) {
    return;
  }
  state.manuallyClosed = true;
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = undefined;
  }
  state.socket.close();
  tabSockets.delete(tabId);
}

function createSocket(payload: SessionInitPayload): WebSocket {
  const gatewayUrl = new URL(payload.gatewayUrl);
  gatewayUrl.searchParams.set("sessionId", payload.sessionId);
  gatewayUrl.searchParams.set("source", "extension");
  return new WebSocket(gatewayUrl.toString(), buildWebSocketProtocols(payload.authToken));
}

function attachSocket(state: TabBridgeState, socket: WebSocket): void {
  socket.addEventListener("open", () => {
    state.reconnectAttempts = 0;
    flushQueuedMessages(state);
  });

  socket.addEventListener("message", (event) => {
    let payloadData: unknown;
    try {
      payloadData = JSON.parse(String(event.data));
    } catch {
      return;
    }
    chrome.tabs.sendMessage(state.tabId, {
      type: "bridge:fromGateway",
      payload: payloadData
    });
  });

  socket.addEventListener("close", () => {
    if (!state.manuallyClosed) {
      scheduleReconnect(state);
      return;
    }
    tabSockets.delete(state.tabId);
  });

  socket.addEventListener("error", () => {
    chrome.tabs.sendMessage(state.tabId, {
      type: "bridge:error",
      payload: { message: "Gateway socket error" }
    });
  });
}

function sendToGateway(state: TabBridgeState, payload: unknown): void {
  const encoded = JSON.stringify(payload);
  if (state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(encoded);
    return;
  }
  state.queuedMessages.push(encoded);
}

function flushQueuedMessages(state: TabBridgeState): void {
  while (state.queuedMessages.length > 0 && state.socket.readyState === WebSocket.OPEN) {
    const payload = state.queuedMessages.shift();
    if (!payload) {
      continue;
    }
    state.socket.send(payload);
  }
}

function scheduleReconnect(state: TabBridgeState): void {
  if (state.reconnectAttempts >= 3) {
    tabSockets.delete(state.tabId);
    chrome.tabs.sendMessage(state.tabId, {
      type: "bridge:error",
      payload: { message: "Gateway reconnect attempts exhausted" }
    });
    return;
  }
  const waitMs = 500 * (state.reconnectAttempts + 1);
  state.reconnectAttempts += 1;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = undefined;
    state.socket = createSocket(state.payload);
    attachSocket(state, state.socket);
  }, waitMs);
}

function buildWebSocketProtocols(authToken?: string): string[] {
  const protocols = ["web-native-mcp.v1"];
  if (authToken) {
    protocols.push(`auth.${encodeBase64Url(authToken)}`);
  }
  return protocols;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const item of bytes) {
    binary += String.fromCharCode(item);
  }
  const encoded = btoa(binary);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
