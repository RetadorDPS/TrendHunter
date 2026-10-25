/**
 * ============================================================================
 *  PROVEEDOR · META AD LIBRARY (GRATIS, CON TOKEN)
 * ============================================================================
 *  Meta publica qué anuncios está corriendo cualquier anunciante en Facebook
 *  e Instagram a través de un endpoint público y gratuito:
 *
 *      https://graph.facebook.com/v21.0/ads_archive
 *
 *  Hace falta un `FACEBOOK_ACCESS_TOKEN` (token de una app de Meta for
 *  Developers — gratis de crear, sin tarjeta), pero la consulta en sí no
 *  cuesta nada y no tiene límite de pago.
 *
 *  Honestidad del dato — importante: para anuncios normales (no políticos ni
 *  de temas sociales), Meta NO expone métricas de interacción (me gusta,
 *  comentarios, compartidos, vistas) ni gasto estimado por su propia política
 *  de privacidad. Este módulo nunca inventa esos números: los deja sin
 *  rellenar (`null`) en vez de simular un `engagementRate`. Lo único medible
 *  de verdad para un anuncio normal es: quién lo publica, qué dice, en qué
 *  plataformas corre, desde cuándo está activo y el enlace para verlo en la
 *  propia Biblioteca de Anuncios de Meta.
 *
 *  Lo que puede fallar (y se informa sin disimular):
 *    · sin FACEBOOK_ACCESS_TOKEN configurado        → `sin-clave`
 *    · token caducado o revocado (error 190)        → `token-invalido`
 *    · falta el país de alcance (obligatorio)        → `parametros`
 *    · límite de peticiones de Meta                  → `limite`
 *    · red caída o timeout                            → `red`
 *    · JSON con otra forma                             → `formato`
 *
 *  Este módulo NUNCA lanza: devuelve `ok: false` con el motivo.
 *
 *  Sin `server-only` a propósito: es HTTP + parseo puro y así se puede
 *  comprobar desde `npm run verify:ads-meta` con un servidor local que imita
 *  la forma exacta de la respuesta de Meta (ver scripts/verificar-ads-meta.mts).
 * ============================================================================
 */

const CAMPOS = [
  "id",
  "ad_creation_time",
  "ad_creative_bodies",
  "ad_creative_link_titles",
  "ad_delivery_start_time",
  "ad_delivery_stop_time",
  "ad_snapshot_url",
  "page_name",
  "publisher_platforms",
].join(",");

/** Anuncio real tal y como lo devuelve la Biblioteca de Anuncios de Meta. */
export interface AnuncioMeta {
  idExterno: string;
  anunciante: string;
  titular: string | null;
  cuerpo: string | null;
  plataformas: Array<"FACEBOOK" | "INSTAGRAM">;
  creadoEn: string | null;
  activoDesde: string | null;
  activoHasta: string | null;
  diasActivo: number | null;
  urlBiblioteca: string;
}

export type MotivoFalloMeta = "sin-clave" | "token-invalido" | "parametros" | "limite" | "red" | "formato";

export interface BusquedaAnunciosMeta {
  ok: boolean;
  termino: string;
  pais: string;
  anuncios: AnuncioMeta[];
  total: number;
  error: string | null;
  motivo: MotivoFalloMeta | null;
  latenciaMs: number;
}

/** ¿Hay un token configurado? (lo usa /api/diagnostics y el panel de Ads Spy). */
export function metaAdLibraryConfigurado(): boolean {
  return Boolean(process.env.FACEBOOK_ACCESS_TOKEN);
}

function diasEntre(desde: string | null, hasta: string | null): number | null {
  if (!desde) return null;
  const inicio = new Date(desde).getTime();
  if (Number.isNaN(inicio)) return null;
  const fin = hasta ? new Date(hasta).getTime() : Date.now();
  if (Number.isNaN(fin)) return null;
  return Math.max(1, Math.round((fin - inicio) / 86_400_000));
}

interface RespuestaMetaCruda {
  data?: Array<{
    id?: string;
    page_name?: string;
    ad_creative_bodies?: string[];
    ad_creative_link_titles?: string[];
    ad_creation_time?: string;
    ad_delivery_start_time?: string;
    ad_delivery_stop_time?: string;
    ad_snapshot_url?: string;
    publisher_platforms?: string[];
  }>;
  error?: { message?: string; code?: number; error_subcode?: number };
}

