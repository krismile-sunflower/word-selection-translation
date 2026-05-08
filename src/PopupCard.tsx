import { useEffect, useState, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface SelectionPayload { text: string; x: number; y: number }
interface Provider { id: string; name: string; baseUrl: string; model: string; apiKey: string }
interface AppConfig { providers: Provider[]; activeProviderId: string; triggerMode: string; minChars: number; popupLingerMs: number; systemPrompt: string | null }
type State = "idle" | "loading" | "success" | "error";

function detectDirection(text: string): "EN → 中" | "中 → EN" {
  const chLen = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return chLen / text.length > 0.25 ? "中 → EN" : "EN → 中";
}

const CopyIcon = ({ filled }: { filled?: boolean }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {filled
      ? <path d="M9 2h9a2 2 0 0 1 2 2v12M4 7h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="currentColor" stroke="none" />
      : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>
    }
  </svg>
);

const ChevronIcon = () => (
  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CSS = `
  @keyframes appear {
    from { opacity: 0; transform: translateY(11px) scale(0.984); filter: blur(3px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @keyframes shimmer {
    0%   { background-position: -500px 0; }
    100% { background-position:  500px 0; }
  }
  @keyframes dot-bounce {
    0%, 80%, 100% { transform: translateY(0);   opacity: 0.28; }
    40%           { transform: translateY(-5px); opacity: 1;   }
  }
  @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; } }

  html, body { margin: 0; padding: 0; overflow: hidden; }
  .ink-root * { box-sizing: border-box; }

  .ink-topbar { display: flex; align-items: center; gap: 6px; padding: 12px 14px 0; }
  .ink-provider-wrap { flex: 1; display: flex; justify-content: center; }

  .ink-dir-tag {
    font-size: 9.5px; letter-spacing: .075em; padding: 2px 8px;
    border-radius: 20px; flex-shrink: 0; user-select: none; white-space: nowrap;
    font-family: inherit;
  }
  .ink-dir-en { background: rgba(121,96,243,.13); border: 1px solid rgba(121,96,243,.26); color: rgba(162,148,255,.86); }
  .ink-dir-zh { background: rgba(232,153,74,.11); border: 1px solid rgba(232,153,74,.24); color: rgba(255,186,115,.82); }

  .ink-prov-btn {
    font-size: 10.5px; color: rgba(175,165,215,.48);
    background: rgba(255,255,255,.036); border: 1px solid rgba(255,255,255,.068);
    border-radius: 7px; padding: 2px 9px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 3px;
    transition: color .14s, background .14s, border-color .14s;
    font-family: inherit;
  }
  .ink-prov-btn:hover { color: rgba(200,192,255,.72); background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.12); }

  .ink-close-btn {
    width: 22px; height: 22px; border-radius: 50%;
    background: none; border: none; color: rgba(155,145,195,.26);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 12px; flex-shrink: 0; padding: 0;
    transition: color .14s, background .14s; font-family: inherit;
  }
  .ink-close-btn:hover { color: rgba(210,205,240,.82); background: rgba(255,255,255,.09); }

  .ink-body { flex: 1; padding: 16px 20px 8px; overflow: hidden; }

  .ink-t-text {
    font-size: 19px; line-height: 1.66;
    color: rgba(238,234,255,.93); font-weight: 400; letter-spacing: .004em;
    margin: 0;
  }

  .ink-dots { display: flex; gap: 7px; align-items: center; padding: 8px 0 4px; }
  .ink-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: rgba(121,96,243,.85);
    animation: dot-bounce 1.4s ease-in-out infinite;
  }
  .ink-dot:nth-child(2) { animation-delay: .16s; }
  .ink-dot:nth-child(3) { animation-delay: .32s; }

  .ink-skel {
    border-radius: 5px;
    background: linear-gradient(90deg,
      rgba(255,255,255,.038) 25%,
      rgba(255,255,255,.088) 50%,
      rgba(255,255,255,.038) 75%);
    background-size: 500px 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  .ink-err { font-size: 13px; color: rgba(248,113,113,.92); line-height: 1.55; margin: 0; }
  .ink-retry {
    display: inline-block; margin-top: 9px;
    font-size: 11.5px; padding: 5px 12px; border-radius: 6px;
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10);
    color: rgba(185,178,225,.65); cursor: pointer;
    font-family: inherit; transition: background .14s;
  }
  .ink-retry:hover { background: rgba(255,255,255,.10); }

  .ink-footer {
    padding: 6px 20px 14px;
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  }
  .ink-src {
    flex: 1; font-size: 11px; color: rgba(155,145,195,.26);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-style: italic;
  }
  .ink-copy {
    width: 28px; height: 28px; border-radius: 7px;
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
    color: rgba(155,145,195,.42); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .14s; padding: 0; flex-shrink: 0;
  }
  .ink-copy:hover { background: rgba(255,255,255,.09); color: rgba(210,205,240,.88); border-color: rgba(255,255,255,.12); }
  .ink-copy.ok { color: rgba(74,222,128,.90); border-color: rgba(74,222,128,.22); background: rgba(74,222,128,.07); }

  .ink-prov-drop {
    position: absolute; top: calc(100% + 5px); left: 50%; transform: translateX(-50%);
    min-width: 148px; background: rgba(12,9,22,.98);
    border: 1px solid rgba(255,255,255,.10); border-radius: 10px;
    padding: 4px; z-index: 999;
    box-shadow: 0 8px 32px rgba(0,0,0,.65); backdrop-filter: blur(24px);
  }
  .ink-prov-item {
    display: block; width: 100%; padding: 7px 11px;
    background: none; border: none; border-radius: 6px;
    color: rgba(175,165,215,.70); font-size: 12px; text-align: left;
    cursor: pointer; transition: background .1s; font-family: inherit;
  }
  .ink-prov-item:hover { background: rgba(255,255,255,.08); }
  .ink-prov-item.active { color: rgba(162,148,255,.95); background: rgba(110,90,255,.12); }
`;

export default function PopupCard() {
  const [state, setState] = useState<State>("idle");
  const [originalText, setOriginalText] = useState("");
  const [translation, setTranslation] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [direction, setDirection] = useState<"EN → 中" | "中 → EN">("EN → 中");
  const [animKey, setAnimKey] = useState(0);
  const stateRef = useRef<State>("idle");

  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>("");
  const [showDrop, setShowDrop] = useState(false);
  const [fullConfig, setFullConfig] = useState<AppConfig | null>(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  const hideWindow = useCallback(async () => {
    try { await getCurrentWindow().hide(); } catch {}
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      setProviders(cfg.providers);
      setActiveProviderId(cfg.activeProviderId);
      setFullConfig(cfg);
    } catch {}
  }, []);

  const doTranslate = useCallback(async (text: string) => {
    setState("loading");
    setTranslation("");
    setErrorMsg("");
    setAnimKey((k) => k + 1);
    try {
      const result = await invoke<string>("translate_text", { text });
      setTranslation(result);
      setState("success");
    } catch (e: unknown) {
      setState("error");
      setErrorMsg(String(e));
    }
  }, []);

  useEffect(() => {
    loadConfig();
    let u1: (() => void) | null = null;
    let u2: (() => void) | null = null;
    let u3: (() => void) | null = null;

    listen<SelectionPayload>("selection-text", ({ payload }) => {
      setOriginalText(payload.text);
      setDirection(detectDirection(payload.text));
      setCopied(false);
      setShowDrop(false);
      doTranslate(payload.text);
    }).then((fn) => { u1 = fn; });

    listen<AppConfig>("config-changed", ({ payload: cfg }) => {
      setProviders(cfg.providers);
      setActiveProviderId(cfg.activeProviderId);
      setFullConfig(cfg);
    }).then((fn) => { u2 = fn; });

    getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused && stateRef.current !== "loading") hideWindow();
    }).then((fn) => { u3 = fn; });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setShowDrop(false); hideWindow(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      u1?.(); u2?.(); u3?.();
      window.removeEventListener("keydown", onKey);
    };
  }, [hideWindow, loadConfig, doTranslate]);

  const handleCopy = async () => {
    if (!translation) return;
    try {
      await navigator.clipboard.writeText(translation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const switchProvider = async (id: string) => {
    if (!fullConfig) return;
    setShowDrop(false);
    setActiveProviderId(id);
    const newCfg = { ...fullConfig, activeProviderId: id };
    setFullConfig(newCfg);
    try { await invoke("save_config", { config: newCfg }); } catch {}
    if (originalText) doTranslate(originalText);
  };

  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const dirCls = direction === "EN → 中" ? "en" : "zh";

  return (
    <div
      className="ink-root"
      style={{
        margin: 0, padding: 0,
        width: "100vw", height: "100vh",
        overflow: "hidden", background: "transparent",
        fontFamily: "'PingFang SC', 'Microsoft YaHei', -apple-system, 'Segoe UI', sans-serif",
      }}
      onMouseLeave={() => { if (stateRef.current !== "loading") { setShowDrop(false); hideWindow(); } }}
    >
      <style>{CSS}</style>
      <div
        key={animKey}
        style={{
          position: "absolute" as const, inset: 0,
          background: "rgba(10,8,20,0.97)",
          backdropFilter: "blur(32px) saturate(220%)",
          WebkitBackdropFilter: "blur(32px) saturate(220%)",
          borderRadius: "17px",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 36px 90px rgba(0,0,0,0.78), 0 6px 22px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.034)",
          display: "flex", flexDirection: "column" as const, overflow: "hidden",
          animation: "appear 0.22s cubic-bezier(0.16,1,0.3,1) both",
        }}
      >
        {/* Top bar */}
        <div className="ink-topbar">
          <span className={`ink-dir-tag ink-dir-${dirCls}`}>{direction}</span>

          {/* Provider pill — centered */}
          <div className="ink-provider-wrap">
            {activeProvider && (
              <div style={{ position: "relative" as const }}>
                <button className="ink-prov-btn" onClick={() => setShowDrop((v) => !v)}>
                  {activeProvider.name}&nbsp;<ChevronIcon />
                </button>
                {showDrop && (
                  <div className="ink-prov-drop">
                    {providers.map((p) => (
                      <button
                        key={p.id}
                        className={`ink-prov-item${p.id === activeProviderId ? " active" : ""}`}
                        onClick={() => switchProvider(p.id)}
                      >
                        {p.id === activeProviderId ? "✓  " : "    "}{p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button className="ink-close-btn" onClick={hideWindow} aria-label="关闭">✕</button>
        </div>

        {/* Body */}
        <div className="ink-body">
          {state === "loading" && (
            <div className="ink-dots">
              <div className="ink-dot" />
              <div className="ink-dot" />
              <div className="ink-dot" />
            </div>
          )}
          {state === "success" && (
            <p className="ink-t-text">{translation}</p>
          )}
          {state === "error" && (
            <div>
              <p className="ink-err">{errorMsg}</p>
              <button className="ink-retry" onClick={() => originalText && doTranslate(originalText)}>重试</button>
            </div>
          )}
          {state === "idle" && (
            <p style={{ fontSize: "13px", color: "rgba(155,145,195,0.22)", margin: 0 }}>等待选词…</p>
          )}
        </div>

        {/* Footer — only when there's content */}
        {(state === "success" || state === "error") && (
          <div className="ink-footer">
            <span className="ink-src" title={originalText}>{originalText}</span>
            {state === "success" && (
              <button
                className={`ink-copy${copied ? " ok" : ""}`}
                onClick={handleCopy}
                title={copied ? "已复制" : "复制译文"}
              >
                <CopyIcon filled={copied} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
