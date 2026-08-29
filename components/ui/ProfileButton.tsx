"use client";

interface ProfileButtonProps {
  readonly signedIn: boolean;
  readonly onClick: () => void;
}

/**
 * Mismo glifo que usaba el botón de cuenta que vivía solo en Diario.tsx
 * (◐ con sesión, ○ sin ella) — ver
 * docs/superpowers/specs/2026-08-29-profile-screen-design.md. Sin lógica de
 * auth propia: quien lo monta decide si mostrarlo (gate isSupabaseConfigured())
 * y qué pasarle en signedIn/onClick.
 */
export function ProfileButton({ signedIn, onClick }: ProfileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Perfil"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
    >
      {signedIn ? "◐" : "○"}
    </button>
  );
}
