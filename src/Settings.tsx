import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface AppConfig {
  providers: Provider[];
  activeProviderId: string;
  triggerMode: string;
  minChars: number;
  popupLingerMs: number;
  systemPrompt: string | null;
}

const PRESETS = [
  { name: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5-air" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash" },
  { name: "Moonshot", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { name: "Ollama", baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" },
];

const DEFAULT_CONFIG: AppConfig = {
  providers: [{ id: "zhipu", name: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5-air", apiKey: "" }],
  activeProviderId: "zhipu",
  triggerMode: "auto",
  minChars: 2,
  popupLingerMs: 0,
  systemPrompt: null,
};

function uid() { return Math.random().toString(36).slice(2, 10); }

const C = {
  bg: "#0f0f13",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.08)",
  text: "#e8e8f0",
  sub: "rgba(232,232,240,0.45)",
  accent: "rgba(110,90,255,0.85)",
  accentBorder: "rgba(120,100,255,0.45)",
  accentText: "rgba(180,170,255,0.9)",
};

const inp: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "8px",
  padding: "9px 12px",
  fontSize: "13.5px",
  color: C.text,
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
  transition: "border-color 0.15s, background 0.15s",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 18px", borderRadius: "8px", background: C.accent,
  border: "1px solid " + C.accentBorder, color: "#fff", fontSize: "13px",
  fontWeight: 500, cursor: "pointer", transition: "opacity 0.15s",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.10)", color: "rgba(232,232,240,0.65)",
  fontSize: "13px", cursor: "pointer", transition: "background 0.15s",
};
const tabStyle: React.CSSProperties = {
  padding: "7px 16px", borderRadius: "8px", background: "transparent",
  border: "1px solid transparent", color: C.sub, fontSize: "13px",
  cursor: "pointer", transition: "all 0.15s",
};
const tabActiveStyle: React.CSSProperties = {
  ...tabStyle, background: "rgba(110,90,255,0.15)",
  border: "1px solid rgba(110,90,255,0.28)", color: C.accentText,
};

function focusIn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "rgba(110,90,255,0.55)";
  e.currentTarget.style.background = "rgba(255,255,255,0.09)";
}
function focusOut(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
}

function ProviderForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Provider;
  onSave: (p: Provider) => void;
  onCancel: () => void;
}) {
  const [p, setP] = useState<Provider>(initial);
  const [showKey, setShowKey] = useState(false);
  const set = (k: keyof Provider) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setP((prev) => ({ ...prev, [k]: e.target.value }));
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" as const }}>
        {PRESETS.map((pr) => (
          <button
            key={pr.name}
            onClick={() => setP((prev) => ({ ...prev, name: pr.name, baseUrl: pr.baseUrl, model: pr.model }))}
            style={{ padding: "4px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: C.sub, fontSize: "12px", cursor: "pointer" }}
          >
            {pr.name}
          </button>
        ))}
      </div>
      {(["name", "baseUrl", "model"] as const).map((k) => (
        <input
          key={k}
          style={inp}
          placeholder={{ name: "名称", baseUrl: "Base URL", model: "模型名称" }[k]}
          value={p[k]}
          onChange={set(k)}
          onFocus={focusIn}
          onBlur={focusOut}
        />
      ))}
      <div style={{ position: "relative" as const }}>
        <input
          style={{ ...inp, paddingRight: "52px" }}
          placeholder="API Key"
          type={showKey ? "text" : "password"}
          value={p.apiKey}
          onChange={set("apiKey")}
          onFocus={focusIn}
          onBlur={focusOut}
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          style={{ position: "absolute" as const, right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: "12px", padding: "2px 4px" }}
        >
          {showKey ? "隐藏" : "显示"}
        </button>
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button style={btnSecondary} onClick={onCancel}>取消</button>
        <button
          style={{ ...btnPrimary, opacity: p.name && p.baseUrl && p.model ? 1 : 0.5 }}
          onClick={() => { if (p.name && p.baseUrl && p.model) onSave(p); }}
        >
          保存
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [activeTab, setActiveTab] = useState<"providers" | "behavior">("providers");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [testState, setTestState] = useState<Record<string, "idle" | "testing" | "ok" | "fail">>({});
  const [testMsg, setTestMsg] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<AppConfig>("get_config").then((cfg) => setConfig(cfg)).catch(() => {});
  }, []);

  const persist = async (newCfg: AppConfig) => {
    try {
      await invoke("save_config", { config: newCfg });
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    }
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  const updateConfig = (newCfg: AppConfig) => {
    setConfig(newCfg);
    if (pendingSave.current) clearTimeout(pendingSave.current);
    pendingSave.current = setTimeout(() => persist(newCfg), 600);
  };

  const addProvider = (p: Provider) => {
    updateConfig({ ...config, providers: [...config.providers, p] });
    setIsAdding(false);
  };

  const updateProvider = (p: Provider) => {
    updateConfig({ ...config, providers: config.providers.map((x) => (x.id === p.id ? p : x)) });
    setEditingId(null);
  };

  const deleteProvider = (id: string) => {
    if (config.providers.length <= 1) return;
    const providers = config.providers.filter((p) => p.id !== id);
    updateConfig({
      ...config,
      providers,
      activeProviderId: config.activeProviderId === id ? providers[0].id : config.activeProviderId,
    });
  };

  const testProvider = async (p: Provider) => {
    setTestState((s) => ({ ...s, [p.id]: "testing" }));
    setTestMsg((m) => ({ ...m, [p.id]: "" }));
    try {
      const r = await invoke<string>("test_translation", {
        text: "Hello world",
        provider: p,
        systemPrompt: config.systemPrompt,
      });
      setTestState((s) => ({ ...s, [p.id]: "ok" }));
      setTestMsg((m) => ({ ...m, [p.id]: r }));
    } catch (e) {
      setTestState((s) => ({ ...s, [p.id]: "fail" }));
      setTestMsg((m) => ({ ...m, [p.id]: String(e) }));
    }
    setTimeout(() => setTestState((s) => ({ ...s, [p.id]: "idle" })), 5000);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        padding: "28px 24px",
        fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif",
        color: C.text,
      }}
    >
      <div style={{ width: "100%", maxWidth: "540px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h1 style={{ fontSize: "17px", fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>划词翻译</h1>
          <span
            style={{
              fontSize: "11px",
              padding: "3px 9px",
              borderRadius: "20px",
              background: "rgba(120,100,255,0.18)",
              border: "1px solid rgba(120,100,255,0.32)",
              color: saveStatus === "error" ? "#ff7070" : C.accentText,
            }}
          >
            {saveStatus === "saved" ? "✓ 已保存" : saveStatus === "error" ? "⚠ 保存失败" : "拖选即翻译"}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
          <button style={activeTab === "providers" ? tabActiveStyle : tabStyle} onClick={() => setActiveTab("providers")}>
            服务商
          </button>
          <button style={activeTab === "behavior" ? tabActiveStyle : tabStyle} onClick={() => setActiveTab("behavior")}>
            行为设置
          </button>
        </div>

        {/* ── Providers Tab ── */}
        {activeTab === "providers" && (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
            {config.providers.map((p) => (
              <div
                key={p.id}
                style={{
                  background: C.card,
                  border: "1px solid " + (p.id === config.activeProviderId ? "rgba(110,90,255,0.35)" : C.border),
                  borderRadius: "12px",
                  padding: "14px 16px",
                  transition: "border-color 0.2s",
                }}
              >
                {editingId === p.id ? (
                  <ProviderForm initial={p} onSave={updateProvider} onCancel={() => setEditingId(null)} />
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{p.name}</span>
                        {p.id === config.activeProviderId && (
                          <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "10px", background: "rgba(100,200,100,0.15)", border: "1px solid rgba(100,200,100,0.3)", color: "rgba(120,220,120,0.9)" }}>
                            活跃
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "6px" }}>
                        {p.id !== config.activeProviderId && (
                          <button
                            onClick={() => updateConfig({ ...config, activeProviderId: p.id })}
                            style={{ ...btnSecondary, padding: "4px 10px", fontSize: "12px" }}
                          >
                            设为活跃
                          </button>
                        )}
                        <button onClick={() => setEditingId(p.id)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: "12px" }}>
                          编辑
                        </button>
                        {config.providers.length > 1 && (
                          <button
                            onClick={() => deleteProvider(p.id)}
                            style={{ padding: "4px 10px", borderRadius: "8px", background: "rgba(255,70,70,0.08)", border: "1px solid rgba(255,70,70,0.2)", color: "rgba(255,100,100,0.8)", fontSize: "12px", cursor: "pointer" }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: "12px", color: C.sub, marginBottom: "8px" }}>
                      {p.model} · {p.baseUrl.replace(/^https?:\/\//, "").split("/")[0]}
                      {p.apiKey ? " · Key: " + "●".repeat(4) + p.apiKey.slice(-4) : " · 未配置 API Key"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={() => testProvider(p)}
                        disabled={testState[p.id] === "testing"}
                        style={{ ...btnSecondary, padding: "5px 12px", fontSize: "12px", opacity: testState[p.id] === "testing" ? 0.6 : 1 }}
                      >
                        {testState[p.id] === "testing" ? "测试中…" : "测试连接"}
                      </button>
                      {testState[p.id] === "ok" && (
                        <span style={{ fontSize: "12px", color: "rgba(100,220,100,0.9)" }}>✓ {testMsg[p.id]}</span>
                      )}
                      {testState[p.id] === "fail" && (
                        <span style={{ fontSize: "12px", color: "#ff7070", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          ✕ {testMsg[p.id]}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {isAdding ? (
              <div style={{ background: C.card, border: "1px solid " + C.border, borderRadius: "12px", padding: "14px 16px" }}>
                <ProviderForm
                  initial={{ id: uid(), name: "", baseUrl: "", model: "", apiKey: "" }}
                  onSave={addProvider}
                  onCancel={() => setIsAdding(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                style={{ ...btnSecondary, width: "100%", padding: "10px", borderRadius: "10px", borderStyle: "dashed", fontSize: "13px" }}
              >
                + 添加服务商
              </button>
            )}
          </div>
        )}

        {/* ── Behavior Tab ── */}
        {activeTab === "behavior" && (
          <div
            style={{
              background: C.card,
              border: "1px solid " + C.border,
              borderRadius: "12px",
              padding: "20px",
              display: "flex",
              flexDirection: "column" as const,
              gap: "22px",
            }}
          >
            {/* Trigger Mode */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: C.sub, letterSpacing: "0.03em", textTransform: "uppercase" as const, marginBottom: "10px" }}>
                触发方式
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "10px" }}>
                {(["auto", "button"] as const).map((mode) => (
                  <label key={mode} style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="triggerMode"
                      value={mode}
                      checked={config.triggerMode === mode}
                      onChange={() => updateConfig({ ...config, triggerMode: mode })}
                      style={{ marginTop: "3px", accentColor: "rgba(110,90,255,0.9)" }}
                    />
                    <div>
                      <div style={{ fontSize: "13.5px", fontWeight: 500 }}>
                        {mode === "auto" ? "自动翻译" : "显示按钮"}
                      </div>
                      <div style={{ fontSize: "12px", color: C.sub, marginTop: "2px" }}>
                        {mode === "auto"
                          ? "松开鼠标立即翻译，响应最快"
                          : "松手后出现小按钮，点击才翻译，避免误触"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Min chars */}
            <div>
              <div style={{ fontSize: "12px", fontWeight: 500, color: C.sub, letterSpacing: "0.03em", textTransform: "uppercase" as const, marginBottom: "8px" }}>
                最少选中字符数
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={config.minChars}
                  onChange={(e) => updateConfig({ ...config, minChars: Number(e.target.value) })}
                  style={{ flex: 1, accentColor: "rgba(110,90,255,0.9)" }}
                />
                <span style={{ fontSize: "14px", fontWeight: 500, minWidth: "28px", textAlign: "right" as const }}>{config.minChars}</span>
              </div>
              <div style={{ fontSize: "11px", color: C.sub, marginTop: "4px" }}>选中字符少于此值不触发翻译，减少误触</div>
            </div>

            {/* System prompt */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: "12px", padding: "0 0 8px", display: "flex", alignItems: "center", gap: "4px", letterSpacing: "0.02em" }}
              >
                <span style={{ fontSize: "10px" }}>{showAdvanced ? "▾" : "▸"}</span>
                系统提示词（高级）
              </button>
              {showAdvanced && (
                <textarea
                  placeholder="留空使用默认翻译提示词…"
                  value={config.systemPrompt ?? ""}
                  onChange={(e) => updateConfig({ ...config, systemPrompt: e.target.value || null })}
                  onFocus={focusIn as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
                  onBlur={focusOut as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
                  style={{ ...inp, resize: "vertical" as const, minHeight: "80px", fontFamily: "inherit" }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
