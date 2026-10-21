import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listAds, listProducts, searchStores } from "@/lib/dal";
import { DASHBOARD_NAV } from "@/lib/constants";
import { planMayorOIgual } from "@/lib/equipos";

/**
 *   GET /api/buscar?q=…
 *
 * Buscador global del header: productos, tiendas, anuncios y páginas del
 * panel, agrupados. Solo las páginas que el plan y el rol de la sesión
 * pueden ver de verdad (nada de sugerir una sección a la que no se entra).
 */

const LIMITE_POR_GRUPO = 5;
const LONGITUD_MINIMA = 2;

export async function GET(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < LONGITUD_MINIMA) {
    return NextResponse.json({ productos: [], tiendas: [], anuncios: [], paginas: [] });
  }

  const [productos, tiendas, anuncios] = await Promise.all([
    listProducts({ search: q, pageSize: LIMITE_POR_GRUPO }),
    searchStores(q, LIMITE_POR_GRUPO),
    listAds({ search: q }),
  ]);

  const terminoNormalizado = q.toLowerCase();
  const paginas = DASHBOARD_NAV.filter((item) => {
    if (item.adminOnly && sesion.user.role !== "ADMIN") return false;
    if (item.minPlan && !planMayorOIgual(sesion.user.planType, item.minPlan)) return false;
    return (
      item.label.toLowerCase().includes(terminoNormalizado) ||
      item.description.toLowerCase().includes(terminoNormalizado)
    );
  }).slice(0, LIMITE_POR_GRUPO);

  return NextResponse.json({
    productos: productos.items.map((producto) => ({
      id: producto.id,
      titulo: producto.title,
      subtitulo: `${producto.category} · score ${producto.trendScore}`,
      imagen: producto.mainImage,
      href: `/dashboard/winning-products/${producto.id}`,
    })),
    tiendas: tiendas.map((tienda) => ({
      id: tienda.id,
      titulo: tienda.name,
      subtitulo: `${tienda.domain} · ${tienda.niche}`,
      imagen: null,
      href: `/dashboard/store-tracker/${tienda.id}`,
    })),
    anuncios: anuncios.slice(0, LIMITE_POR_GRUPO).map((anuncio) => ({
      id: anuncio.id,
      titulo: anuncio.headline,
      subtitulo: anuncio.advertiserName,
      imagen: anuncio.thumbnailUrl,
      href: `/dashboard/ads-spy?search=${encodeURIComponent(anuncio.headline)}`,
    })),
    paginas: paginas.map((item) => ({
      id: item.href,
      titulo: item.label,
      subtitulo: item.description,
      imagen: null,
      href: item.href,
    })),
  });
}
