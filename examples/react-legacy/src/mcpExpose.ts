import { createReactAdapter } from "@web-native-mcp/adapters";
import type { JsonValue } from "@web-native-mcp/protocol";
import { createWebMcpBridge } from "@web-native-mcp/web-bridge-sdk";

interface LegacyStore {
  getUserById: (id: string) => Promise<{ id: string; name: string } | null>;
  updateUserName: (input: { id: string; name: string }) => Promise<{ ok: true }>;
  listTodos: () => Promise<Array<{ id: string; title: string }>>;
}

declare global {
  interface Window {
    legacyStore: LegacyStore;
  }
}

const bridge = createWebMcpBridge({
  sessionId: "react-legacy-demo",
  gatewayUrl: "ws://127.0.0.1:8787"
});

const disposeUserMethods = bridge.exposeMethods(
  createReactAdapter({
    namespace: "user",
    getTarget: () => window.legacyStore,
    methods: {
      getById: (store: LegacyStore, args: JsonValue) => {
        const [id] = Array.isArray(args) ? args : [String(args)];
        return store.getUserById(String(id));
      },
      rename: (store: LegacyStore, args: JsonValue) => {
        const payload = args as { id: string; name: string };
        return store.updateUserName(payload);
      }
    },
    descriptions: {
      getById: "Get user by id from legacy store.",
      rename: "Update username in legacy store."
    }
  })
);

const disposeTodoMethods = bridge.exposeMethods({
  "todo.list": {
    description: "List todos from legacy service.",
    async handler() {
      return window.legacyStore.listTodos();
    }
  }
});

bridge.start();

export function teardownMcpExpose(): void {
  disposeUserMethods();
  disposeTodoMethods();
}
