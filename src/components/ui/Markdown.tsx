import type { ReactNode } from "react";

// The assistant's answers as they were meant to look: the model writes markdown (**bold**,
// "- " lists, headings) and the chat showed the asterisks (2026-10-28). Only the small part of
// markdown the model uses, built as React elements — never HTML from the text — so an answer
// can format itself but cannot inject anything. Links only for http(s). Speech has its own
// clean-up (lib/speakable.ts).

const INLINE =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*[^*\s\n][^*\n]*\*|(?<![\w])_[^_\s\n][^_\n]*_(?![\w]))/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${i++}`;
    if (tok.startsWith("**") || tok.startsWith("__")) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-panel px-1 font-mono text-[12px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const close = tok.indexOf("](");
      out.push(
        <a key={k} href={tok.slice(close + 2, -1)} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-accent underline underline-offset-2">{tok.slice(1, close)}</a>,
      );
    } else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    last = at + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; text: string };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = out[out.length - 1];
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) body.push(lines[i]);
      out.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] }); // a break: the next line starts a new block
      continue;
    }
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*+•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) out.push({ kind: "h", text: heading[1] });
    else if (bullet) {
      if (prev?.kind === "ul") prev.items.push(bullet[1]);
      else out.push({ kind: "ul", items: [bullet[1]] });
    } else if (numbered) {
      if (prev?.kind === "ol") prev.items.push(numbered[1]);
      else out.push({ kind: "ol", items: [numbered[1]] });
    } else if (quote) {
      if (prev?.kind === "quote") prev.lines.push(quote[1]);
      else out.push({ kind: "quote", lines: [quote[1]] });
    } else if (prev?.kind === "p" && prev.lines.length) prev.lines.push(line);
    else out.push({ kind: "p", lines: [line] });
  }
  return out.filter((b) => !(b.kind === "p" && !b.lines.length));
}

function withBreaks(lines: string[], key: string): ReactNode[] {
  return lines.flatMap((l, i) => (i ? [<br key={`${key}-br${i}`} />, ...inline(l, `${key}-${i}`)] : inline(l, `${key}-${i}`)));
}

/** `text` (the model's markdown) as formatted text. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid gap-1.5 [overflow-wrap:anywhere]">
      {blocks(text).map((b, i) => {
        const k = `b${i}`;
        switch (b.kind) {
          case "h":
            return <p key={k} className="m-0 font-bold">{inline(b.text, k)}</p>;
          case "ul":
            return <ul key={k} className="m-0 grid gap-0.5 pl-4">{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</ul>;
          case "ol":
            return <ol key={k} className="m-0 grid gap-0.5 pl-5">{b.items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>)}</ol>;
          case "quote":
            return <p key={k} className="m-0 border-l-2 border-line pl-2 text-muted">{withBreaks(b.lines, k)}</p>;
          case "code":
            return <pre key={k} className="m-0 overflow-x-auto rounded-lg bg-panel p-2 font-mono text-[12px]">{b.text}</pre>;
          default:
            return <p key={k} className="m-0">{withBreaks(b.lines, k)}</p>;
        }
      })}
    </div>
  );
}
