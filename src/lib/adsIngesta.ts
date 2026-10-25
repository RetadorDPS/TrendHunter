// Sin `server-only` a propósito (igual que src/lib/ingesta.ts): así se puede
// comprobar desde `npm run verify:ads-meta` sin pasar por el bundler de Next.
import prisma from "@/lib/prisma";
import { buscarAnunciosMeta, type AnuncioMeta, type MotivoFalloMeta } from "@/lib/providers/metaAdLibrary";

export interface ResultadoIngestaAnuncios {
  ok: boolean;
  termino: string;
  pais: string;
  anunciosLeidos: number;
  nuevos: number;
  actualizados: number;
  error: string | null;
  motivo: MotivoFalloMeta | null;
  latenciaMs: number;
}

/**
 * Busca anuncios reales en Meta Ad Library para un término y los guarda en
 * `Ad` (origen = "meta-ad-library"). Idempotente: un anuncio ya guardado
 * (mismo `externalId`) se actualiza en vez de duplicarse.
 *
 * Nunca inventa likes/comments/shares/views: Meta no los da para anuncios
 * normales, así que esos campos se quedan en su valor por defecto (0) y la
 * interfaz (AdCard) sabe no presentarlos como medidos para `origen = "meta-ad-library"`.
 */
export async function ingerirAnunciosMeta(
  termino: string,
  opciones: { pais?: string; limite?: number } = {},
): Promise<ResultadoIngestaAnuncios> {
  const busqueda = await buscarAnunciosMeta(termino, opciones);

  if (!busqueda.ok) {
    return {
      ok: false,
      termino: busqueda.termino,
      pais: busqueda.pais,
      anunciosLeidos: 0,
      nuevos: 0,
      actualizados: 0,
      error: busqueda.error,
      motivo: busqueda.motivo,
      latenciaMs: busqueda.latenciaMs,
    };
  }

  let nuevos = 0;
  let actualizados = 0;

  for (const anuncio of busqueda.anuncios) {
    const existente = await prisma.ad.findFirst({ where: { externalId: anuncio.idExterno } });
    const datos = aDatosAd(anuncio, busqueda.pais, termino);

    if (existente) {
      await prisma.ad.update({ where: { id: existente.id }, data: { ...datos, lastSeenAt: new Date() } });
      actualizados += 1;
    } else {
      await prisma.ad.create({ data: { ...datos, externalId: anuncio.idExterno } });
      nuevos += 1;
    }
  }

  return {
    ok: true,
    termino: busqueda.termino,
    pais: busqueda.pais,
    anunciosLeidos: busqueda.total,
    nuevos,
    actualizados,
    error: null,
    motivo: null,
    latenciaMs: busqueda.latenciaMs,
  };
}

/** Traduce un anuncio normalizado del proveedor al shape de la tabla `Ad`. */
function aDatosAd(anuncio: AnuncioMeta, pais: string, termino: string) {
  const plataforma = anuncio.plataformas[0] ?? "FACEBOOK";
  return {
    platform: plataforma,
    mediaUrl: anuncio.urlBiblioteca,
    thumbnailUrl: null,
    videoUrl: null,
    headline: anuncio.titular ?? anuncio.cuerpo?.slice(0, 80) ?? anuncio.anunciante,
    body: anuncio.cuerpo ?? "",
    callToAction: null,
    daysActive: anuncio.diasActivo ?? 1,
    countryTargets: JSON.stringify([pais]),
    nicheTag: termino.trim().toLowerCase(),
    advertiserName: anuncio.anunciante,
    adLibraryUrl: anuncio.urlBiblioteca,
    isActive: !anuncio.activoHasta,
    firstSeenAt: anuncio.creadoEn ? new Date(anuncio.creadoEn) : new Date(),
    origen: "meta-ad-library",
  };
}
