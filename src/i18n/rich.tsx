import { Fragment } from "react";
import type { ReactNode } from "react";

/** A translated sentence with markup in the middle: t() fills the plain values and leaves the
 * other {placeholders} alone, and this puts an element in each of those — so a sentence with a
 * <b> or a <code> inside is translated whole, never as the pieces on either side of the tag.
 *   rich(t("Everything configured on {robot}."), { robot: <b>{name}</b> }) */
export function rich(text: string, parts: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/g).map((piece, i) => {
    const key = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{key !== undefined && key in parts ? parts[key] : piece}</Fragment>;
  });
}
