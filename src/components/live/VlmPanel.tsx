import { useState } from "react";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";

interface Props {
  models: string[];
  scopes: string[];
  variants: string[];
  model: string;
  scope: string;
  variant: string;
  canAsk: boolean;
  busy: boolean;
  status: string;
  output: string;
  onModelChange: (v: string) => void;
  onScopeChange: (v: string) => void;
  onVariantChange: (v: string) => void;
  onAsk: () => void;
  /** Ask a free-form question about the current frame (plain-text answer). */
  onAskPrompt: (prompt: string) => void;
}

/** On-demand VLM controls and output. */
export function VlmPanel({
  models,
  scopes,
  variants,
  model,
  scope,
  variant,
  canAsk,
  busy,
  status,
  output,
  onModelChange,
  onScopeChange,
  onVariantChange,
  onAsk,
  onAskPrompt,
}: Props) {
  const [customPrompt, setCustomPrompt] = useState("");
  return (
    <div>
      <h2 className="m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">
        VLM (on demand)
      </h2>

      <Field label="Model">
        <Select
          options={models}
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        />
      </Field>

      <Field label="Scope">
        <Select
          options={scopes}
          value={scope}
          onChange={(e) => onScopeChange(e.target.value)}
        />
      </Field>

      <Field label="Prompt variant">
        <Select
          options={variants}
          value={variant}
          onChange={(e) => onVariantChange(e.target.value)}
        />
      </Field>

      <Button
        variant="accent"
        className="w-full"
        disabled={!canAsk || busy}
        onClick={onAsk}
      >
        Ask VLM about current frame
      </Button>

      <Field
        label="Ask anything (free prompt)"
        hint="A custom question about the current frame — answered in plain text."
      >
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g. What brand is the gauge? Is the reading within normal range?"
          rows={3}
          className="w-full resize-y rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs leading-[1.4]"
        />
      </Field>
      <Button
        variant="accent"
        className="w-full"
        disabled={!canAsk || busy || !customPrompt.trim()}
        onClick={() => onAskPrompt(customPrompt.trim())}
      >
        Ask this question
      </Button>

      <div className="mx-0 mt-2 mb-1 min-h-4 text-xs text-muted">{status}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs leading-[1.4]">
        {output}
      </pre>
    </div>
  );
}
