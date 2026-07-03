import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPlayerStopFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";

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

      {/* Hands-free voice toggles: mic (wake word) + spoken answers. */}
      {(voice.micSupported || voice.speechSupported) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {voice.micSupported && (
            <Button
              variant={voice.voiceMode ? "primary" : "secondary"}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
              aria-pressed={voice.voiceMode}
              onClick={voice.onToggleVoiceMode}
            >
              {voice.voiceMode ? (
                <IconMicrophone size={16} stroke={2} />
              ) : (
                <IconMicrophoneOff size={16} stroke={2} />
              )}
              Voice {voice.voiceMode ? "on" : "off"}
            </Button>
          )}
          {voice.speechSupported && (
            <Button
              variant={voice.spokenMode ? "primary" : "secondary"}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
              aria-pressed={voice.spokenMode}
              onClick={voice.onToggleSpokenMode}
            >
              {voice.spokenMode ? (
                <IconVolume size={16} stroke={2} />
              ) : (
                <IconVolumeOff size={16} stroke={2} />
              )}
              Speak {voice.spokenMode ? "on" : "off"}
            </Button>
          )}
          {voice.status && (
            <span className="text-xs text-muted">{voice.status}</span>
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
