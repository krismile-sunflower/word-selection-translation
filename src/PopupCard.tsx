import { useEffect, useState, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { translateViaSidecar } from "./sidecar";

interface SelectionPayload { text: string; x: number; y: number }
interface Provider { id: string; name: string; baseUrl: string; model: string; apiKey: string }
interface AppConfig { providers: Provider[]; activeProviderId: string; triggerMode: string; minChars: number; popupLingerMs: number; systemPrompt: string | null }
type State = "idle" | "loading" | "success" | "error";

function detectDirection(text: string): "EN → 中" | "中 → EN" {
  const chLen = (text.match(/[一-鿿]/g) || []).length;
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
    from { opacity: 0; transform: translateY(16px) scale(0.96); filter: blur(10px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @keyframes shimmer-slide {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes pulse-ring {
    0%   { transform: scale(0.92); opacity: 0.5; }
    50%  { transform: scale(1.02); opacity: 0.25; }
    100% { transform: scale(0.92); opacity: 0.5; }
  }
  @keyframes text-reveal {
    from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
    to   { opacity: 1; transform: none; filter: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }

  html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  .ink-root * { box-sizing: border-box; }

  .ink-card {
    position: absolute;
    inset: 0;
    background: rgba(12,10,26,0.96);
    backdrop-filter: blur(40px) saturate(240%);
    -webkit-backdrop-filter: blur(40px) saturate(240%);
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.07);
    box-shadow:
      0 36px 90px rgba(0,0,0,0.78),
      0 6px 22px rgba(0,0,0,0.44),
      0 0 0 1px rgba(130,100,255,0.06),
      inset 0 1px 0 rgba(255,255,255,0.035);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    will-change: transform, opacity, filter;
    opacity: 0;
    transform: translateY(16px) scale(0.96);
    filter: blur(10px);
  }

  .ink-card.enter {
    opacity: 1;
    transform: none;
    filter: none;
    transition:
      opacity .30s ease,
      transform .42s cubic-bezier(.16,1,.3,1),
      filter .36s ease,
      box-shadow .42s ease;
    box-shadow:
      0 36px 90px rgba(0,0,0,0.78),
      0 6px 22px rgba(0,0,0,0.44),
      0 0 40px rgba(130,100,255,0.10),
      0 0 0 1px rgba(130,100,255,0.12),
      inset 0 1px 0 rgba(255,255,255,0.05);
  }

  .ink-topbar { display: flex; align-items: center; gap: 8px; padding: 13px 16px 0; }
  .ink-provider-wrap { flex: 1; display: flex; justify-content: center; }

  .ink-dir-tag {
    font-size: 9.5px; letter-spacing: .08em; padding: 3px 10px;
    border-radius: 20px; flex-shrink: 0; user-select: none; white-space: nowrap;
    font-family: inherit; font-weight: 600;
  }
  .ink-dir-en { background: rgba(130,100,255,.14); border: 1px solid rgba(130,100,255,.30); color: rgba(185,170,255,.90); }
  .ink-dir-zh { background: rgba(80,200,220,.12); border: 1px solid rgba(80,200,220,.28); color: rgba(120,225,240,.88); }

  .ink-prov-btn {
    font-size: 10.5px; color: rgba(175,165,215,.50);
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
    border-radius: 8px; padding: 3px 10px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 4px;
    transition: all .18s cubic-bezier(.16,1,.3,1);
    font-family: inherit;
  }
  .ink-prov-btn:hover {
    color: rgba(200,192,255,.80);
    background: rgba(130,100,255,.10);
    border-color: rgba(130,100,255,.22);
    box-shadow: 0 0 12px rgba(130,100,255,.10);
    transform: translateY(-0.5px);
  }

  .ink-close-btn {
    width: 24px; height: 24px; border-radius: 50%;
    background: none; border: none; color: rgba(155,145,195,.30);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    font-size: 13px; flex-shrink: 0; padding: 0;
    transition: all .18s ease; font-family: inherit;
  }
  .ink-close-btn:hover {
    color: rgba(210,205,240,.90);
    background: rgba(255,255,255,.10);
    transform: rotate(90deg);
  }

  .ink-body { flex: 1; padding: 18px 22px 10px; overflow: hidden; }

  .ink-t-text {
    font-size: 19px; line-height: 1.66;
    color: rgba(240,238,255,.94); font-weight: 400; letter-spacing: .004em;
    margin: 0;
    animation: text-reveal 0.45s cubic-bezier(.16,1,.3,1) forwards;
  }

  .ink-shimmer-bar {
    height: 3px;
    border-radius: 3px;
    width: 55%;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(130,100,255,0.5) 25%,
      rgba(200,180,255,0.8) 50%,
      rgba(130,100,255,0.5) 75%,
      transparent 100%);
    background-size: 200% 100%;
    animation: shimmer-slide 1.6s ease-in-out infinite;
    margin: 14px 0 8px;
  }
  .ink-shimmer-glow {
    width: 55%;
    height: 3px;
    border-radius: 3px;
    background: rgba(130,100,255,0.12);
    position: relative;
    overflow: hidden;
    margin: 14px 0 8px;
  }
  .ink-shimmer-glow::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg,
      transparent,
      rgba(130,100,255,0.6),
      rgba(200,180,255,0.9),
      rgba(130,100,255,0.6),
      transparent);
    background-size: 200% 100%;
    animation: shimmer-slide 1.6s ease-in-out infinite;
  }

  .ink-loading-ring {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: 2px solid rgba(130,100,255,0.10);
    border-top-color: rgba(130,100,255,0.70);
    animation: spin 0.8s linear infinite;
    margin: 8px 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .ink-err { font-size: 13.5px; color: rgba(255,120,120,.95); line-height: 1.55; margin: 0; }
  .ink-retry {
    display: inline-block; margin-top: 10px;
    font-size: 12px; padding: 6px 14px; border-radius: 8px;
    background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10);
    color: rgba(185,178,225,.70); cursor: pointer;
    font-family: inherit; transition: all .18s ease;
  }
  .ink-retry:hover {
    background: rgba(130,100,255,.12);
    border-color: rgba(130,100,255,.28);
    color: rgba(200,190,255,.90);
    box-shadow: 0 0 16px rgba(130,100,255,.12);
    transform: translateY(-1px);
  }

  .ink-footer {
    padding: 8px 22px 16px;
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .ink-src {
    flex: 1; font-size: 11px; color: rgba(155,145,195,.28);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-style: italic;
  }
  .ink-copy {
    width: 30px; height: 30px; border-radius: 8px;
    background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07);
    color: rgba(155,145,195,.42); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .18s cubic-bezier(.16,1,.3,1); padding: 0; flex-shrink: 0;
  }
  .ink-copy:hover {
    background: rgba(130,100,255,.12);
    color: rgba(210,205,240,.90);
    border-color: rgba(130,100,255,.25);
    box-shadow: 0 0 14px rgba(130,100,255,.15);
    transform: scale(1.08);
  }
  .ink-copy.ok {
    color: rgba(100,230,150,.95);
    border-color: rgba(100,230,150,.28);
    background: rgba(100,230,150,.08);
    box-shadow: 0 0 14px rgba(100,230,150,.12);
    transform: scale(1.08);
  }

  .ink-prov-drop {
    position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
    min-width: 156px; background: rgba(14,11,28,.98);
    border: 1px solid rgba(130,100,255,.18); border-radius: 12px;
    padding: 5px; z-index: 999;
    box-shadow: 0 12px 40px rgba(0,0,0,.70), 0 0 24px rgba(130,100,255,.08);
    backdrop-filter: blur(28px);
    animation: drop-in 0.18s cubic-bezier(.16,1,.3,1) forwards;
  }
  @keyframes drop-in {
    from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.96); filter: blur(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); filter: none; }
  }
  .ink-prov-item {
    display: block; width: 100%; padding: 8px 12px;
    background: none; border: none; border-radius: 7px;
    color: rgba(175,165,215,.70); font-size: 12px; text-align: left;
    cursor: pointer; transition: all .12s ease; font-family: inherit;
  }
  .ink-prov-item:hover {
    background: rgba(130,100,255,.10);
    color: rgba(200,190,255,.90);
  }
  .ink-prov-item.active {
    color: rgba(185,170,255,.95);
    background: rgba(130,100,255,.14);
  }
`;

export default function PopupCard() {
  const [state, setState] = useState<State>("idle");
  const [originalText, setOriginalText] = useState("");
  const [translation, setTranslation] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [direction, setDirection] = useState<"EN → 中" | "中 → EN">("EN → 中");
  const [entering, setEntering] = useState(false);
  const stateRef = useRef<State>("idle");
  const [textKey, setTextKey] = useState(0);

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
    try {
      const result = await translateViaSidecar(text, activeProviderId, fullConfig?.systemPrompt);
      setTranslation(result);
      setTextKey((k) => k + 1);
      setState("success");
    } catch (e: unknown) {
      setState("error");
      setErrorMsg(String(e));
    }
  }, [activeProviderId, fullConfig?.systemPrompt]);

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
      setEntering(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setEntering(true)));
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
      <div className={`ink-card${entering ? " enter" : ""}`}>
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
            <div>
              <div className="ink-shimmer-glow" />
              <div style={{ fontSize: "12px", color: "rgba(155,145,195,0.30)", marginTop: "6px" }}>正在翻译…</div>
            </div>
          )}
          {state === "success" && (
            <p key={textKey} className="ink-t-text">{translation}</p>
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
