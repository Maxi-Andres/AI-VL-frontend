// Text as it should be SPOKEN: markdown removed.
//
// The VLM formats its answers in markdown (**bold**, "- " bullets, headings), and every
// voice — Piper, the browser's, the robot's speaker — reads the symbols out loud: "asterisco
// asterisco" in the middle of an answer (reported 2026-10-16). Asking the model for plain
// text was tried and made it worse at reading what it sees (a nameplate it read correctly
// became "Fluke" every time), so the text is cleaned here, right before it is spoken, for
// any model and any voice. The screen still shows the answer as the model wrote it.
// Emojis go too: "Mi mejor amigo es Mateo. 😊" was read out as "cara feliz" (2026-10-19).

/** `text` without markdown markup, ready for text-to-speech. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ") // code blocks: nothing worth hearing
    .replace(/`([^`]*)`/g, "$1") // inline code: keep the words
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) and images: keep the text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, "") // bullets and numbered items
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // **bold**, __bold__
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2") // *italic*, _italic_
    .replace(/\*+/g, "") // any asterisk left over (e.g. an unclosed **)
    .replace(/^\s*>\s?/gm, "") // block quotes
    // An ellipsis is a pause: a comma, or nothing before other punctuation ("eres...?").
    .replace(/(?:\.{2,}(?!\.)|…)\s*(?=[?!.,;:]|$)/g, "")
    .replace(/(?:\.{2,}|…)/g, ",")
    // emojis: pictographs, skin tones, flags, and the joiners/selectors that glue them together
    .replace(/\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|[\u{1F1E6}-\u{1F1FF}]|\uFE0F|\u200D|\u20E3/gu, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}
