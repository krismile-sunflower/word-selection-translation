import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TriggerReadyPayload { text: string; x: number; y: number }

const BTN_CSS = `
  @keyframes pulse-ring {
    0%   { transform: scale(0.85); opacity: 0.55; }
    70%  { transform: scale(1.35); opacity: 0; }
    100% { transform: scale(1.35); opacity: 0; }
  }
  @keyframes pulse-ring-2 {
    0%   { transform: scale(0.90); opacity: 0.40; }
    60%  { transform: scale(1.25); opacity: 0; }
    100% { transform: scale(1.25); opacity: 0; }
  }
  @keyframes soft-glow {
    0%, 100% { box-shadow: 0 0 8px rgba(130,100,255,0.25), 0 4px 16px rgba(0,0,0,0.45); }
    50%      { box-shadow: 0 0 16px rgba(130,100,255,0.40), 0 4px 20px rgba(0,0,0,0.50); }
  }
  @media (prefers-reduced-motion: reduce) {
    .ink-pulse-ring, .ink-pulse-ring-2 { animation: none !important; }
  }
`;

export default function TriggerBtn() {
  const [payload, setPayload] = useState<TriggerReadyPayload | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPayload(null);
    setIsHovered(false);
    try { await getCurrentWindow().hide(); } catch {}
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<TriggerReadyPayload>("trigger-ready", (event) => {
      setPayload(event.payload);
      setIsHovered(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(hide, 2000);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleClick = async () => {
    if (!payload) return;
    const { text, x, y } = payload;
    await hide();
    await invoke("show_popup", { text, x, y });
  };

  const btnBase: React.CSSProperties = {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: isHovered
      ? "linear-gradient(135deg, rgba(35,25,70,0.98), rgba(25,18,55,0.98))"
      : "linear-gradient(135deg, rgba(18,16,32,0.96), rgba(12,10,24,0.96))",
    backdropFilter: "blur(24px)",
    border: "1px solid " + (isHovered ? "rgba(130,100,255,0.35)" : "rgba(255,255,255,0.12)"),
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "15px",
    fontWeight: 700,
    color: isHovered ? "rgba(190,175,255,0.95)" : "rgba(160,145,255,0.85)",
    boxShadow: isHovered
      ? "0 6px 24px rgba(0,0,0,0.50), 0 0 20px rgba(130,100,255,0.30), inset 0 1px 0 rgba(255,255,255,0.08)"
      : "0 4px 16px rgba(0,0,0,0.45), 0 0 8px rgba(130,100,255,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
    transition: "all 0.22s cubic-bezier(0.16,1,0.3,1)",
    transform: isHovered ? "scale(1.15)" : "scale(1)",
    position: "relative",
    zIndex: 2,
    letterSpacing: "0.04em",
    padding: 0,
  };

  return (
    <div
      style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", position: "relative" }}
      onMouseEnter={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } setIsHovered(true); }}
      onMouseLeave={() => { timerRef.current = setTimeout(hide, 600); setIsHovered(false); }}
    >
      <style>{BTN_CSS}</style>

      {/* Ambient pulse rings */}
      <div
        className="ink-pulse-ring"
        style={{
          position: "absolute",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "1.5px solid rgba(130,100,255,0.35)",
          animation: "pulse-ring 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div
        className="ink-pulse-ring-2"
        style={{
          position: "absolute",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "1px solid rgba(130,100,255,0.22)",
          animation: "pulse-ring-2 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
          animationDelay: "0.7s",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />

      <button onClick={handleClick} style={btnBase}>
        译
      </button>
    </div>
  );
}
