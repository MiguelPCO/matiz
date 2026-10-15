import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "../../lib/legal";

export const metadata: Metadata = { title: "Aviso legal — MATIZ" };

const h2 = "mt-4 font-sans text-lg text-text";
const p = "font-sans text-sm text-text-muted";

export default function AvisoLegalPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-3 px-4 pt-10 pb-12">
      <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
        ← MATIZ
      </Link>
      <h1 className="mt-4 font-sans text-2xl text-text">Aviso legal</h1>
      <p className={p}>Última actualización: {LEGAL.updatedAt}</p>

      <h2 className={h2}>Titular</h2>
      <p className={p}>
        {LEGAL.owner} · NIF {LEGAL.nif} · {LEGAL.address} ·{" "}
        <a className="text-signal underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </p>

      <h2 className={h2}>Objeto</h2>
      <p className={p}>
        MATIZ es un proyecto personal de {LEGAL.owner}. Es un juego de percepción cromática: recibes una pista
        y buscas su color exacto en una carta de tonalidades.
      </p>

      <h2 className={h2}>Propiedad intelectual</h2>
      <p className={p}>
        El diseño y el código de la app son del titular. El contenido que crean los usuarios sigue siendo suyo.
      </p>

      <h2 className={h2}>Responsabilidad</h2>
      <p className={p}>
        La app se ofrece tal cual, sin garantía de disponibilidad. Las respuestas generadas por IA pueden
        contener errores; no sustituyen el consejo de un profesional.
      </p>

      <h2 className={h2}>Legislación</h2>
      <p className={p}>Este aviso se rige por la legislación española.</p>
    </main>
  );
}
