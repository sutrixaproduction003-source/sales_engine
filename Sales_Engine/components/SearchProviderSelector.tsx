import React from "react";
import { AVAILABLE_PROVIDERS, SEARCH_PROVIDERS } from "@/lib/searchProviders";
import type { SearchProvider } from "@/lib/searchProviders";
import { Select } from "@/components/ui";
import { Check, AlertCircle } from "lucide-react";

interface SearchProviderSelectorProps {
  selectedProvider: SearchProvider;
  onProviderChange: (provider: SearchProvider) => void;
  showDescription?: boolean;
  layout?: "dropdown" | "tabs";
}

export function SearchProviderSelector({
  selectedProvider,
  onProviderChange,
  showDescription = false,
  layout = "dropdown",
}: SearchProviderSelectorProps) {
  if (layout === "tabs") {
    return (
      <div className="flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-700">Search Tool</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_PROVIDERS.map((provider) => {
            const config = SEARCH_PROVIDERS[provider];
            const isSelected = selectedProvider === provider;

            return (
              <button
                key={provider}
                onClick={() => onProviderChange(provider)}
                className={`
                  px-4 py-2 rounded-lg border-2 transition-all font-medium text-sm
                  ${
                    isSelected
                      ? "border-blue-600 bg-blue-50 text-blue-900"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }
                  flex items-center gap-2
                `}
              >
                {isSelected && <Check className="h-4 w-4" />}
                {config.label}
              </button>
            );
          })}
        </div>
        {showDescription && (
          <p className="text-xs text-slate-600">
            {SEARCH_PROVIDERS[selectedProvider].description}
          </p>
        )}
      </div>
    );
  }

  // Dropdown layout
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="search-provider" className="text-sm font-medium text-slate-700">
        Search Tool
      </label>
      <div className="flex items-center gap-2">
        <Select
          id="search-provider"
          value={selectedProvider}
          onChange={(e) => onProviderChange(e.target.value as SearchProvider)}
          className="flex-1"
        >
          {AVAILABLE_PROVIDERS.map((provider) => (
            <option key={provider} value={provider}>
              {SEARCH_PROVIDERS[provider].label}
            </option>
          ))}
        </Select>
        {selectedProvider === "duckduckgo" && (
          <div
            className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs"
            title="Free OSINT tool - no API key required"
          >
            <AlertCircle className="h-3 w-3" />
            <span>Free</span>
          </div>
        )}
      </div>
      {showDescription && (
        <p className="text-xs text-slate-600">
          {SEARCH_PROVIDERS[selectedProvider].description}
        </p>
      )}
    </div>
  );
}

export function ProviderBadge({ provider }: { provider: SearchProvider }) {
  const config = SEARCH_PROVIDERS[provider];
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
        ${
          provider === "duckduckgo"
            ? "bg-green-100 text-green-800"
            : "bg-blue-100 text-blue-800"
        }
      `}
    >
      {config?.label || provider}
    </span>
  );
}
