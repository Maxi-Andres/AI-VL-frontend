// Sentence-by-sentence speech queue for streamed answers.
//
// The VLM answer arrives token by token; feeding whole sentences to TTS as soon
// as they complete lets playback start almost immediately instead of after the
// full answer. Text is pushed in via push(); the queue slices it at sentence
// boundaries, synthesizes each sentence with the injected `synth` (Piper or the
// browser), and plays them strictly in order. The NEXT sentence is synthesized
// while the current one plays: waiting for it after the current one ended left a
// gap at every full stop as long as the voice's synthesis plus the round trip —
// ~0.5 s with Kokoro (2026-10-16), where Piper's 0.1 s had hidden it. cancel() stops playback at once
// (used for the "robot" barge-in). Each sentence is cleaned of markdown first
// (lib/speakable.ts); one left empty, like a lone "1." of a list, is skipped.

import { speakable } from "./speakable";

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
  /** Speak at most this many sentences; the rest is dropped (it is still on screen). */
  maxSentences?: number;
}

/** True at index i if a sentence ends there — but not on a decimal point like
 * "12.5" (avoids chopping numbers mid-answer), nor on the "1." that opens a list
 * item (it stays with its item, and speakable() drops it; cut alone it was read
 * out as "uno"). */
function isBoundary(buf: string, i: number): boolean {
  const c = buf[i];
  if (c === "\n" || c === "!" || c === "?" || c === ";") return true;
  if (c === ".") {
    const prev = buf[i - 1];
    const next = buf[i + 1]; // undefined if the '.' is the last char so far
    // "Hola... ¿cómo estás?" — an ellipsis is a pause inside the sentence (speakable() makes it
    // a comma), not three ends of it: each dot used to become its own "sentence".
    if (next === "." || prev === ".") return false;
    if (prev && /\d/.test(prev) && (next === undefined || /\d/.test(next)))
      return false; // decimal (or possibly-decimal at the buffer edge) -> wait
    if (next === " " && /(^|\n)\s*\d+$/.test(buf.slice(0, i))) return false; // list item
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
  private accepted = 0;
  /** The sentence after the current one, already being synthesized. */
  private prefetched: Promise<Player | null> | null = null;

  constructor(
    private synth: Synth,
    private hooks: Hooks = {},
  ) {}

  /** Feed a chunk of freshly generated text. */
  push(delta: string): void {
    if (this.cancelled) return;
    this.buffer += delta;
    this.segment();
    if (this.playing) this.prefetch();
    void this.pump();
  }

  /** No more text will arrive: flush the trailing partial sentence and finish. */
  end(): void {
    if (this.cancelled) return;
    this.ended = true;
    const rest = speakable(this.buffer);
    if (rest) this.accept(rest);
    this.buffer = "";
    if (this.playing) this.prefetch();
    void this.pump();
  }

  /** Stop everything now (barge-in / mode off). */
  cancel(): void {
    this.cancelled = true;
    this.sentences = [];
    const ahead = this.prefetched;
    this.prefetched = null;
    void ahead?.then((p) => p?.stop());
    this.buffer = "";
    this.current?.stop();
    this.current = null;
  }

  private segment(): void {
    let cut = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (isBoundary(this.buffer, i)) {
        const s = speakable(this.buffer.slice(cut, i + 1));
        if (s) this.accept(s);
        cut = i + 1;
      }
    }
    if (cut > 0) this.buffer = this.buffer.slice(cut);
  }

  /** Queue a sentence, unless the maxSentences cap is already reached. */
  private accept(sentence: string): void {
    if (this.hooks.maxSentences !== undefined && this.accepted >= this.hooks.maxSentences) return;
    this.accepted += 1;
    this.sentences.push(sentence);
  }

  /** Start synthesizing the next sentence, if there is one and none is in flight. */
  private prefetch(): void {
    if (this.prefetched || this.cancelled || !this.sentences.length) return;
    const sentence = this.sentences.shift() as string;
    // A sentence that fails to synthesize is skipped (null), not fatal.
    this.prefetched = this.synth(sentence).catch(() => null);
  }

  private async pump(): Promise<void> {
    if (this.playing || this.cancelled) return;
    this.playing = true;
    this.hooks.onStart?.();
    try {
      this.prefetch();
      while (this.prefetched && !this.cancelled) {
        const player = await this.prefetched;
        this.prefetched = null;
        this.prefetch(); // synthesize the next one while this one plays
        if (!player) continue;
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
      if ((this.sentences.length || this.prefetched) && !this.cancelled) {
        void this.pump();
      } else if (this.ended && !this.cancelled) {
        // Nothing left AND the stream is closed -> we're done speaking.
        this.hooks.onDone?.();
      }
      // else: stream still open, just waiting for the next sentence.
    }
  }
}
