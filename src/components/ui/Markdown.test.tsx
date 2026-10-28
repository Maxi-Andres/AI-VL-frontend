// The assistant's markdown shows formatted, and nothing in it can become HTML or a script link.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("Markdown", () => {
  it("shows **bold** as bold, not asterisks", () => {
    expect(html("**Lula da Silva ganó** en Brasil")).toContain("<strong>Lula da Silva ganó</strong> en Brasil");
  });
  it("makes lists, italics and https links", () => {
    const out = html("Fuentes:\n- *La Nación*\n- [ESPN](https://www.espn.com.ar/)");
    expect(out).toContain("<ul");
    expect(out).toContain("<em>La Nación</em>");
    expect(out).toContain('href="https://www.espn.com.ar/"');
  });
  it("never turns the text into HTML or a javascript link", () => {
    const out = html('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
    expect(out).not.toContain("<img");
    expect(out).not.toContain('href="javascript');
  });
  it("leaves a half-written ** of a streaming answer as it is", () => {
    expect(html("El dólar está a **1.5")).toContain("**1.5");
  });
});
