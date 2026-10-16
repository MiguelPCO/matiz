"use client";

interface ProfileButtonProps {
  readonly signedIn: boolean;
  readonly onClick: () => void;
}

/**
 * Icono de persona (antes ◐/○, que en móvil no se entendía como cuenta) — ver
 * docs/superpowers/specs/2026-08-29-profile-screen-design.md. Sin lógica de
 * auth propia: quien lo monta decide si mostrarlo (gate isSupabaseConfigured())
 * y qué pasarle en signedIn/onClick.
 */
export function ProfileButton({ signedIn, onClick }: ProfileButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={signedIn ? "Perfil, sesión iniciada" : "Perfil, sin sesión"}
      className="hit-44 flex h-9 w-9 items-center justify-center rounded-full border border-line font-mono text-base text-text-muted"
    >
      {/* Silueta de persona: se lee como «cuenta». Rellena con sesión, a línea sin ella. */}
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
        <circle cx="12" cy="8" r="4" fill={signedIn ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"
          fill={signedIn ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
