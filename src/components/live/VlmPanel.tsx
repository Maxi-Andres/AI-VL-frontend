import {
  IconMessage,
  IconMessageOff,
  IconMicrophone,
  IconMicrophone2,
  IconMicrophone2Off,
  IconMicrophoneOff,
  IconPlayerStopFilled,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { StatusText } from "../ui/StatusText";

// Longer-side sizes (px) offered for the frame sent to the VLM; "Full" = native. Nothing
// below 1152: the VLM server upscales every image to at least 1024 tokens of 32x32 px (~1 Mpx,
// llamacpp_image_min_tokens, and Ollama does the same), so a smaller frame costs the SAME time
// and only loses detail. Measured 2026-10-19: 320-1152 px all ~1060-1100 tokens in 0.82 s, and
// a nameplate read "Fluke" at 512, "Crauvin" at 768, "Chauvin Arnoux" from 1024 up; 1600 px
// cost 1.1-1.5 s.
export const VLM_IMG_SIZES = ["1152", "1600", "Full"];
export const VLM_IMG_DEFAULT = 1152;

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
  /** The selected robot has its own microphone the app can listen through (the G1). */
  robotMic: boolean;
  /** Listening through it, Alexa-style, for "Bender, …". On = the robot's mic is on. */
  robotEar: boolean;
  onToggleRobotEar: () => void;
  /** One line about the robot's mic ("listening for Bender", what it heard, why it stopped). */
  robotEarStatus: string;
  /** A TTS utterance is currently playing. */
  speaking: boolean;
  /** Manually read the current answer aloud / stop reading. */
  onSpeak: () => void;
  onStopSpeak: () => void;
  /** Available TTS voices (the server's; the browser's only if the server has none). */
  voices: { uri: string; label: string }[];
  voiceURI: string | null;
  onVoiceChange: (uri: string) => void;
  /** Where spoken answers come out: this browser or the robot's own speaker. */
  speechOutput: "browser" | "robot";
  onSpeechOutputChange: (output: "browser" | "robot") => void;
  /** The selected robot has a speaker the app can drive (the Go2 today). */
  robotSpeaker: boolean;
  /** Why the last sentence did not play on the robot. */
  robotSpeakerError: string | null;
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
          hint="1152 costs nothing extra (the VLM never looks at less); bigger reads small print better but answers slower."
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
          className="w-full resize-y rounded-md border border-line bg-sunken p-2 font-mono text-xs leading-[1.4]"
        />
      </Field>

      {/* Hands-free voice toggles: mic (wake word) + spoken answers. Compact so
          all three fit on one row; on/off is shown by the icon + color. The
          status sits on its own line below so it never pushes a button down. */}
      {(voice.micSupported || voice.speechSupported || voice.robotMic) && (
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
            {voice.robotMic && (
              <Button
                variant={voice.robotEar ? "primary" : "secondary"}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                aria-pressed={voice.robotEar}
                title={`The robot's own microphone ${voice.robotEar ? "on" : "off"}: say "Bender, …"`}
                onClick={voice.onToggleRobotEar}
              >
                {voice.robotEar ? (
                  <IconMicrophone2 size={14} stroke={2} />
                ) : (
                  <IconMicrophone2Off size={14} stroke={2} />
                )}
                Robot mic
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
          {voice.robotEarStatus && (
            <span className="mt-1 block text-xs text-muted">{voice.robotEarStatus}</span>
          )}
        </div>
      )}

      {/* Where the spoken answer comes out. Only offered where the robot has a speaker. */}
      {voice.speechSupported && voice.robotSpeaker && (
        <Field label="Speak through" hint="The robot's own speaker plays the same neural voice.">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={voice.speechOutput === "browser" ? "primary" : "secondary"}
              onClick={() => voice.onSpeechOutputChange("browser")}
            >
              This device
            </Button>
            <Button
              variant={voice.speechOutput === "robot" ? "primary" : "secondary"}
              onClick={() => voice.onSpeechOutputChange("robot")}
            >
              Robot
            </Button>
            {voice.speechOutput === "robot" && voice.robotSpeakerError && (
              <StatusText
                status={{ tone: "warn", text: voice.robotSpeakerError }}
                className="text-xs text-muted"
              />
            )}
          </div>
        </Field>
      )}

      {/* Pick the text-to-speech voice: the server's Piper and Kokoro voices, shared by the
          whole app (Drive's robot speaker uses it too). */}
      {voice.speechSupported && voice.voices.length > 0 && (
        <Field label="Voice" hint="Made on the server; also used by the robot speaker on Drive.">
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
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-sunken p-2 font-mono text-xs leading-[1.4]">
        {output}
      </pre>
    </div>
  );
}
