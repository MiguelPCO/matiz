"use client";

import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-signal text-signal-ink",
  secondary: "border border-line text-text",
  ghost: "text-text-muted",
};

export function Button({ variant = "primary", className = "", children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`rounded-[var(--radius-panel)] py-3 font-sans text-sm font-medium disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
