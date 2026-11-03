// Server-Sent Events read off a fetch body. EventSource cannot POST, so a stream that answers a
// POST (/api/agent) is read with a body reader and cut into events here.

/** One event: its name (`event:` line, "message" when it has none) and its data lines joined. */
export interface SseMessage {
  event: string;
  data: string;
}

/**
 * An incremental parser: feed it text as it arrives, in whatever pieces the network cut it
 * into, and it hands back each event once its blank line has arrived. An event cut across
 * chunks waits in the buffer until the rest comes. Comment lines (`:`) and unknown fields
 * (`id:`, `retry:`) are skipped, as the SSE spec says.
 */
export class SseParser {
  private buf = "";

  push(text: string): SseMessage[] {
    // \r\n and lone \r are line ends too; normalised so one rule cuts the blocks.
    this.buf = (this.buf + text).replace(/\r\n?/g, "\n");
    const out: SseMessage[] = [];
    for (;;) {
      const end = this.buf.indexOf("\n\n");
      if (end < 0) break;
      const block = this.buf.slice(0, end);
      this.buf = this.buf.slice(end + 2);
      const msg = parseBlock(block);
      if (msg) out.push(msg);
    }
    return out;
  }

  /** The stream closed: an event left without its blank line still counts. */
  flush(): SseMessage[] {
    const rest = this.buf;
    this.buf = "";
    const msg = rest.trim() ? parseBlock(rest) : null;
    return msg ? [msg] : [];
  }
}

function parseBlock(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (!data.length && event === "message") return null;
  return { event, data: data.join("\n") };
}
