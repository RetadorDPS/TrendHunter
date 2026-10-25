import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ingerirAnunciosMeta } from "@/lib/adsIngesta";
import { permitido, segundosParaReinicio } from "@/lib/limite";
import { logger } from "@/lib/logger";

/**
 * Búsqueda manual de anuncios reales en Meta Ad Library desde Ads Spy.
 *
 *   POST /api/ads-spy/buscar
 *   sesión obligatoria
 *
 * Cuerpo: { "termino": "masajeador", "pais": "ES" }
 *
 * Límite: 6 búsquedas por hora y usuario (igual que «Fuentes en vivo»).
 * Nunca lanza: si falta la clave de Meta o la API falla, devuelve el motivo
 * exacto en vez de inventar anuncios.
 */
export async function POST(request: Request) {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id;
  if (!usuarioId) {
    return NextResponse.json({ error: "Inicia sesión para buscar anuncios." }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as { termino?: string; pais?: string };
  const termino = (cuerpo.termino ?? "").trim();
  if (!termino) {
    return NextResponse.json({ error: "Escribe qué producto o marca quieres buscar." }, { status: 400 });
  }

  const clave = `ads-spy-buscar:${usuarioId}`;
  if (!permitido(clave, 6, 3_600_000)) {
    return NextResponse.json(
      {
        error: `Has hecho muchas búsquedas seguidas. Vuelve a intentarlo en ${Math.ceil(segundosParaReinicio(clave) / 60)} min.`,
      },
      { status: 429 },
    );
  }

  const inicio = Date.now();
  const resultado = await ingerirAnunciosMeta(termino, { pais: cuerpo.pais });

  logger.info("ads_spy_buscar", {
    usuarioId,
    termino,
    ok: resultado.ok,
    motivo: resultado.motivo,
    anunciosLeidos: resultado.anunciosLeidos,
    duracionMs: Date.now() - inicio,
  });

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 });
}
