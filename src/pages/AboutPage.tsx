import { BACKEND_URL } from "../config";

/** Static info page — documents the app and its single network boundary. */
export function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl p-6 leading-relaxed">
      <h2 className="mt-0 text-lg font-semibold">About</h2>
      <p className="text-muted">
        Minimalist browser UI for the live-video PoC. It captures the webcam,
        streams JPEG frames over a WebSocket to the <strong>backend</strong>{" "}
        gateway, draws the returned boxes over the video, and can ask the VLM
        about the current frame on demand.
      </p>
      <p className="text-muted">
        The frontend talks <strong>only</strong> to the backend — it never knows
        the iacore service exists. It is currently pointed at:
      </p>
      <pre className="rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs text-fg">
        {BACKEND_URL}
      </pre>
      <p className="text-muted">
        To change it, edit <code>public/config.js</code> (read at runtime, no
        rebuild) or set <code>VITE_BACKEND_URL</code> at build time.
      </p>
    </main>
  );
}