/**
 * Busca anuncios reales activos para un término de búsqueda en un país.
 *
 * @param termino   texto a buscar (nombre del producto, marca, nicho…)
 * @param pais      código ISO-2 del país de alcance del anuncio (obligatorio
 *                  para Meta); por defecto España.
 */
export async function buscarAnunciosMeta(
  termino: string,
  opciones: { pais?: string; limite?: number } = {},
): Promise<BusquedaAnunciosMeta> {
  const inicio = Date.now();
  const pais = (opciones.pais ?? "ES").toUpperCase();
  const limite = Math.min(Math.max(opciones.limite ?? 30, 1), 100);

  const vacio = (motivo: MotivoFalloMeta, error: string): BusquedaAnunciosMeta => ({
    ok: false,
    termino,
    pais,
    anuncios: [],
    total: 0,
    error,
    motivo,
    latenciaMs: Date.now() - inicio,
  });

  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    return vacio("sin-clave", "Falta FACEBOOK_ACCESS_TOKEN: Ads Spy no puede buscar anuncios reales sin él.");
  }
  if (!termino.trim()) {
    return vacio("parametros", "Falta el término de búsqueda.");
  }

  const endpoint = process.env.META_AD_LIBRARY_URL ?? "https://graph.facebook.com/v21.0/ads_archive";
  const url = new URL(endpoint);
  url.searchParams.set("search_terms", termino.trim());
  url.searchParams.set("ad_reached_countries", JSON.stringify([pais]));
  url.searchParams.set("ad_active_status", "ACTIVE");
  url.searchParams.set("limit", String(limite));
  url.searchParams.set("fields", CAMPOS);
  url.searchParams.set("access_token", token);

  let respuesta: Response;
  try {
    respuesta = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    return vacio("red", "No se pudo conectar con graph.facebook.com (red caída o timeout).");
  }

  let cuerpo: RespuestaMetaCruda;
  try {
    cuerpo = (await respuesta.json()) as RespuestaMetaCruda;
  } catch {
    return vacio("formato", "La respuesta de Meta no es un JSON válido.");
  }

  if (!respuesta.ok || cuerpo.error) {
    const codigo = cuerpo.error?.code;
    if (codigo === 190) return vacio("token-invalido", cuerpo.error?.message ?? "Token caducado o revocado.");
    if (respuesta.status === 429 || codigo === 4 || codigo === 17 || codigo === 32) {
      return vacio("limite", cuerpo.error?.message ?? "Límite de peticiones de Meta alcanzado.");
    }
    if (respuesta.status === 400) {
      return vacio("parametros", cuerpo.error?.message ?? "Meta rechazó los parámetros de la búsqueda.");
    }
    return vacio("red", cuerpo.error?.message ?? `Meta respondió ${respuesta.status}.`);
  }

  if (!Array.isArray(cuerpo.data)) {
    return vacio("formato", "La respuesta de Meta no trae la lista 'data' esperada.");
  }

  const anuncios: AnuncioMeta[] = cuerpo.data
    .filter((anuncio) => anuncio.id && anuncio.page_name)
    .map((anuncio) => {
      const plataformas = (anuncio.publisher_platforms ?? [])
        .map((p) => p.toUpperCase())
        .filter((p): p is "FACEBOOK" | "INSTAGRAM" => p === "FACEBOOK" || p === "INSTAGRAM");
      return {
        idExterno: anuncio.id!,
        anunciante: anuncio.page_name!,
        titular: anuncio.ad_creative_link_titles?.[0]?.trim() || null,
        cuerpo: anuncio.ad_creative_bodies?.[0]?.trim() || null,
        plataformas: plataformas.length > 0 ? plataformas : ["FACEBOOK"],
        creadoEn: anuncio.ad_creation_time ?? null,
        activoDesde: anuncio.ad_delivery_start_time ?? null,
        activoHasta: anuncio.ad_delivery_stop_time ?? null,
        diasActivo: diasEntre(anuncio.ad_delivery_start_time ?? null, anuncio.ad_delivery_stop_time ?? null),
        urlBiblioteca:
          anuncio.ad_snapshot_url ?? `https://www.facebook.com/ads/library/?id=${anuncio.id}`,
      };
    });

  return {
    ok: true,
    termino,
    pais,
    anuncios,
    total: anuncios.length,
    error: null,
    motivo: null,
    latenciaMs: Date.now() - inicio,
  };
}
