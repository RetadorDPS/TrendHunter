import Link from "next/link";
import { ExternalLink, PackageSearch, Radar, Search } from "lucide-react";
import { listNichosReales, listProductosRealesPaginado } from "@/lib/dal";
import { urlBusquedaAliExpress, urlBusquedaAlibaba, urlBusquedaAmazon } from "@/lib/sourcing";
import { PageHeading } from "@/components/domain/page-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";

export const metadata = {
  title: "Suppliers Finder",
  description: "Enlaces reales de búsqueda en AliExpress y Alibaba para sourcear cada producto real que encuentres.",
};

const PAGE_SIZE = 30;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SuppliersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nichoParam = params.nicho;
  const nichoSeleccionado = Array.isArray(nichoParam) ? nichoParam[0] : nichoParam;

  const [nichos, resultado] = await Promise.all([
    listNichosReales(),
    listProductosRealesPaginado(nichoSeleccionado, 1, PAGE_SIZE),
  ]);

  return (
    <>
      <PageHeading
        title="Suppliers Finder"
        description="No existe un directorio gratuito de proveedores mayoristas verificados, así que en vez de inventar uno, esto te lleva directo a la búsqueda real en AliExpress y Alibaba para el título exacto de cada producto real que ya encontraste en Winning Products."
      />

      {nichos.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="Todavía no hay productos reales para sourcear"
          description="Ve a «Fuentes en vivo» y lee el catálogo público de una tienda Shopify real para empezar."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/fuentes">Ir a Fuentes en vivo</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/suppliers"
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                !nichoSeleccionado
                  ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300"
                  : "border-border/60 text-muted-foreground hover:border-indigo-500/40 hover:text-foreground",
              )}
            >
              Todos los nichos
            </Link>
            {nichos.map((nicho) => (
              <Link
                key={nicho.nicho}
                href={`/dashboard/suppliers?nicho=${encodeURIComponent(nicho.nicho)}`}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  nichoSeleccionado === nicho.nicho
                    ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300"
                    : "border-border/60 text-muted-foreground hover:border-indigo-500/40 hover:text-foreground",
                )}
              >
                {nicho.nicho}
              </Link>
            ))}
          </div>

          {resultado.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Sin productos reales en este nicho todavía"
              description="Lee más tiendas de este nicho en «Fuentes en vivo» para que aparezcan aquí."
            />
          ) : (
            <div className="space-y-3">
              {resultado.items.map((producto) => (
                <Card key={producto.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                    {producto.imagen && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={producto.imagen} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{producto.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {producto.vendedoresReales > 1
                        ? `Vendido por ${producto.vendedoresReales} tiendas reales · `
                        : ""}
                      {producto.precioMin === producto.precioMax
                        ? formatCurrency(producto.precioMin)
                        : `${formatCurrency(producto.precioMin)} – ${formatCurrency(producto.precioMax)}`}{" "}
                      en tienda
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={urlBusquedaAliExpress(producto.titulo)} target="_blank" rel="noreferrer">
                        <Search />
                        AliExpress
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={urlBusquedaAlibaba(producto.titulo)} target="_blank" rel="noreferrer">
                        <Search />
                        Alibaba
                      </a>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <a href={urlBusquedaAmazon(producto.titulo)} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        Precio en Amazon
                      </a>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
