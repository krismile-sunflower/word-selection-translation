import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { testProviderViaSidecar } from "./sidecar";

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
  bg: "#0a0a10",
  card: "rgba(22,20,38,0.58)",
  border: "rgba(255,255,255,0.08)",
  text: "#e8e8f0",
  sub: "rgba(232,232,240,0.45)",
  accent: "rgba(130,100,255,0.90)",
  accentBorder: "rgba(140,110,255,0.45)",
  accentText: "rgba(190,175,255,0.95)",
  cyan: "rgba(80,200,220,0.85)",
  cyanBorder: "rgba(80,200,220,0.35)",
};

const GLOBAL_CSS = `
  @keyframes bg-shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes tab-appear {
    from { opacity: 0; transform: translateY(8px); filter: blur(4px); }
    to { opacity: 1; transform: none; filter: none; }
  }
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 6px rgba(130,100,255,0.25), 0 0 20px rgba(130,100,255,0.08); }
    50% { box-shadow: 0 0 10px rgba(130,100,255,0.40), 0 0 32px rgba(130,100,255,0.14); }
  }
  @keyframes saved-pop {
    0% { transform: scale(0.85); opacity: 0; }
    40% { transform: scale(1.08); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes dot-bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
    40% { transform: translateY(-4px); opacity: 1; }
  }
  .ink-tab-panel { animation: tab-appear 0.32s cubic-bezier(0.16,1,0.3,1) forwards; }
  .ink-glass-card {
    background: ${C.card};
    backdrop-filter: blur(40px) saturate(220%);
    -webkit-backdrop-filter: blur(40px) saturate(220%);
    border: 1px solid ${C.border};
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05);
    transition: transform 0.28s cubic-bezier(0.16,1,0.3,1), border-color 0.28s ease, box-shadow 0.28s ease;
  }
  .ink-glass-card:hover {
    border-color: rgba(130,100,255,0.22);
    box-shadow: 0 12px 40px rgba(0,0,0,0.32), 0 0 0 1px rgba(130,100,255,0.10), inset 0 1px 0 rgba(255,255,255,0.06);
    transform: translateY(-1px);
  }
  .ink-glass-card.active-provider {
    border-color: rgba(130,100,255,0.35);
    box-shadow: 0 8px 32px rgba(0,0,0,0.28), 0 0 20px rgba(130,100,255,0.10), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  .ink-input {
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 13.5px;
    color: ${C.text};
    outline: none;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .ink-input:focus {
    border-color: rgba(130,100,255,0.55);
    background: rgba(255,255,255,0.07);
    box-shadow: 0 0 0 3px rgba(130,100,255,0.08), 0 0 20px rgba(130,100,255,0.06);
  }
  .ink-btn-primary {
    padding: 9px 20px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(130,100,255,0.92), rgba(110,80,230,0.92));
    border: 1px solid rgba(140,110,255,0.45);
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
    box-shadow: 0 4px 16px rgba(100,70,220,0.18);
  }
  .ink-btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(100,70,220,0.28), 0 0 12px rgba(130,100,255,0.20);
    border-color: rgba(160,130,255,0.55);
  }
  .ink-btn-primary:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(100,70,220,0.18);
  }
  .ink-btn-secondary {
    padding: 9px 16px;
    border-radius: 10px;
    background: rgba(255,255,255,0.045);
    border: 1px solid rgba(255,255,255,0.10);
    color: rgba(232,232,240,0.65);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .ink-btn-secondary:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.16);
    color: rgba(232,232,240,0.85);
  }
  .ink-tab {
    padding: 8px 18px;
    border-radius: 10px;
    background: transparent;
    border: 1px solid transparent;
    color: ${C.sub};
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
    position: relative;
  }
  .ink-tab.active {
    background: rgba(130,100,255,0.14);
    border: 1px solid rgba(130,100,255,0.32);
    color: ${C.accentText};
    box-shadow: 0 0 16px rgba(130,100,255,0.10), inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .ink-tab:not(.active):hover {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.08);
    color: rgba(232,232,240,0.70);
  }
  .ink-preset-btn {
    padding: 5px 12px;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.10);
    color: ${C.sub};
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .ink-preset-btn:hover {
    background: rgba(130,100,255,0.10);
    border-color: rgba(130,100,255,0.30);
    color: ${C.accentText};
    box-shadow: 0 0 12px rgba(130,100,255,0.10);
    transform: translateY(-1px);
  }
  .ink-badge {
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 20px;
    background: rgba(100,220,140,0.12);
    border: 1px solid rgba(100,220,140,0.28);
    color: rgba(120,240,160,0.95);
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .ink-badge-accent {
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 20px;
    background: rgba(130,100,255,0.14);
    border: 1px solid rgba(130,100,255,0.32);
    color: ${C.accentText};
    font-weight: 500;
    animation: saved-pop 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
  }
  .ink-badge-error {
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 20px;
    background: rgba(255,80,80,0.12);
    border: 1px solid rgba(255,80,80,0.32);
    color: rgba(255,120,120,0.95);
    font-weight: 500;
    animation: saved-pop 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
  }
  .ink-del-btn {
    padding: 5px 12px;
    border-radius: 8px;
    background: rgba(255,70,70,0.06);
    border: 1px solid rgba(255,70,70,0.18);
    color: rgba(255,100,100,0.75);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .ink-del-btn:hover {
    background: rgba(255,70,70,0.12);
    border-color: rgba(255,70,70,0.30);
    color: rgba(255,120,120,0.90);
    box-shadow: 0 0 12px rgba(255,70,70,0.10);
  }
  .ink-test-ok { color: rgba(100,230,150,0.95); font-size: 12px; }
  .ink-test-fail { color: rgba(255,110,110,0.95); font-size: 12px; }
  .ink-range {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(255,255,255,0.08);
    outline: none;
  }
  .ink-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(130,100,255,0.95), rgba(110,80,230,0.95));
    border: 2px solid rgba(255,255,255,0.15);
    cursor: pointer;
    box-shadow: 0 0 12px rgba(130,100,255,0.30);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .ink-range::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(130,100,255,0.45);
  }
  .ink-range::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(130,100,255,0.95), rgba(110,80,230,0.95));
    border: 2px solid rgba(255,255,255,0.15);
    cursor: pointer;
    box-shadow: 0 0 12px rgba(130,100,255,0.30);
  }
  .ink-shimmer {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: linear-gradient(90deg, rgba(130,100,255,0.4), rgba(255,255,255,0.6), rgba(130,100,255,0.4));
    background-size: 200% 100%;
    animation: bg-shift 1.2s linear infinite;
    vertical-align: middle;
    margin-right: 6px;
  }
  @media (prefers-reduced-motion: reduce) {
    .ink-tab-panel, .ink-glass-card, .ink-btn-primary, .ink-btn-secondary, .ink-badge-accent, .ink-badge-error {
      animation: none !important;
      transition: none !important;
    }
    .ink-shimmer { animation: none; }
  }
`;

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
    <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const }}>
        {PRESETS.map((pr) => (
          <button
            key={pr.name}
            className="ink-preset-btn"
            onClick={() => setP((prev) => ({ ...prev, name: pr.name, baseUrl: pr.baseUrl, model: pr.model }))}
          >
            {pr.name}
          </button>
        ))}
      </div>
      {(["name", "baseUrl", "model"] as const).map((k) => (
        <input
          key={k}
          className="ink-input"
          placeholder={{ name: "名称", baseUrl: "Base URL", model: "模型名称" }[k]}
          value={p[k]}
          onChange={set(k)}
        />
      ))}
      <div style={{ position: "relative" as const }}>
        <input
          className="ink-input"
          style={{ paddingRight: "56px" }}
          placeholder="API Key"
          type={showKey ? "text" : "password"}
          value={p.apiKey}
          onChange={set("apiKey")}
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          style={{ position: "absolute" as const, right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.sub, fontSize: "12px", padding: "2px 4px", transition: "color 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = C.accentText; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = C.sub; }}
        >
          {showKey ? "隐藏" : "显示"}
        </button>
      </div>
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
        <button className="ink-btn-secondary" onClick={onCancel}>取消</button>
        <button
          className="ink-btn-primary"
          style={{ opacity: p.name && p.baseUrl && p.model ? 1 : 0.45, cursor: p.name && p.baseUrl && p.model ? "pointer" : "not-allowed" }}
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
  const [tabKey, setTabKey] = useState(0);
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
    setTimeout(() => setSaveStatus("idle"), 2200);
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
      const r = await testProviderViaSidecar(p, config.systemPrompt);
      setTestState((s) => ({ ...s, [p.id]: "ok" }));
      setTestMsg((m) => ({ ...m, [p.id]: r }));
    } catch (e) {
      setTestState((s) => ({ ...s, [p.id]: "fail" }));
      setTestMsg((m) => ({ ...m, [p.id]: String(e) }));
    }
    setTimeout(() => setTestState((s) => ({ ...s, [p.id]: "idle" })), 5000);
  };

  const switchTab = (tab: "providers" | "behavior") => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setTabKey((k) => k + 1);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `${C.bg}`,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        padding: "32px 24px",
        fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Segoe UI', -apple-system, sans-serif",
        color: C.text,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{GLOBAL_CSS}</style>
      {/* Animated mesh gradient background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: `
            radial-gradient(ellipse 80% 60% at 20% 30%, rgba(110,80,240,0.14) 0%, transparent 55%),
            radial-gradient(ellipse 60% 80% at 85% 70%, rgba(50,180,200,0.10) 0%, transparent 50%),
            radial-gradient(ellipse 50% 50% at 50% 5%, rgba(140,100,255,0.08) 0%, transparent 45%),
            radial-gradient(ellipse 40% 40% at 75% 20%, rgba(80,60,200,0.06) 0%, transparent 50%)
          `,
          backgroundSize: "200% 200%",
          animation: "bg-shift 18s ease infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: "radial-gradient(ellipse at 50% 0%, rgba(130,100,255,0.04) 0%, transparent 60%)",
        }}
      />

      <div style={{ width: "100%", maxWidth: "560px", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(130,100,255,0.90), rgba(80,60,200,0.90))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "16px",
                fontWeight: 700,
                color: "#fff",
                boxShadow: "0 4px 16px rgba(100,70,220,0.25), 0 0 8px rgba(130,100,255,0.20)",
                letterSpacing: "0.04em",
              }}
            >
              译
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: "#f0f0f8" }}>
              划词翻译
            </h1>
          </div>
          {saveStatus === "saved" && (
            <span className="ink-badge-accent">已保存</span>
          )}
          {saveStatus === "error" && (
            <span className="ink-badge-error">保存失败</span>
          )}
          {saveStatus === "idle" && (
            <span style={{
              fontSize: "11px",
              padding: "4px 12px",
              borderRadius: "20px",
              background: "rgba(130,100,255,0.10)",
              border: "1px solid rgba(130,100,255,0.22)",
              color: C.accentText,
              fontWeight: 500,
            }}>
              拖选即翻译
            </span>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px", position: "relative" }}>
          <button className={`ink-tab ${activeTab === "providers" ? "active" : ""}`} onClick={() => switchTab("providers")}>
            服务商
          </button>
          <button className={`ink-tab ${activeTab === "behavior" ? "active" : ""}`} onClick={() => switchTab("behavior")}>
            行为设置
          </button>
        </div>

        {/* ── Providers Tab ── */}
        {activeTab === "providers" && (
          <div key={tabKey} className="ink-tab-panel" style={{ display: "flex", flexDirection: "column" as const, gap: "14px" }}>
            {config.providers.map((p) => (
              <div
                key={p.id}
                className={`ink-glass-card ${p.id === config.activeProviderId ? "active-provider" : ""}`}
                style={{ padding: "16px 18px" }}
              >
                {editingId === p.id ? (
                  <ProviderForm initial={p} onSave={updateProvider} onCancel={() => setEditingId(null)} />
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontWeight: 700, fontSize: "14.5px", color: "#f0f0f8" }}>{p.name}</span>
                        {p.id === config.activeProviderId && (
                          <span className="ink-badge">活跃</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        {p.id !== config.activeProviderId && (
                          <button
                            onClick={() => updateConfig({ ...config, activeProviderId: p.id })}
                            className="ink-btn-secondary"
                            style={{ padding: "5px 12px", fontSize: "12px" }}
                          >
                            设为活跃
                          </button>
                        )}
                        <button
                          onClick={() => setEditingId(p.id)}
                          className="ink-btn-secondary"
                          style={{ padding: "5px 12px", fontSize: "12px" }}
                        >
                          编辑
                        </button>
                        {config.providers.length > 1 && (
                          <button onClick={() => deleteProvider(p.id)} className="ink-del-btn">
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: "12.5px", color: C.sub, marginBottom: "10px", lineHeight: 1.5 }}>
                      {p.model} · {p.baseUrl.replace(/^https?:\/\//, "").split("/")[0]}
                      {p.apiKey ? " · Key: " + "●".repeat(4) + p.apiKey.slice(-4) : " · 未配置 API Key"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <button
                        onClick={() => testProvider(p)}
                        disabled={testState[p.id] === "testing"}
                        className="ink-btn-secondary"
                        style={{ padding: "6px 14px", fontSize: "12px", opacity: testState[p.id] === "testing" ? 0.55 : 1, display: "flex", alignItems: "center", gap: "6px" }}
                      >
                        {testState[p.id] === "testing" && <span className="ink-shimmer" />}
                        {testState[p.id] === "testing" ? "测试中…" : "测试连接"}
                      </button>
                      {testState[p.id] === "ok" && (
                        <span className="ink-test-ok">{testMsg[p.id]}</span>
                      )}
                      {testState[p.id] === "fail" && (
                        <span className="ink-test-fail" style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                          {testMsg[p.id]}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {isAdding ? (
              <div className="ink-glass-card" style={{ padding: "16px 18px" }}>
                <ProviderForm
                  initial={{ id: uid(), name: "", baseUrl: "", model: "", apiKey: "" }}
                  onSave={addProvider}
                  onCancel={() => setIsAdding(false)}
                />
              </div>
            ) : (
              <button
                onClick={() => setIsAdding(true)}
                className="ink-btn-secondary"
                style={{ width: "100%", padding: "12px", borderStyle: "dashed", fontSize: "13.5px", borderRadius: "12px" }}
              >
                + 添加服务商
              </button>
            )}
          </div>
        )}

        {/* ── Behavior Tab ── */}
        {activeTab === "behavior" && (
          <div
            key={tabKey}
            className="ink-tab-panel ink-glass-card"
            style={{ padding: "24px", display: "flex", flexDirection: "column" as const, gap: "26px" }}
          >
            {/* Trigger Mode */}
            <div>
              <div style={{ fontSize: "11.5px", fontWeight: 600, color: C.sub, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: "12px" }}>
                触发方式
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: "12px" }}>
                {(["auto", "button"] as const).map((mode) => (
                  <label
                    key={mode}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      cursor: "pointer",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: "1px solid " + (config.triggerMode === mode ? "rgba(130,100,255,0.30)" : "transparent"),
                      background: config.triggerMode === mode ? "rgba(130,100,255,0.06)" : "transparent",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (config.triggerMode !== mode) {
                        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (config.triggerMode !== mode) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "transparent";
                      }
                    }}
                  >
                    <input
                      type="radio"
                      name="triggerMode"
                      value={mode}
                      checked={config.triggerMode === mode}
                      onChange={() => updateConfig({ ...config, triggerMode: mode })}
                      style={{ marginTop: "3px", accentColor: "rgba(130,100,255,0.9)", width: "16px", height: "16px" }}
                    />
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: config.triggerMode === mode ? "#f0f0f8" : C.text }}>
                        {mode === "auto" ? "自动翻译" : "显示按钮"}
                      </div>
                      <div style={{ fontSize: "12.5px", color: C.sub, marginTop: "3px", lineHeight: 1.5 }}>
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
              <div style={{ fontSize: "11.5px", fontWeight: 600, color: C.sub, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: "10px" }}>
                最少选中字符数
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={config.minChars}
                  onChange={(e) => updateConfig({ ...config, minChars: Number(e.target.value) })}
                  className="ink-range"
                  style={{ flex: 1 }}
                />
                <span style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  minWidth: "32px",
                  textAlign: "right" as const,
                  color: C.accentText,
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {config.minChars}
                </span>
              </div>
              <div style={{ fontSize: "11.5px", color: C.sub, marginTop: "6px" }}>选中字符少于此值不触发翻译，减少误触</div>
            </div>

            {/* System prompt */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: C.sub,
                  fontSize: "12.5px",
                  padding: "0 0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  letterSpacing: "0.02em",
                  fontWeight: 500,
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = C.accentText; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.sub; }}
              >
                <span style={{
                  fontSize: "10px",
                  display: "inline-block",
                  transition: "transform 0.2s ease",
                  transform: showAdvanced ? "rotate(90deg)" : "rotate(0deg)",
                }}>
                  ▸
                </span>
                系统提示词（高级）
              </button>
              {showAdvanced && (
                <textarea
                  placeholder="留空使用默认翻译提示词…"
                  value={config.systemPrompt ?? ""}
                  onChange={(e) => updateConfig({ ...config, systemPrompt: e.target.value || null })}
                  className="ink-input"
                  style={{ resize: "vertical" as const, minHeight: "90px", fontFamily: "inherit", lineHeight: 1.6 }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
