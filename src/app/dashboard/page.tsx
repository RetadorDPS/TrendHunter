import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  ArrowRight,
  Boxes,
  Flame,
  Layers,
  Megaphone,
  Radar,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  getAdStats,
  getDashboardStats,
  listProductosRealesPorNicho,
  listStores,
  listTrackedStores,
  listTrackedStoresTimeline,
} from "@/lib/dal";
import { pushConfigurado } from "@/lib/push";
import { PageHeading } from "@/components/domain/page-heading";
import { OnboardingModal } from "@/components/domain/onboarding-modal";
import { StatCard } from "@/components/domain/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const metadata = {
  title: "Panel general",
  description: "Resumen de tiendas reales analizadas, productos reales a la venta y movimientos de tus competidores.",
};

/** Nombre corto del usuario para el saludo. */
function saludo(): string {
  const hora = new Date().getHours();
  if (hora < 6) return "Buenas noches";
  if (hora < 13) return "Buenos días";
  if (hora < 20) return "Buenas tardes";
  return "Buenas noches";
}

export default async function DashboardPage() {
  const sesion = await auth();
  const usuarioId = sesion?.user?.id ?? "";

  const [stats, destacados, anuncios, timeline, onboarding, tiendasCandidatas, tiendasSeguidas] = await Promise.all([
    getDashboardStats(),
    listProductosRealesPorNicho(undefined, 4),
    getAdStats(),
    usuarioId ? listTrackedStoresTimeline(usuarioId, 6) : Promise.resolve([]),
    usuarioId
      ? prisma.user.findUnique({
          where: { id: usuarioId },
          select: { onboardingCompletadoEn: true, onboardingSaltadoEn: true },
        })
      : Promise.resolve(null),
    listStores(8),
    usuarioId ? listTrackedStores(usuarioId) : Promise.resolve([]),
  ]);

  const idsSeguidos = new Set(tiendasSeguidas.map((tienda) => tienda.id));
  const mostrarOnboarding = Boolean(
    usuarioId && onboarding && !onboarding.onboardingCompletadoEn && !onboarding.onboardingSaltadoEn,
  );
  const nichoPrincipal = stats.nichos[0];

  return (
    <>
      {mostrarOnboarding && (
        <OnboardingModal
          mostrar
          tiendas={tiendasCandidatas
            .filter((tienda) => !idsSeguidos.has(tienda.id))
            .map((tienda) => ({
              id: tienda.id,
              name: tienda.name,
              domain: tienda.domain,
              niche: tienda.niche,
              estimatedMonthlyRevenue: tienda.estimatedMonthlyRevenue,
            }))}
          pushConfigurado={pushConfigurado()}
          clavePublicaPush={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
        />
      )}
      <PageHeading
        title={`${saludo()}, ${sesion?.user?.name?.split(" ")[0] ?? "de nuevo"}`}
        description="Todo lo de aquí abajo sale de tiendas y anuncios reales que hemos leído de verdad, con su fecha."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/ads-spy">
                <Megaphone />
                Ver anuncios
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/fuentes">
                <Activity />
                Actualizar datos
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard/winning-products">
                <Sparkles />
                Buscar productos
              </Link>
            </Button>
          </>
        }
      />

      {/* KPIs principales: solo cuentas de datos reales */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Tiendas reales analizadas"
          value={stats.tiendasReales}
          icon={Store}
          hint={`${stats.nichos.length} ${stats.nichos.length === 1 ? "nicho" : "nichos"} con datos reales`}
          delta={stats.variacionTiendas ?? undefined}
        />
        <StatCard
          label="Productos reales a la venta"
          value={stats.productosReales}
          icon={Boxes}
          accent="violet"
          delta={stats.variacionProductos ?? undefined}
        />
        <StatCard
          label="Anuncios reales (Meta)"
          value={stats.anunciosReales}
          icon={Megaphone}
          accent="amber"
          hint={
            stats.anunciosReales > 0
              ? `El más longevo: ${anuncios.masLargo?.daysActive ?? 0} días activo`
              : "Búscalos en Ads Spy"
          }
        />
        <StatCard
          label="Nichos con datos reales"
          value={stats.nichos.length}
          icon={Layers}
          accent="emerald"
          hint={nichoPrincipal ? `El mayor: ${nichoPrincipal.nicho}` : "Todavía ninguno"}
        />
        <StatCard label="Usuarios de la plataforma" value={stats.usuarios} icon={Users} />
      </div>

      {/* Nichos reales + oportunidades de hoy */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-indigo-400" />
              Nichos con tiendas reales
            </CardTitle>
            <CardDescription>Cuántas tiendas y productos reales hay analizados en cada nicho</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.nichos.length === 0 ? (
              <EmptyState
                icon={Radar}
                title="Todavía no hay tiendas reales analizadas"
                description="Ve a «Fuentes en vivo» y lee el catálogo público de una tienda Shopify real para empezar."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/fuentes">Ir a Fuentes en vivo</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {stats.nichos.map((nicho) => (
                  <li key={nicho.nicho}>
                    <Link
                      href={`/dashboard/winning-products?nicho=${encodeURIComponent(nicho.nicho)}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/40 p-3 text-sm transition-colors hover:border-indigo-500/50 hover:bg-surface"
                    >
                      <span className="min-w-0 truncate font-medium">{nicho.nicho}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {nicho.tiendas} {nicho.tiendas === 1 ? "tienda" : "tiendas"} · {nicho.productos} productos
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-violet-400" />
              Oportunidades de hoy
            </CardTitle>
            <CardDescription>Productos reales vistos hace menos tiempo</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            {destacados.length === 0 ? (
              <EmptyState
                icon={Boxes}
                title="Sin productos reales todavía"
                description="Lee el catálogo de una tienda real en «Fuentes en vivo» para que aparezcan aquí."
              />
            ) : (
              destacados.map((producto) => (
                <a
                  key={producto.id}
                  href={producto.urlProducto ?? `https://${producto.tienda.dominio}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-xl border border-border/60 bg-surface/40 p-2.5 transition-colors hover:border-indigo-500/50 hover:bg-surface"
                >
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                    {producto.imagen && (
                      <Image src={producto.imagen} alt="" fill sizes="48px" className="object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium group-hover:text-indigo-300">{producto.titulo}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {producto.nuevo && (
                        <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                          Nuevo
                        </Badge>
                      )}
                      <span className="truncate">{producto.tienda.dominio}</span>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(producto.precio)}</span>
                </a>
              ))
            )}
            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link href="/dashboard/winning-products">
                Ver todos los nichos
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Timeline de tiendas seguidas + fuentes en vivo */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="size-4 text-amber-400" />
              Movimientos de tus tiendas
            </CardTitle>
            <CardDescription>Cambios detectados en las tiendas que sigues</CardDescription>
          </CardHeader>
          <CardContent>
            {timeline.length === 0 ? (
              <EmptyState
                icon={Store}
                title="No sigues ninguna tienda"
                description="Analiza una tienda Shopify y pulsa «Rastrear esta tienda» para empezar a ver su actividad aquí."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/shop-analyzer">Analizar una tienda</Link>
                  </Button>
                }
              />
            ) : (
              <ol className="space-y-3">
                {timeline.map((evento) => (
                  <li key={evento.id} className="flex gap-3">
                    <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
                      <Flame className="size-3" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{evento.title}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{evento.description}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                        <span>{evento.storeName}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(evento.detectedAt)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Fuentes en vivo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="size-4 text-emerald-400" />
              Fuentes en vivo
            </CardTitle>
            <CardDescription>Todo esto se lee del catálogo público real, sin ninguna clave</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Última lectura real</span>
              <Badge variant="secondary">
                {stats.ultimaLectura ? formatRelativeTime(stats.ultimaLectura) : "Todavía ninguna"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tiendas reales</span>
              <Badge variant="secondary">{stats.tiendasReales}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Productos reales</span>
              <Badge variant="secondary">{stats.productosReales}</Badge>
            </div>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href="/dashboard/fuentes">
                Añadir más tiendas reales
                <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
