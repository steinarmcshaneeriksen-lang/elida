"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useChatContext } from "./chat-provider";

export function ChatButton() {
  const { isOpen, setIsOpen } = useChatContext();
  const [showTooltip, setShowTooltip] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Show a pulse animation on initial mount to draw attention
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
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium rounded-lg whitespace-nowrap shadow-lg pointer-events-none">
          Spor meg om okonomien din
          <div className="absolute top-full right-4 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900 dark:border-t-gray-100" />
        </div>
      )}

      {/* Pulse ring */}
      {pulse && (
        <span className="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping" />
      )}

      {/* Button */}
      <button
        onClick={() => setIsOpen(true)}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="relative w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center"
        aria-label="Apne chat med Elida"
      >
        <MessageCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
