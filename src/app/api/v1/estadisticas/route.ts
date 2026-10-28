import { getDashboardStats } from "@/lib/dal";
import { autenticarApi } from "@/lib/apiAuth";
import { errorApi, preflightApi, respuestaApi } from "@/lib/apiV1";

/**
 * GET /api/v1/estadisticas
 *
 * KPIs agregados de datos reales: tiendas Shopify analizadas, productos reales
 * a la venta, anuncios reales de Meta y reparto por nicho. Nada estimado ni
 * de demostración. No expone datos de usuarios.
 */
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflightApi();
}

export async function GET(request: Request) {
  const auth = await autenticarApi(request, "/estadisticas");
  if (!auth.ok) return errorApi(auth.estado, auth.codigo, auth.mensaje, auth.cabeceras);

  const estadisticas = await getDashboardStats();

  return respuestaApi(
    {
      tiendasReales: estadisticas.tiendasReales,
      productosReales: estadisticas.productosReales,
      anunciosReales: estadisticas.anunciosReales,
      nichos: estadisticas.nichos,
      ultimaLectura: estadisticas.ultimaLectura,
    },
    {
      clave: auth.contexto.clave.prefijo,
      procedencia:
        "Todo sale de tiendas Shopify reales leídas de su catálogo público y de anuncios reales de la Biblioteca de Anuncios de Meta. Nada estimado ni de demostración.",
    },
    200,
    auth.contexto.cabeceras,
  );
}
