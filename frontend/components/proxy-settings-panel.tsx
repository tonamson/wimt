"use client";

import { CaretDown, Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelHeader } from "@/components/ui/panel";
import type { Settings } from "@/lib/types";

type Props = {
  baseUrl: string;
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  onSave: () => void;
  saving: boolean;
  status: string;
};

export function ProxySettingsPanel({
  baseUrl,
  settings,
  onSettingsChange,
  onSave,
  saving,
  status,
}: Props) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const openaiProxy = `${baseUrl}/v1`;
  const anthropicProxy = baseUrl;

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Panel className="min-w-0 overflow-hidden">
      <PanelHeader
        title="Proxy & upstreams"
        action={
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Collapse" : "Expand"}
            <CaretDown
              size={12}
              className={
                open
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
          </button>
        }
      />
      {open ? (
        <div className="grid min-w-0 gap-3 p-3">
          <ProxyLine
            label="OpenAI / Codex"
            value={openaiProxy}
            copied={copied === "openai-proxy"}
            onCopy={() => void copyValue(openaiProxy, "openai-proxy")}
          />
          <ProxyLine
            label="Claude / Anthropic (via Headroom)"
            value={anthropicProxy}
            copied={copied === "anthropic-proxy"}
            onCopy={() => void copyValue(anthropicProxy, "anthropic-proxy")}
          />

          <div className="grid min-w-0 gap-2 border-t border-[var(--border)] pt-3">
            <label className="grid min-w-0 gap-1 text-xs text-[var(--text-muted)]">
              OpenAI upstream
              <Input
                mono
                value={settings.openaiUpstreamBaseUrl}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    openaiUpstreamBaseUrl: event.target.value,
                  })
                }
                aria-label="OpenAI upstream"
                className="min-w-0"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-[var(--text-muted)]">
              Anthropic upstream
              <Input
                mono
                value={settings.anthropicUpstreamBaseUrl}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    anthropicUpstreamBaseUrl: event.target.value,
                  })
                }
                aria-label="Anthropic upstream"
                className="min-w-0"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
              {status ? (
                <p
                  className={`text-xs font-medium ${
                    status === "Saved"
                      ? "text-[var(--success-fg)]"
                      : "text-[var(--danger-fg)]"
                  }`}
                >
                  {status}
                </p>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] p-2">
            <p className="break-all font-mono text-[10px] leading-relaxed text-[var(--text-muted)]">
              export OPENAI_BASE_URL={openaiProxy}
              <br />
              export ANTHROPIC_BASE_URL={anthropicProxy}
            </p>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function ProxyLine({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-[var(--text-muted)]">
          {label}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent)]"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="block min-w-0 break-all rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5 font-mono text-[11px] leading-snug text-[var(--accent)]">
        {value}
      </code>
    </div>
  );
}
