"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState, useCallback, useEffect } from "react";
import type { Room } from "livekit-client";
import { CheckIcon, ChevronIcon } from "./icons";
import { useAgentRpc, type ModelInfo } from "@/hooks/useAgentRpc";

interface ModelSelectorProps {
  room: Room | null;
  agentIdentity: string | null;
  themeColor: string;
}

/**
 * Format bytes to human-readable size (e.g., "7.4GB")
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return "0B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  // Use 1 decimal place for GB and above, no decimals for smaller
  const decimals = i >= 3 ? 1 : 0;
  return `${size.toFixed(decimals)}${units[i]}`;
}

/**
 * Loading spinner icon
 */
const LoadingSpinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const ModelSelector = ({
  room,
  agentIdentity,
  themeColor,
}: ModelSelectorProps) => {
  const { listModels, switchModel, isLoading, error, clearError } =
    useAgentRpc(room, agentIdentity);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentModel, setCurrentModel] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * Fetch current model on initial connect
   */
  useEffect(() => {
    const fetchCurrentModel = async () => {
      if (!room || !agentIdentity) return;

      try {
        const response = await listModels();
        if (response.success) {
          setModels(response.models || []);
          setCurrentModel(response.current_model || null);
        }
      } catch (err) {
        // Silently fail on initial load - will show error when dropdown opens
        console.log("Failed to fetch initial model:", err);
      }
    };

    fetchCurrentModel();
  }, [room, agentIdentity, listModels]);

  /**
   * Fetch models when dropdown opens
   */
  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (open && room && agentIdentity) {
        setIsFetching(true);
        setLocalError(null);
        clearError();

        try {
          const response = await listModels();
          if (response.success && response.models) {
            setModels(response.models);
            setCurrentModel(response.current_model || null);
          } else {
            setLocalError(response.error || "Failed to fetch models");
          }
        } catch (err) {
          setLocalError(
            err instanceof Error ? err.message : "Failed to fetch models"
          );
        } finally {
          setIsFetching(false);
        }
      }
    },
    [room, agentIdentity, listModels, clearError]
  );

  /**
   * Handle model selection
   */
  const handleSelectModel = useCallback(
    async (modelName: string) => {
      if (modelName === currentModel || isSwitching) return;

      setIsSwitching(true);
      setLocalError(null);
      clearError();

      try {
        const response = await switchModel(modelName);
        if (response.success) {
          setCurrentModel(response.new_model || modelName);
        } else {
          setLocalError(response.error || "Failed to switch model");
        }
      } catch (err) {
        setLocalError(
          err instanceof Error ? err.message : "Failed to switch model"
        );
      } finally {
        setIsSwitching(false);
      }
    },
    [currentModel, isSwitching, switchModel, clearError]
  );

  const isDisabled = !room || !agentIdentity;
  const showLoading = isFetching || isSwitching || isLoading;
  const displayError = localError || error;

  // Get display name for the trigger button
  const getDisplayName = () => {
    if (!currentModel) return "Select Model";
    // Truncate long model names
    return currentModel.length > 20
      ? `${currentModel.substring(0, 17)}...`
      : currentModel;
  };

  return (
    <DropdownMenu.Root modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger
        disabled={isDisabled}
        className={`group inline-flex max-h-12 items-center gap-1 rounded-md hover:bg-gray-800 bg-gray-900 border-gray-800 p-1 pr-2 text-gray-100 my-auto text-sm flex gap-1 pl-2 py-1 h-full items-center ${
          isDisabled ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {showLoading ? (
          <LoadingSpinner />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-300"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.29 7 12 12 20.71 7" />
            <line x1="12" y1="22" x2="12" y2="12" />
          </svg>
        )}
        <span className="max-w-[120px] truncate">{getDisplayName()}</span>
        <ChevronIcon />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 flex w-72 flex-col gap-0 overflow-hidden rounded text-gray-100 border border-gray-800 bg-gray-900 py-2 text-sm max-h-80 overflow-y-auto"
          sideOffset={5}
          collisionPadding={16}
        >
          {/* Loading state */}
          {isFetching && (
            <div className="flex items-center justify-center py-4 gap-2 text-gray-400">
              <LoadingSpinner />
              <span>Loading models...</span>
            </div>
          )}

          {/* Error state */}
          {displayError && !isFetching && (
            <div className="px-3 py-2 text-red-400 text-xs">
              {displayError}
            </div>
          )}

          {/* Empty state */}
          {!isFetching && !displayError && models.length === 0 && (
            <div className="px-3 py-4 text-gray-400 text-xs text-center">
              No models available
            </div>
          )}

          {/* Model list */}
          {!isFetching &&
            models.map((model) => {
              const isSelected = model.name === currentModel;
              const isSwitchingToThis =
                isSwitching && model.name !== currentModel;

              return (
                <DropdownMenu.Item
                  key={model.name}
                  onClick={() => handleSelectModel(model.name)}
                  disabled={isSwitching}
                  className={`flex max-w-full flex-row items-center gap-2 px-3 py-2 text-xs hover:bg-gray-800 cursor-pointer outline-none ${
                    isSwitching ? "opacity-50" : ""
                  } ${isSelected ? `text-${themeColor}-400` : ""}`}
                >
                  {/* Checkmark indicator */}
                  <div className="w-4 h-4 flex items-center flex-shrink-0">
                    {isSelected && <CheckIcon />}
                    {isSwitchingToThis && isSwitching && <LoadingSpinner />}
                  </div>

                  {/* Model name */}
                  <span className="flex-1 truncate font-medium">
                    {model.name}
                  </span>

                  {/* Model size */}
                  <span className="text-gray-500 text-xs flex-shrink-0">
                    {formatSize(model.size)}
                  </span>
                </DropdownMenu.Item>
              );
            })}

          {/* Switching indicator */}
          {isSwitching && (
            <div className="border-t border-gray-800 mt-2 pt-2 px-3 py-2 flex items-center gap-2 text-gray-400 text-xs">
              <LoadingSpinner />
              <span>Switching model...</span>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default ModelSelector;
