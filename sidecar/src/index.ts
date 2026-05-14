import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig, saveConfig } from "./config.js";
import { doTranslate } from "./translate.js";

const app = new Hono();

app.use("*", cors({ origin: "*" }));

app.get("/health", (c) => {
  const addr = server?.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return c.json({ ok: true, port });
});

app.get("/config", (c) => {
  const cfg = loadConfig();
  return c.json(cfg);
});

app.post("/config", async (c) => {
  const body = await c.req.json();
  saveConfig(body);
  return c.json({ ok: true });
});

app.post("/translate", async (c) => {
  try {
    const { text, providerId, systemPrompt } = await c.req.json();
    const cfg = loadConfig();
    const provider =
      cfg.providers.find((p) => p.id === (providerId || cfg.activeProviderId)) ||
      cfg.providers[0];
    if (!provider) {
      return c.json({ error: "未配置服务商" }, 400);
    }
    const result = await doTranslate(text, provider, systemPrompt ?? cfg.systemPrompt);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

app.post("/test-provider", async (c) => {
  try {
    const { provider, systemPrompt } = await c.req.json();
    const result = await doTranslate("Hello world", provider, systemPrompt);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

let server: ReturnType<typeof serve> | null = null;

server = serve({
  fetch: app.fetch,
  port: 0, // random port
}, (info) => {
  const port = info.port;
  // Notify Rust via stdout
  console.log(JSON.stringify({ type: "ready", port }));
});
