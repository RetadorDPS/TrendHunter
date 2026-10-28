import Link from "next/link";
import { auth } from "@/auth";
import { listTrackedProductAlerts, listTrackedProducts, listProductosRealesGuardados } from "@/lib/dal";
import { PageHeading } from "@/components/domain/page-heading";
import { StatCard } from "@/components/domain/stat-card";
import { TrackedProductCard } from "@/components/domain/tracked-product-card";
import { GuardarProductoReal } from "@/components/domain/guardar-producto-real";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, BellRing, Bookmark, Target, TrendingUp } from "lucide-react";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { NOTIFICATION_TYPE_LABELS } from "@/types";

export const metadata = {
  title: "Product Tracker",
  description: "Guarda productos reales para no perderlos de vista y sigue la evolución del catálogo de ejemplo.",
};

/** Módulo 8 · Product Tracker: favoritos reales + seguimiento del catálogo de ejemplo. */
export default async function ProductTrackerPage() {
  const sesion = await auth();
  if (!sesion?.user?.id) return null;

  const [seguidos, alertas, favoritos] = await Promise.all([
    listTrackedProducts(sesion.user.id),
    listTrackedProductAlerts(sesion.user.id, 25),
    listProductosRealesGuardados(sesion.user.id),
  ]);

  const scoreMedio =
    seguidos.length > 0
      ? seguidos.reduce((suma, item) => suma + item.product.trendScore, 0) / seguidos.length
      : 0;
  const dorados = seguidos.filter((item) => item.product.isGoldenOpportunity).length;
  const favoritosActivos = favoritos.filter((f) => f.actual !== null).length;

  return (
    <>
      <PageHeading
        title="Product Tracker"
        description="Guardados: productos reales que quieres recordar, con su precio y cuántas tiendas reales lo venden ahora mismo. Seguimiento y Alertas todavía funcionan sobre el catálogo de ejemplo (20 productos), no sobre datos reales."
        actions={
          <Button asChild className="gap-2">
            <Link href="/dashboard/winning-products">
              <Bookmark className="size-4" />
              Guardar productos reales
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Guardados reales" value={favoritos.length} icon={Bookmark} hint={`${favoritosActivos} siguen a la venta`} accent="emerald" />
        <StatCard
          label="Seguidos (ejemplo)"
          value={seguidos.length}
          icon={Target}
          hint="catálogo de ejemplo, no real"
        />
        <StatCard
          label="Score medio (ejemplo)"
          value={scoreMedio.toFixed(1)}
          icon={TrendingUp}
          accent="violet"
          hint="catálogo de ejemplo, no real"
        />
        <StatCard
          label="Oportunidades doradas (ejemplo)"
          value={dorados}
          icon={Bell}
          accent="amber"
          hint="catálogo de ejemplo, no real"
        />
      </div>

      <Tabs defaultValue="favoritos">
        <TabsList>
          <TabsTrigger value="favoritos" className="gap-1.5">
            <Bookmark className="size-3.5" />
            Guardados ({favoritos.length})
          </TabsTrigger>
          <TabsTrigger value="seguimiento" className="gap-1.5">
            <Target className="size-3.5" />
            Seguimiento, ejemplo ({seguidos.length})
          </TabsTrigger>
          <TabsTrigger value="alertas" className="gap-1.5">
            <Bell className="size-3.5" />
            Alertas, ejemplo ({alertas.length})
          </TabsTrigger>
        </TabsList>

        {/* --- Guardados reales --- */}
        <TabsContent value="favoritos">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bookmark className="size-4 text-indigo-400" />
                Productos reales guardados
              </CardTitle>
              <CardDescription>
                Marcados con la estrella desde Winning Products o Suppliers Finder. El precio y las tiendas se
                comprueban en vivo cada vez que entras aquí.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {favoritos.length === 0 ? (
                <EmptyState
                  icon={Bookmark}
                  title="Todavía no has guardado ningún producto real"
                  description="Entra en Winning Products y pulsa la estrella en los productos reales que te interesen."
                  action={
                    <Button asChild size="sm">
                      <Link href="/dashboard/winning-products">Ir a Winning Products</Link>
                    </Button>
                  }
                />
              ) : (
                favoritos.map((favorito) => (
                  <div
                    key={favorito.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                  >
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                      {favorito.imagen && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={favorito.imagen} alt="" loading="lazy" className="size-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-100">{favorito.titulo}</p>
                      {favorito.actual ? (
                        <p className="text-xs text-muted-foreground">
                          {favorito.actual.precioMin === favorito.actual.precioMax
                            ? formatCurrency(favorito.actual.precioMin)
                            : `${formatCurrency(favorito.actual.precioMin)} – ${formatCurrency(favorito.actual.precioMax)}`}
                          {" · "}
                          {favorito.actual.vendedoresReales}{" "}
                          {favorito.actual.vendedoresReales === 1 ? "tienda real lo vende" : "tiendas reales lo venden"}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-400/80">
                          Ya no se ve en ninguna tienda real analizada ahora mismo.
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70">
                        {favorito.nicho} · guardado {formatRelativeTime(favorito.guardadoEn)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {favorito.actual?.tiendas[0] && (
                        <Button asChild size="sm" variant="outline">
                          <a
                            href={favorito.actual.tiendas[0].urlProducto ?? `https://${favorito.actual.tiendas[0].dominio}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver tienda real
                          </a>
                        </Button>
                      )}
                      <GuardarProductoReal
                        clave={favorito.clave}
                        titulo={favorito.titulo}
                        nicho={favorito.nicho}
                        imagen={favorito.imagen}
                        guardado
                        className="static bg-transparent hover:bg-surface"
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Productos en seguimiento (catálogo de ejemplo) --- */}
        <TabsContent value="seguimiento" className="space-y-4">
          {seguidos.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No sigues ningún producto de ejemplo todavía"
              description="Esto sigue funcionando sobre el catálogo de ejemplo (20 productos), con su TrendScore y umbrales de alerta. Todavía no existe un seguimiento equivalente para productos reales."
            />
          ) : (
            seguidos.map((item, indice) => <TrackedProductCard key={item.id} item={item} index={indice} />)
          )}
        </TabsContent>

        {/* --- Alertas (catálogo de ejemplo) --- */}
        <TabsContent value="alertas">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BellRing className="size-4 text-amber-400" />
                Historial de alertas (catálogo de ejemplo)
              </CardTitle>
              <CardDescription>
                Avisos del catálogo de ejemplo: subidas de TrendScore, cambios de saturación y precio. Las tiendas
                reales que sigues avisan por su propio timeline en Store Tracker.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alertas.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
                  Sin alertas todavía.
                </p>
              ) : (
                alertas.map((alerta) => (
                  <div
                    key={alerta.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface/40 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={alerta.read ? "muted" : "default"}>
                          {NOTIFICATION_TYPE_LABELS[alerta.type]}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelativeTime(alerta.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-medium text-slate-100">{alerta.title}</p>
                      <p className="text-xs text-muted-foreground">{alerta.message}</p>
                    </div>
                    {alerta.actionUrl && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={alerta.actionUrl}>Ver producto</Link>
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
