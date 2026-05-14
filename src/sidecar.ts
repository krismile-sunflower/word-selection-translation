import { invoke } from "@tauri-apps/api/core";

let cachedUrl: string | null = null;

export async function getSidecarUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;
  for (let i = 0; i < 20; i++) {
    try {
      const url = await invoke<string>("get_sidecar_url");
      cachedUrl = url;
      return url;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("无法连接到翻译服务");
}

export async function translateViaSidecar(
  text: string,
  providerId?: string,
  systemPrompt?: string | null
): Promise<string> {
  const base = await getSidecarUrl();
  const res = await fetch(`${base}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, providerId, systemPrompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.result;
}

export async function testProviderViaSidecar(
  provider: unknown,
  systemPrompt?: string | null
): Promise<string> {
  const base = await getSidecarUrl();
  const res = await fetch(`${base}/test-provider`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, systemPrompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.result;
}
