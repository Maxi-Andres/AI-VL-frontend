// Sentence-by-sentence speech queue for streamed answers.
//
// The VLM answer arrives token by token; feeding whole sentences to TTS as soon
// as they complete lets playback start almost immediately instead of after the
// full answer. Text is pushed in via push(); the queue slices it at sentence
// boundaries, synthesizes each sentence with the injected `synth` (Piper or the
// browser), and plays them strictly in order. cancel() stops playback at once
// (used for the "robot" barge-in).

/** One prepared, playable sentence. */
export interface Player {
  /** Play to the end; resolves when finished. */
  play: () => Promise<void>;
  /** Stop immediately (pause audio / cancel utterance). */
  stop: () => void;
}

export type Synth = (text: string) => Promise<Player>;

interface Hooks {
  onStart?: () => void;
  onDone?: () => void;
}

/** True at index i if a sentence ends there — but not on a decimal point like
 * "12.5" (avoids chopping numbers mid-answer). */
function isBoundary(buf: string, i: number): boolean {
  const c = buf[i];
  if (c === "\n" || c === "!" || c === "?" || c === ";") return true;
  if (c === ".") {
    const prev = buf[i - 1];
    const next = buf[i + 1]; // undefined if the '.' is the last char so far
    if (prev && /\d/.test(prev) && (next === undefined || /\d/.test(next)))
      return false; // decimal (or possibly-decimal at the buffer edge) -> wait
    return true;
  }
  return false;
}

export class SpeechQueue {
  private buffer = "";
  private sentences: string[] = [];
  private playing = false;
  private ended = false;
  private cancelled = false;
  private current: Player | null = null;

  constructor(
    private synth: Synth,
    private hooks: Hooks = {},
  ) {}

  /** Feed a chunk of freshly generated text. */
  push(delta: string): void {
    if (this.cancelled) return;
    this.buffer += delta;
    this.segment();
    void this.pump();
  }

  /** No more text will arrive: flush the trailing partial sentence and finish. */
  end(): void {
    if (this.cancelled) return;
    this.ended = true;
    const rest = this.buffer.trim();
    if (rest) this.sentences.push(rest);
    this.buffer = "";
    void this.pump();
  }

  /** Stop everything now (barge-in / mode off). */
  cancel(): void {
    this.cancelled = true;
    this.sentences = [];
    this.buffer = "";
    this.current?.stop();
    this.current = null;
  }

  private segment(): void {
    let cut = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (isBoundary(this.buffer, i)) {
        const s = this.buffer.slice(cut, i + 1).trim();
        if (s) this.sentences.push(s);
        cut = i + 1;
      }
    }
    if (cut > 0) this.buffer = this.buffer.slice(cut);
  }

  private async pump(): Promise<void> {
    if (this.playing || this.cancelled) return;
    this.playing = true;
    this.hooks.onStart?.();
    try {
      while (this.sentences.length && !this.cancelled) {
        const sentence = this.sentences.shift() as string;
        let player: Player;
        try {
          player = await this.synth(sentence);
        } catch {
          continue; // skip a sentence that failed to synthesize
        }
        if (this.cancelled) {
          player.stop();
          break;
        }
        this.current = player;
        await player.play();
        this.current = null;
      }
    } finally {
      this.playing = false;
      // If more text landed while we were finishing, keep going.
      if (this.sentences.length && !this.cancelled) {
        void this.pump();
      } else if (this.ended && !this.cancelled) {
        // Nothing left AND the stream is closed -> we're done speaking.
        this.hooks.onDone?.();
      }
      // else: stream still open, just waiting for the next sentence.
    }
  }
}
