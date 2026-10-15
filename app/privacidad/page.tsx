import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "../../lib/legal";

export const metadata: Metadata = { title: "Política de privacidad — MATIZ" };

const h2 = "mt-4 font-sans text-lg text-text";
const p = "font-sans text-sm text-text-muted";
const a = "text-signal underline";

export default function PrivacidadPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-3 px-4 pt-10 pb-12">
      <Link href="/" className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-faint">
        ← MATIZ
      </Link>
      <h1 className="mt-4 font-sans text-2xl text-text">Política de privacidad</h1>
      <p className={p}>Última actualización: {LEGAL.updatedAt}</p>

      <h2 className={h2}>1. Responsable</h2>
      <p className={p}>
        {LEGAL.owner}, NIF {LEGAL.nif}, {LEGAL.address}. Contacto:{" "}
        <a className={a} href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2 className={h2}>2. Qué datos tratamos</h2>
      <ul className={`${p} list-disc pl-5`}>
        <li>
          Si inicias sesión con Google (opcional): tu email y el identificador de cuenta que nos da Google.
        </li>
        <li>
          Tus resultados del modo Diario (fecha, aciertos, tiros, pistas y puntuación), para guardarlos en la
          nube. Sin sesión se quedan solo en tu navegador.
        </li>
        <li>
          La palabra o el color de cada partida: la palabra que escribes en Solo, o el color del día en Diario.
        </li>
        <li>
          Datos técnicos que registran los proveedores por seguridad (dirección IP, navegador). La IP también
          se usa, solo en memoria, para limitar el número de peticiones.
        </li>
        <li>Los nombres de jugador del modo Duelo no salen de tu dispositivo.</li>
      </ul>

      <h2 className={h2}>3. Para qué y con qué base legal</h2>
      <ul className={`${p} list-disc pl-5`}>
        <li>
          Prestar el servicio y gestionar tu cuenta — art. 6.1.b RGPD (ejecución de las condiciones de uso).
        </li>
        <li>Seguridad y prevención de abusos (límites de peticiones) — art. 6.1.f RGPD (interés legítimo).</li>
        <li>
          Inteligencia artificial: la palabra que escribes en Solo, o el código de color de la partida, se
          envía a Anthropic solo para obtener el color o la palabra de la pista. No se envía tu email ni
          ningún otro dato de tu cuenta.
        </li>
      </ul>

      <h2 className={h2}>4. Con quién se comparten</h2>
      <p className={p}>No vendemos tus datos. Los tratan, por cuenta nuestra, estos proveedores:</p>
      <ul className={`${p} list-disc pl-5`}>
        <li>Supabase — base de datos y cuentas — región del proyecto: [RELLENAR].</li>
        <li>Vercel — alojamiento y estadísticas de uso sin cookies — Estados Unidos.</li>
        <li>Anthropic — IA que relaciona palabras y colores — Estados Unidos.</li>
        <li>Google — inicio de sesión — Estados Unidos.</li>
      </ul>

      <h2 className={h2}>5. Transferencias internacionales</h2>
      <p className={p}>
        Algunos de estos proveedores están en Estados Unidos. Las transferencias se amparan en el Marco de
        Privacidad de Datos UE-EE. UU. o en las cláusulas contractuales tipo de la Comisión Europea.
      </p>

      <h2 className={h2}>6. Cuánto tiempo</h2>
      <p className={p}>
        Mientras mantengas la cuenta. Al borrarla eliminamos tus datos; las copias de seguridad de los
        proveedores se sobrescriben según su propio ciclo. Para borrar tu cuenta escribe a{" "}
        <a className={a} href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>

      <h2 className={h2}>7. Tus derechos</h2>
      <p className={p}>
        Acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad, escribiendo a{" "}
        <a className={a} href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Si no estás conforme con la
        respuesta, puedes reclamar ante la Agencia Española de Protección de Datos (
        <a className={a} href="https://www.aepd.es" target="_blank" rel="noreferrer">www.aepd.es</a>).
      </p>

      <h2 className={h2}>8. Cookies</h2>
      <p className={p}>
        Solo usamos cookies técnicas necesarias para mantener tu sesión iniciada, y el almacenamiento local
        del navegador para tu tema, tus partidas y tu historial. Están exentas de consentimiento (art. 22.2
        LSSI) y no usamos cookies de analítica ni de publicidad. Las estadísticas de Vercel Analytics no usan
        cookies.
      </p>

      <h2 className={h2}>9. Menores</h2>
      <p className={p}>La app no está dirigida a menores de 14 años.</p>
    </main>
  );
}
