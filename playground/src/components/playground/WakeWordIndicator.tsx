"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  WakeWordState,
  getWakeWordStateText,
} from "@/hooks/useWakeWord";

interface WakeWordIndicatorProps {
  state: WakeWordState;
  model?: string | null;
  confidence?: number;
  accentColor?: string;
}

/**
 * Visual indicator for wake word detection state.
 *
 * Shows different animations and colors based on:
 * - listening: Pulsing indicator waiting for "Hey Jarvis"
 * - detected: Flash animation when wake word heard
 * - active: Solid indicator during active conversation
 * - timeout: Brief flash before returning to listening
 */
export function WakeWordIndicator({
  state,
  model,
  confidence,
  accentColor = "cyan",
}: WakeWordIndicatorProps) {
  const [showDetectedFlash, setShowDetectedFlash] = useState(false);

  // Show flash effect when wake word detected
  useEffect(() => {
    if (state === "detected") {
      setShowDetectedFlash(true);
      const timer = setTimeout(() => setShowDetectedFlash(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Don't render if disabled
  if (state === "disabled") {
    return null;
  }

  const stateText = getWakeWordStateText(state);

  // Get colors based on state
  const getIndicatorColor = () => {
    switch (state) {
      case "listening":
        return "bg-yellow-500";
      case "detected":
        return `bg-${accentColor}-400`;
      case "active":
        return `bg-${accentColor}-500`;
      case "timeout":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  const getGlowColor = () => {
    switch (state) {
      case "listening":
        return "rgba(234, 179, 8, 0.4)"; // yellow-500
      case "detected":
      case "active":
        return `var(--lk-theme-color)`;
      case "timeout":
        return "rgba(249, 115, 22, 0.4)"; // orange-500
      default:
        return "transparent";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Indicator dot with animations */}
      <div className="relative">
        {/* Base dot */}
        <motion.div
          className={`w-3 h-3 rounded-full ${getIndicatorColor()}`}
          animate={{
            scale: state === "listening" ? [1, 1.2, 1] : 1,
          }}
          transition={{
            duration: 2,
            repeat: state === "listening" ? Infinity : 0,
            ease: "easeInOut",
          }}
          style={{
            boxShadow: `0 0 8px ${getGlowColor()}`,
          }}
        />

        {/* Ping effect for listening state */}
        {state === "listening" && (
          <motion.div
            className="absolute inset-0 rounded-full bg-yellow-500"
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 2 }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}

        {/* Flash effect on detection */}
        <AnimatePresence>
          {showDetectedFlash && (
            <motion.div
              className={`absolute inset-0 rounded-full bg-${accentColor}-400`}
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 4 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* State text */}
      <motion.span
        className="text-xs text-gray-400"
        key={state}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {stateText}
        {state === "detected" && confidence && confidence > 0 && (
          <span className="ml-1 text-gray-500">
            ({Math.round(confidence * 100)}%)
          </span>
        )}
      </motion.span>
    </div>
  );
}

/**
 * Compact wake word indicator for header/toolbar use
 */
export function WakeWordIndicatorCompact({
  state,
  accentColor = "cyan",
}: {
  state: WakeWordState;
  accentColor?: string;
}) {
  if (state === "disabled") {
    return null;
  }

  const getColor = () => {
    switch (state) {
      case "listening":
        return "bg-yellow-500";
      case "detected":
      case "active":
        return `bg-${accentColor}-500`;
      case "timeout":
        return "bg-orange-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <motion.div
      className={`w-2 h-2 rounded-full ${getColor()}`}
      animate={{
        scale: state === "listening" ? [1, 1.3, 1] : 1,
        opacity: state === "listening" ? [1, 0.7, 1] : 1,
      }}
      transition={{
        duration: 1.5,
        repeat: state === "listening" ? Infinity : 0,
        ease: "easeInOut",
      }}
      title={getWakeWordStateText(state)}
    />
  );
}
