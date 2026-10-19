import { describe, expect, it } from "vitest";
import { SpeechQueue, type Player } from "./speechQueue";
import { speakable } from "./speakable";

describe("speakable", () => {
  it("drops the markdown the VLM answered with on 2026-10-16", () => {
    // Catches: every voice reading "asterisco asterisco" and the bullet dashes out loud.
    const answer =
      "El hombre está haciendo dos gestos:\n\n" +
      '- Con una mano: **"me gusta"** (pulgar hacia arriba).\n' +
      '- Con la otra mano: **"V" o "peace sign"**.';
    const out = speakable(answer);
    expect(out).not.toMatch(/[*#]/);
    expect(out).not.toMatch(/^-/m);
    expect(out).toContain('Con una mano: "me gusta" (pulgar hacia arriba).');
  });

  it("keeps what is said and only removes the markup", () => {
    expect(speakable("La marca es **CHAUVIN ARNOUX**, modelo `C.A 8220`.")).toBe(
      "La marca es CHAUVIN ARNOUX, modelo C.A 8220.",
    );
    expect(speakable("## Resultado\n1. Abrir\n2. Cerrar")).toBe("Resultado\nAbrir\nCerrar");
    expect(speakable("Mirá [el manual](https://example.com) y *despacio*.")).toBe(
      "Mirá el manual y despacio.",
    );
  });

  it("drops emojis instead of reading their names", () => {
    // Catches: "😊" spoken as "cara feliz" and "🤝" as "apretón de manos" (2026-10-19).
    expect(speakable("Mi mejor amigo es Mateo. 😊")).toBe("Mi mejor amigo es Mateo.");
    expect(speakable("Trabajo en Silk Technologies 🤖🤝 y mido 130 cm 👍🏽")).toBe(
      "Trabajo en Silk Technologies y mido 130 cm",
    );
    expect(speakable("¡Hola! ¿Qué tal? Sí, el 1.º es ✓ correcto")).toBe("¡Hola! ¿Qué tal? Sí, el 1.º es ✓ correcto");
  });

  it("turns an ellipsis into a pause instead of reading the dots", () => {
    expect(speakable("Hola... ¿cómo estás?")).toBe("Hola, ¿cómo estás?");
    expect(speakable("Bueno… eso")).toBe("Bueno, eso");
    expect(speakable("¿Quién eres...?")).toBe("¿Quién eres?");
    expect(speakable("Mmm...")).toBe("Mmm");
  });

  it("leaves numbers, decimals and plain text alone", () => {
    expect(speakable("Marca 17.84 kW a las 3.")).toBe("Marca 17.84 kW a las 3.");
    expect(speakable("snake_case_name y a_b")).toBe("snake_case_name y a_b");
  });
});

describe("SpeechQueue speaks clean sentences", () => {
  it("keeps a list number with its item instead of speaking it alone", async () => {
    // Catches: "1." of a numbered list cut as its own sentence and spoken as "uno".
    const said: string[] = [];
    const synth = async (t: string): Promise<Player> => {
      said.push(t);
      return { play: async () => {}, stop: () => {} };
    };
    const done = new Promise<void>((res) => {
      const q = new SpeechQueue(synth, { onDone: res });
      q.push("Veo dos cosas:\n1. **Una silla**.\n2. Una ");
      q.push("*mesa*.");
      q.end();
    });
    await done;
    expect(said).toEqual(["Veo dos cosas:", "Una silla.", "Una mesa."]);
  });

  it("still speaks an answer that is only a number", async () => {
    // Catches: "2." — the whole answer to "how many people?" — being dropped as a list marker.
    const said: string[] = [];
    const synth = async (t: string): Promise<Player> => {
      said.push(t);
      return { play: async () => {}, stop: () => {} };
    };
    await new Promise<void>((res) => {
      const q = new SpeechQueue(synth, { onDone: res });
      q.push("2.");
      q.end();
    });
    expect(said).toEqual(["2."]);
  });

  it("keeps an ellipsis inside its sentence", async () => {
    // Catches: every dot of "..." cut as the end of a sentence (2026-10-19).
    const said: string[] = [];
    const synth = async (t: string): Promise<Player> => {
      said.push(t);
      return { play: async () => {}, stop: () => {} };
    };
    await new Promise<void>((res) => {
      const q = new SpeechQueue(synth, { onDone: res });
      q.push("Hola..");
      q.push(". ¿cómo estás? Bien.");
      q.end();
    });
    expect(said).toEqual(["Hola, ¿cómo estás?", "Bien."]);
  });

  it("says a whole list, and cuts a long answer after the word budget with a notice", async () => {
    // Catches: a cap counted in sentences cutting "En la mesa veo: - un monitor. - una laptop…"
    // after its second item (2026-10-19) — every list item is a sentence.
    const run = async (text: string) => {
      const said: string[] = [];
      const synth = async (t: string): Promise<Player> => {
        said.push(t);
        return { play: async () => {}, stop: () => {} };
      };
      await new Promise<void>((res) => {
        const q = new SpeechQueue(synth, { onDone: res, maxWords: 12, cutNotice: "El resto en pantalla." });
        q.push(text);
        q.end();
      });
      return said;
    };
    expect(await run("Veo:\n- Un monitor.\n- Una laptop.\n- Una botella.\n- Una silla.")).toEqual([
      "Veo:", "Un monitor.", "Una laptop.", "Una botella.", "Una silla.",
    ]);
    expect(await run("Uno dos tres cuatro cinco. Seis siete ocho nueve diez once. Doce trece. Catorce.")).toEqual([
      "Uno dos tres cuatro cinco.", "Seis siete ocho nueve diez once.", "Doce trece.", "El resto en pantalla.",
    ]);
  });
});
