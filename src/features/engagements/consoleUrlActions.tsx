import { useState } from "react";
import { Link2 } from "lucide-react";

export function consoleUrlForEngagement(engagementId: number): string {
  return `${window.location.origin}/engagements/${engagementId}/console`;
}

export function ConsoleUrlActions({ engagementId }: { engagementId: number }) {
  const [copied, setCopied] = useState(false);
  const url = consoleUrlForEngagement(engagementId);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-1">
      <code className="text-xs bg-zinc-100 px-2 py-1.5 rounded break-all text-zinc-700">{url}</code>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-medium"
        >
          {copied ? "Copied" : "Copy URL"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800"
        >
          <Link2 className="w-3.5 h-3.5" />
          Open Console
        </a>
      </div>
    </div>
  );
}
