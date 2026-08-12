"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useChatContext } from "./chat-provider";

export function ChatButton() {
  const { isOpen, setIsOpen } = useChatContext();
  const [showTooltip, setShowTooltip] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setPulse(true), 2000);
    const clearPulse = setTimeout(() => setPulse(false), 8000);
    return () => {
      clearTimeout(timer);
      clearTimeout(clearPulse);
    };
  }, []);

  if (isOpen) return null;

  return (
    <div className="fixed bottom-6 right-6 z-30">
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shadow-lg pointer-events-none"
             style={{ background: "var(--primary-900)", color: "#fff" }}>
          Spør meg om økonomien din
          <div className="absolute top-full right-4 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px]"
               style={{ borderTopColor: "var(--primary-900)" }} />
        </div>
      )}

      {pulse && (
        <span className="absolute inset-0 rounded-full bg-primary opacity-30 animate-ping" />
      )}

      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="relative w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
        aria-label="Åpne chat med Elida"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
