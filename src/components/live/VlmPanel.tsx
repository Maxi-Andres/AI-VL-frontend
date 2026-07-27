import {
  IconMessage,
  IconMessageOff,
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStopFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";

// Longer-side sizes (px) offered for the frame sent to the VLM; "Full" = native.
const VLM_IMG_SIZES = ["512", "768", "1024", "Full"];

/** Hands-free voice controls, produced by useVoiceAssistant. */
export interface VoiceControls {
  /** Wake-word listening (Web Speech) + recording are available in this browser. */
  micSupported: boolean;
  voiceMode: boolean;
  onToggleVoiceMode: () => void;
  /** Text-to-speech is available in this browser. */
  speechSupported: boolean;
  spokenMode: boolean;
  onToggleSpokenMode: () => void;
  /** Speak a short "thinking" filler when the answer is slow to start. */
  fillerMode: boolean;
  onToggleFillerMode: () => void;
  /** Status of the voice loop (e.g. "Listening for the wake word…"). */
  status: string;
  /** A TTS utterance is currently playing. */
  speaking: boolean;
  /** Manually read the current answer aloud / stop reading. */
  onSpeak: () => void;
  onStopSpeak: () => void;
  /** Available TTS voices (from the OS/browser) and the selected one. */
  voices: { uri: string; label: string }[];
  voiceURI: string | null;
  onVoiceChange: (uri: string) => void;
}

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
  /** Free-prompt text (controlled here so dictation can populate it). */
  prompt: string;
  /** Optional: longer-side px of the frame sent to the VLM (0 = native). Rendered
   * only when provided — the live camera page owns capture; the monitor mirrors
   * the phone's frames and has no say here. */
  imageMaxSize?: number;
  onImageMaxSizeChange?: (v: number) => void;
  onPromptChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onScopeChange: (v: string) => void;
  onVariantChange: (v: string) => void;
  onAsk: () => void;
  /** Ask a free-form question about the current frame (plain-text answer). */
  onAskPrompt: (prompt: string) => void;
  voice: VoiceControls;
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
  prompt,
  imageMaxSize,
  onImageMaxSizeChange,
  onPromptChange,
  onModelChange,
  onScopeChange,
  onVariantChange,
  onAsk,
  onAskPrompt,
  voice,
}: Props) {
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

      <Field label="Scope" inline>
        <Select
          options={scopes}
          value={scope}
          onChange={(e) => onScopeChange(e.target.value)}
        />
      </Field>

      <Field label="Prompt variant" inline>
        <Select
          options={variants}
          value={variant}
          onChange={(e) => onVariantChange(e.target.value)}
        />
      </Field>

      {imageMaxSize !== undefined && onImageMaxSizeChange && (
        <Field
          label="Image quality (VLM)"
          hint="Bigger = more detail but slower; smaller = faster answers."
          inline
        >
          <Select
            options={VLM_IMG_SIZES}
            value={imageMaxSize > 0 ? String(imageMaxSize) : "Full"}
            onChange={(e) =>
              onImageMaxSizeChange(
                e.target.value === "Full" ? 0 : parseInt(e.target.value, 10),
              )
            }
          />
        </Field>
      )}

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
        hint='A custom question about the current frame — answered in plain text. Turn on Voice to ask hands-free: say "robot", then your question.'
      >
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. What brand is the gauge? Is the reading within normal range?"
          rows={3}
          className="w-full resize-y rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs leading-[1.4]"
        />
      </Field>

      {/* Hands-free voice toggles: mic (wake word) + spoken answers. Compact so
          all three fit on one row; on/off is shown by the icon + color. The
          status sits on its own line below so it never pushes a button down. */}
      {(voice.micSupported || voice.speechSupported) && (
        <div className="mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {voice.micSupported && (
              <Button
                variant={voice.voiceMode ? "primary" : "secondary"}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                aria-pressed={voice.voiceMode}
                title={`Voice ${voice.voiceMode ? "on" : "off"}`}
                onClick={voice.onToggleVoiceMode}
              >
                {voice.voiceMode ? (
                  <IconMicrophone size={14} stroke={2} />
                ) : (
                  <IconMicrophoneOff size={14} stroke={2} />
                )}
                Voice
              </Button>
            )}
            {voice.speechSupported && (
              <Button
                variant={voice.spokenMode ? "primary" : "secondary"}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                aria-pressed={voice.spokenMode}
                title={`Speak ${voice.spokenMode ? "on" : "off"}`}
                onClick={voice.onToggleSpokenMode}
              >
                {voice.spokenMode ? (
                  <IconVolume size={14} stroke={2} />
                ) : (
                  <IconVolumeOff size={14} stroke={2} />
                )}
                Speak
              </Button>
            )}
            {voice.speechSupported && (
              <Button
                variant={voice.fillerMode ? "primary" : "secondary"}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                aria-pressed={voice.fillerMode}
                onClick={voice.onToggleFillerMode}
                title="Speak a short filler if the answer is slow to start (needs Speak on)"
              >
                {voice.fillerMode ? (
                  <IconMessage size={14} stroke={2} />
                ) : (
                  <IconMessageOff size={14} stroke={2} />
                )}
                Filler
              </Button>
            )}
          </div>
          {voice.status && (
            <span className="mt-1 block text-xs text-muted">{voice.status}</span>
          )}
        </div>
      )}

      {/* Pick the text-to-speech voice (list comes from the device). */}
      {voice.speechSupported && voice.voices.length > 0 && (
        <Field label="Voice" hint="Voices come from your device's system settings.">
          <select
            value={voice.voiceURI ?? ""}
            onChange={(e) => voice.onVoiceChange(e.target.value)}
            className="w-full rounded-md border border-line bg-bg p-1.5 text-fg focus:border-accent focus:outline-none"
          >
            <option value="">Default</option>
            {voice.voices.map((v) => (
              <option key={v.uri} value={v.uri}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Button
        variant="accent"
        className="w-full"
        disabled={!canAsk || busy || !prompt.trim()}
        onClick={() => onAskPrompt(prompt.trim())}
      >
        Ask this question
      </Button>

      <div className="mx-0 mt-2 mb-1 flex min-h-4 items-center justify-between gap-2 text-xs text-muted">
        <span>{status}</span>
        {voice.speechSupported && (
          <Button
            variant="secondary"
            className="inline-flex shrink-0 items-center gap-1 px-2 py-1 text-xs"
            disabled={!output.trim()}
            onClick={voice.speaking ? voice.onStopSpeak : voice.onSpeak}
          >
            {voice.speaking ? (
              <IconPlayerStopFilled size={14} />
            ) : (
              <IconVolume size={14} stroke={2} />
            )}
            {voice.speaking ? "Stop" : "Read aloud"}
          </Button>
        )}
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs leading-[1.4]">
        {output}
      </pre>
    </div>
  );
}
