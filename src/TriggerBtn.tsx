import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface TriggerReadyPayload { text: string; x: number; y: number }

export default function TriggerBtn() {
  const [payload, setPayload] = useState<TriggerReadyPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setPayload(null);
    try { await getCurrentWindow().hide(); } catch {}
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<TriggerReadyPayload>("trigger-ready", (event) => {
      setPayload(event.payload);
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

  return (
    <div
      style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}
      onMouseEnter={() => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } }}
      onMouseLeave={() => { timerRef.current = setTimeout(hide, 600); }}
    >
      <button
        onClick={handleClick}
        style={{ width: "38px", height: "38px", borderRadius: "50%", background: "rgba(12,12,18,0.94)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px", color: "rgba(160,145,255,0.9)", boxShadow: "0 4px 16px rgba(0,0,0,0.45)", transition: "transform 0.1s, background 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; e.currentTarget.style.background = "rgba(25,20,50,0.96)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "rgba(12,12,18,0.94)"; }}
      >
        译
      </button>
    </div>
  );
}
