import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "accent";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-[#05210f] hover:brightness-110",
  secondary: "bg-[#2a2e3a] text-fg hover:brightness-125",
  accent: "bg-accent2 text-[#04162e] hover:brightness-110",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      // active: press feedback — a quick shrink and dim while held, so a click visibly lands.
      // disabled:active cancels it: a button that does nothing must not look pressed.
      className={`cursor-pointer rounded-md px-3.5 py-2 font-semibold transition duration-100 active:scale-95 active:brightness-90 disabled:cursor-default disabled:opacity-40 disabled:active:scale-100 disabled:active:brightness-100 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
