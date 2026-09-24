import { AVAILABLE_PROVIDERS, SEARCH_PROVIDERS } from "@/lib/searchProviders";
import type { SearchProvider } from "@/lib/searchProviders";
import { Select } from "@/components/ui";

interface SearchProviderSelectorProps {
  selectedProvider: SearchProvider;
  onProviderChange: (provider: SearchProvider) => void;
  showDescription?: boolean;
}

export function SearchProviderSelector({
  selectedProvider,
  onProviderChange,
  showDescription = false,
}: SearchProviderSelectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="search-provider" className="text-sm font-medium text-slate-300">
        Search Tool
      </label>
      <Select
        id="search-provider"
        value={selectedProvider}
        onChange={(e) => onProviderChange(e.target.value as SearchProvider)}
        className="!w-full"
      >
        {AVAILABLE_PROVIDERS.map((provider) => (
          <option key={provider} value={provider}>
            {SEARCH_PROVIDERS[provider].label}
          </option>
        ))}
      </Select>
      {showDescription && <p className="text-xs text-slate-400">{SEARCH_PROVIDERS[selectedProvider].description}</p>}
    </div>
  );
}

export function ProviderBadge({ provider }: { provider: SearchProvider }) {
  const linkBased = SEARCH_PROVIDERS[provider]?.kind === "link";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
        linkBased ? "bg-sky-500/15 text-sky-300" : "bg-indigo-500/15 text-indigo-300"
      }`}
    >
      {SEARCH_PROVIDERS[provider]?.label || provider}
    </span>
  );
}
