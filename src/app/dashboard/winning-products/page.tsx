import Link from "next/link";
import { LayoutGrid, PackageSearch, Radar } from "lucide-react";
import { auth } from "@/auth";
import { listClavesGuardadas, listNichosReales, listProductosRealesPaginado } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { RadarTendencias } from "@/components/domain/radar-tendencias";
import { GuardarProductoReal } from "@/components/domain/guardar-producto-real";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";

export const metadata = {
  title: "Winning Products",
  description: "Productos reales leídos del catálogo público de tiendas Shopify de verdad, organizados por nicho.",
};

const PAGE_SIZE = 60;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WinningProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nichoParam = params.nicho;
  const nichoSeleccionado = Array.isArray(nichoParam) ? nichoParam[0] : nichoParam;
  const paginaParam = Array.isArray(params.pagina) ? params.pagina[0] : params.pagina;
  const pagina = Math.max(1, Number(paginaParam) || 1);

  const sesion = await auth();
  const [nichos, resultado, clavesGuardadas] = await Promise.all([
    listNichosReales(),
    listProductosRealesPaginado(nichoSeleccionado, pagina, PAGE_SIZE),
    sesion?.user?.id ? listClavesGuardadas(sesion.user.id) : Promise.resolve([]),
  ]);
  const guardadosSet = new Set(clavesGuardadas);

  const totalProductos = nichos.reduce((suma, nicho) => suma + nicho.productos, 0);
  const totalTiendas = nichos.reduce((suma, nicho) => suma + nicho.tiendas, 0);

  /** Construye la URL de una página manteniendo el nicho elegido. */
  const urlPagina = (numero: number) =>
    `/dashboard/winning-products?${new URLSearchParams({
      ...(nichoSeleccionado ? { nicho: nichoSeleccionado } : {}),
      pagina: String(numero),
    }).toString()}`;

  return (
    <>
      <PageHeading
        title="Winning Products"
        description="Productos reales agrupados por nicho y ordenados por cuántas tiendas reales distintas los venden: esa es la señal de qué tan probado está un producto, no un score inventado. Precio y disponibilidad son los que cada tienda publica ahora mismo."
      />

      {nichos.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="Todavía no hay tiendas reales analizadas en ningún nicho"
          description="Ve a «Fuentes en vivo» y lee el catálogo público de una tienda Shopify real para que aparezcan productos aquí."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/fuentes">Ir a Fuentes en vivo</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Selector de nicho: el punto de partida es elegir un nicho, no buscar. */}
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/winning-products"
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                !nichoSeleccionado
                  ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300"
                  : "border-border/60 text-muted-foreground hover:border-indigo-500/40 hover:text-foreground",
              )}
            >
              Todos los nichos · {totalProductos}
            </Link>
            {nichos.map((nicho) => (
              <Link
                key={nicho.nicho}
                href={`/dashboard/winning-products?nicho=${encodeURIComponent(nicho.nicho)}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  nichoSeleccionado === nicho.nicho
                    ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300"
                    : "border-border/60 text-muted-foreground hover:border-indigo-500/40 hover:text-foreground",
                )}
              >
                {nicho.nicho} · {nicho.productos}
              </Link>
            ))}
          </div>

          <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2 text-sm">
              <LayoutGrid className="size-4 text-indigo-400" />
              <span className="font-medium tabular-nums">{resultado.total}</span>
              <span className="text-muted-foreground">
                {resultado.total === 1 ? "producto real" : "productos reales"}
                {nichoSeleccionado ? ` en «${nichoSeleccionado}»` : ""}
                {resultado.total > PAGE_SIZE
                  ? ` · mostrando ${(pagina - 1) * PAGE_SIZE + 1}-${Math.min(pagina * PAGE_SIZE, resultado.total)}`
                  : ""}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {totalTiendas} {totalTiendas === 1 ? "tienda real analizada" : "tiendas reales analizadas"}
            </span>
          </Card>

          {resultado.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Sin productos reales en este nicho todavía"
              description="Lee más tiendas de este nicho en «Fuentes en vivo» para que aparezcan aquí."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/fuentes">Ir a Fuentes en vivo</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {resultado.items.map((producto) => (
                  <a
                    key={producto.id}
                    href={producto.tiendas[0]?.urlProducto ?? `https://${producto.tiendas[0]?.dominio}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-surface/40 transition-colors hover:border-indigo-500/50 hover:bg-surface"
                  >
                    <div className="relative aspect-square overflow-hidden bg-slate-900">
                      {producto.imagen && (
                        // Imagen real de una tienda externa cualquiera: no se puede
                        // precomponer la lista de dominios permitidos de next/image,
                        // así que se sirve tal cual con <img>.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={producto.imagen}
                          alt={producto.titulo}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute left-2 top-2 flex flex-wrap gap-1 pr-10">
                        {producto.vendedoresReales > 1 && (
                          <Badge variant="gradient" className="text-[10px]">
                            {producto.vendedoresReales} tiendas lo venden
                          </Badge>
                        )}
                        {producto.nuevo && (
                          <Badge variant="success" className="text-[10px]">
                            Nuevo
                          </Badge>
                        )}
                      </div>
                      {sesion?.user?.id && (
                        <GuardarProductoReal
                          clave={producto.id}
                          titulo={producto.titulo}
                          nicho={producto.nicho}
                          imagen={producto.imagen}
                          guardado={guardadosSet.has(producto.id)}
                          className="absolute right-2 top-2"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <h3 className="line-clamp-2 text-sm font-medium leading-snug">{producto.titulo}</h3>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold tabular-nums">
                          {producto.precioMin === producto.precioMax
                            ? formatCurrency(producto.precioMin)
                            : `${formatCurrency(producto.precioMin)} – ${formatCurrency(producto.precioMax)}`}
                        </span>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {producto.vendedoresReales === 1
                          ? producto.tiendas[0]?.dominio
                          : `${producto.tiendas[0]?.dominio} +${producto.vendedoresReales - 1} más`}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        Visto {formatRelativeTime(producto.vistoUltimaVez)}
                      </p>
                    </div>
                  </a>
                ))}
              </div>

              {resultado.totalPaginas > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <Button asChild variant="outline" size="sm" disabled={pagina <= 1}>
                    <Link
                      href={urlPagina(Math.max(1, pagina - 1))}
                      aria-disabled={pagina <= 1}
                      className={pagina <= 1 ? "pointer-events-none opacity-50" : ""}
                    >
                      Anterior
                    </Link>
                  </Button>
                  <span className="px-3 text-sm text-muted-foreground tabular-nums">
                    Página {pagina} de {resultado.totalPaginas}
                  </span>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={urlPagina(Math.min(resultado.totalPaginas, pagina + 1))}
                      aria-disabled={pagina >= resultado.totalPaginas}
                      className={pagina >= resultado.totalPaginas ? "pointer-events-none opacity-50" : ""}
                    >
                      Siguiente
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <div className="mt-6">
        <RadarTendencias />
      </div>
    </>
  );
}
