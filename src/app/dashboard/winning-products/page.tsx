import Link from "next/link";
import Image from "next/image";
import { LayoutGrid, PackageSearch, Radar } from "lucide-react";
import { listNichosReales, listProductosRealesPorNicho } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { RadarTendencias } from "@/components/domain/radar-tendencias";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency, formatRelativeTime } from "@/lib/utils";

export const metadata = {
  title: "Winning Products",
  description: "Productos reales leídos del catálogo público de tiendas Shopify de verdad, organizados por nicho.",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WinningProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nichoParam = params.nicho;
  const nichoSeleccionado = Array.isArray(nichoParam) ? nichoParam[0] : nichoParam;

  const [nichos, productos] = await Promise.all([
    listNichosReales(),
    listProductosRealesPorNicho(nichoSeleccionado, 48),
  ]);

  const totalProductos = nichos.reduce((suma, nicho) => suma + nicho.productos, 0);
  const totalTiendas = nichos.reduce((suma, nicho) => suma + nicho.tiendas, 0);

  return (
    <>
      <PageHeading
        title="Winning Products"
        description="Productos reales de tiendas Shopify reales que analizamos de verdad, agrupados por nicho. Título, precio y disponibilidad son los que la tienda publica ahora mismo: nada estimado."
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
              <span className="font-medium tabular-nums">{productos.length}</span>
              <span className="text-muted-foreground">
                {productos.length === 1 ? "producto real" : "productos reales"}
                {nichoSeleccionado ? ` en «${nichoSeleccionado}»` : ""}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {totalTiendas} {totalTiendas === 1 ? "tienda real analizada" : "tiendas reales analizadas"}
            </span>
          </Card>

          {productos.length === 0 ? (
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
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {productos.map((producto) => (
                <a
                  key={producto.id}
                  href={producto.urlProducto ?? `https://${producto.tienda.dominio}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-surface/40 transition-colors hover:border-indigo-500/50 hover:bg-surface"
                >
                  <div className="relative aspect-square overflow-hidden bg-slate-900">
                    {producto.imagen && (
                      <Image
                        src={producto.imagen}
                        alt={producto.titulo}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    {producto.nuevo && (
                      <Badge variant="success" className="absolute left-2 top-2 text-[10px]">
                        Nuevo
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-3">
                    <h3 className="line-clamp-2 text-sm font-medium leading-snug">{producto.titulo}</h3>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold tabular-nums">{formatCurrency(producto.precio)}</span>
                      {producto.precioComparado && producto.precioComparado > producto.precio && (
                        <span className="text-[11px] text-muted-foreground line-through">
                          {formatCurrency(producto.precioComparado)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{producto.tienda.dominio}</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      Visto {formatRelativeTime(producto.vistoUltimaVez)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <div className="mt-6">
        <RadarTendencias />
      </div>
    </>
  );
}
