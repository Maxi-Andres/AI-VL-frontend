import { useCallback, useRef, useState } from "react";

/**
 * Microphone capture for dictating the VLM prompt. Two modes:
 *  - start()/stop(): manual press-to-talk (start recording, stop and get the Blob).
 *  - recordUtterance(): hands-free single utterance — records and stops ON ITS OWN
 *    when the speaker goes quiet (voice-activity detection), used by the wake-word
 *    voice assistant after it hears "robot".
 *
 * getUserMedia + MediaRecorder need a secure context (HTTPS or localhost), which
 * the phone/HTTPS deploy already provides. The mime type is chosen from what the
 * browser supports: Chrome/Android records webm/opus, iOS Safari records mp4/aac —
 * faster-whisper decodes either, so we just pick the first supported one.
 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

interface UtteranceOptions {
  /** Trailing silence (ms) that ends the utterance once speech has started. */
  silenceMs?: number;
  /** Hard cap on the whole utterance (ms). */
  maxMs?: number;
  /** If no speech is heard within this window (ms), give up and resolve null. */
  startTimeoutMs?: number;
  /** RMS threshold (0..1) above which a frame counts as speech. */
  threshold?: number;
}

export function useAudioRecorder() {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      setError(`Microphone error: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  }, []);

  /** Stop a manual recording and resolve with the recorded clip as a Blob. */
  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const recorder = recorderRef.current;
      if (!recorder) {
        reject(new Error("Not recording"));
        return;
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  /**
   * Record ONE utterance hands-free: start capturing, wait for the speaker to
   * begin, then stop automatically after a short trailing silence. Resolves with
   * the recorded Blob, or null if nothing was said before the start timeout.
   */
  const recordUtterance = useCallback(
    ({
      silenceMs = 900,
      maxMs = 12000,
      startTimeoutMs = 6000,
      threshold = 0.02,
    }: UtteranceOptions = {}): Promise<Blob | null> => {
      return new Promise(async (resolve, reject) => {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
          setError(
            `Microphone error: ${e instanceof Error ? e.message : String(e)}`,
          );
          reject(e);
          return;
        }
        streamRef.current = stream;

        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        recorderRef.current = recorder;
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        // Voice-activity detection over the same stream.
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const audioCtx = new AudioCtx();
        void audioCtx.resume();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        const t0 = Date.now();
        let speechStarted = false;
        let lastLoud = t0;
        let poll: ReturnType<typeof setInterval> | null = null;
        let settled = false;

        const cleanup = () => {
          if (poll) clearInterval(poll);
          poll = null;
          source.disconnect();
          void audioCtx.close();
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          recorderRef.current = null;
          setRecording(false);
        };

        recorder.onstop = () => {
          if (settled) return;
          settled = true;
          const type = recorder.mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });
          cleanup();
          // If we never actually heard speech, tell the caller (resolve null).
          resolve(speechStarted ? blob : null);
        };

        const finish = () => {
          if (recorder.state !== "inactive") recorder.stop();
        };

        recorder.start();
        setRecording(true);

        poll = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const now = Date.now();

          if (rms >= threshold) {
            speechStarted = true;
            lastLoud = now;
          }
          if (now - t0 >= maxMs) return finish();
          if (!speechStarted) {
            if (now - t0 >= startTimeoutMs) return finish(); // nobody spoke
          } else if (now - lastLoud >= silenceMs) {
            return finish(); // trailing silence -> utterance complete
          }
        }, 60);
      });
    },
    [],
  );

  return { recording, error, supported, start, stop, recordUtterance };
}
