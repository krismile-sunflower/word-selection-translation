import type { Provider } from "./config.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are a concise translation assistant. " +
  "Detect the language: if it is Chinese, translate to English; " +
  "if it is English or any other language, translate to Chinese. " +
  "Return ONLY the translated text, no explanations, no original text.";

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
}

interface ChatChoice {
  message: ChatMessage;
}

interface ChatResponse {
  choices: ChatChoice[];
}

export async function doTranslate(
  text: string,
  provider: Provider,
  systemPrompt?: string | null
): Promise<string> {
  const sp = systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
  const body: ChatRequest = {
    model: provider.model,
    messages: [
      { role: "system", content: sp },
      { role: "user", content: text },
    ],
    stream: false,
  };

  const url = `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`API 错误 ${res.status}: ${bodyText}`);
    }

    const data = (await res.json()) as ChatResponse;
    const result = data.choices?.[0]?.message?.content?.trim();
    if (!result) throw new Error("无翻译结果");
    return result;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error) {
      if (err.name === "AbortError") throw new Error("请求超时");
      throw err;
    }
    throw new Error(String(err));
  }
}
