import { onBeforeUnmount, onMounted } from "vue";
import type { JsonValue } from "@web-native-mcp/protocol";
import { createWebMcpBridge, type Dispose } from "@web-native-mcp/web-bridge-sdk";

interface LegacyUserService {
  getById: (id: string) => Promise<{ id: string; name: string } | null>;
  rename: (input: { id: string; name: string }) => Promise<{ ok: true }>;
}

interface LegacyTodoService {
  list: () => Promise<Array<{ id: string; title: string }>>;
}

export interface LegacyServices {
  user: LegacyUserService;
  todo: LegacyTodoService;
}

const bridge = createWebMcpBridge({
  sessionId: "vue-legacy-demo",
  gatewayUrl: "ws://127.0.0.1:8787"
});

// Vue composable for rapid legacy integration.
export function useVueLegacyMcpBridge(services: LegacyServices): void {
  let disposeMethods: Dispose = () => undefined;
  let started = false;

  onMounted(() => {
    if (!started) {
      bridge.start();
      started = true;
    }

    disposeMethods = bridge.exposeMethods({
      "user.getById": {
        description: "Get user by id from legacy user service.",
        async handler(args: JsonValue) {
          const [id] = Array.isArray(args) ? args : [String(args)];
          return services.user.getById(String(id));
        }
      },
      "user.rename": {
        description: "Rename user in legacy user service.",
        async handler(args: JsonValue) {
          return services.user.rename(args as { id: string; name: string });
        }
      },
      "todo.list": {
        description: "List todos from legacy todo service.",
        async handler() {
          return services.todo.list();
        }
      }
    });
  });

  onBeforeUnmount(() => {
    // Critical cleanup for component unmount to avoid stale method invocations.
    disposeMethods();
  });
}
