import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
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
            res.end(JSON.stringify({ success: false, error: `Local API error: ${err instanceof Error ? err.message : String(err)}` }));
          }
        }
      );
    },
  };
}

/** The security headers from vercel.json, so `npm run preview` behaves like production. */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "vercel.json"), "utf8"));
  const site = config.headers.find((h: { source: string }) => h.source === "/(.*)");
  return Object.fromEntries(site.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
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
    preview: {
      headers: productionHeaders(),
    },
    plugins: [react(), localApi(env)],
    build: {
      rollupOptions: {
        output: {
          // Libraries that rarely change get their own long-cached files, so after a deploy
          // returning visitors only re-download the app code.
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) {
              return "react-vendor";
            }
            if (/node_modules\/(firebase|@firebase)\/(?!firestore)/.test(id)) return "firebase-auth";
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
