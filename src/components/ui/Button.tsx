import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "accent";

// The three looks of the redesign: brand teal for "go", solid ink for the action that matters
// most on a panel, and a quiet bordered button for everything else. Theme tokens only.
const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-card hover:brightness-110",
  secondary: "border border-line bg-panel text-fg hover:bg-subtle",
  accent: "bg-fg text-bg shadow-card hover:opacity-90",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      // active: press feedback — a quick shrink and dim while held, so a click visibly lands.
      // disabled:active cancels it: a button that does nothing must not look pressed.
      className={`cursor-pointer rounded-lg px-3.5 py-2 font-bold transition duration-100 active:scale-95 active:brightness-90 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100 disabled:active:brightness-100 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
