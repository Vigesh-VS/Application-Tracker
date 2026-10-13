import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * Runs the /api serverless functions inside `npm run dev`, so the AI "Import from URL"
 * works locally exactly like on Vercel — no extra CLI needed.
 */
function localApi(env: Record<string, string>): Plugin {
  return {
    name: "local-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(
        "/api/extract-job-details",
        async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const { handleExtractRequest } = await server.ssrLoadModule("/api/_lib/extract.ts");
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            const headers = new Headers();
            for (const [key, value] of Object.entries(req.headers)) {
              if (typeof value === "string") headers.set(key, value);
            }
            const request = new Request(`http://localhost${req.url ?? ""}`, {
              method: req.method,
              headers,
              body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : Buffer.concat(chunks),
            });
            const response: Response = await handleExtractRequest(request, { ...process.env, ...env });
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.end(Buffer.from(await response.arrayBuffer()));
          } catch (err) {
            console.error(err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: false, error: "Local API error" }));
          }
        }
      );
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL variables from .env (not only VITE_*) for the local API; they are never sent to the browser.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), localApi(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
