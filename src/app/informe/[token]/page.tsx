import type { Metadata } from "next";
import Image from "next/image";
import { headers } from "next/headers";
import { Clock, ExternalLink, Flame, Lock, ShieldCheck, Sparkles, Store as StoreIcon, TrendingUp } from "lucide-react";
import prisma from "@/lib/prisma";
import { claveDeIp, permitido } from "@/lib/limite";
import { getProductDetail, getStoreDetail } from "@/lib/dal";
import { obtenerProcedenciaProducto } from "@/lib/confianzaProducto";
import { etiquetaOportunidad } from "@/lib/confianza";
import { SelloConfianza } from "@/components/domain/sello-confianza";
import { ProcedenciaPanel } from "@/components/domain/procedencia-panel";
import { TrendScoreRing } from "@/components/domain/trend-score-ring";
import { SaturationBadge } from "@/components/domain/saturation-badge";
import { ProductTrendChart } from "@/components/charts/trend-area-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompactNumber, formatCurrency, formatRelativeTime } from "@/lib/utils";
import { TREND_DIRECTION_LABELS } from "@/types";

export const metadata: Metadata = {
  title: "Informe compartido",
  description: "Informe de solo lectura generado con TrendHunter Pro.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

/** Mensaje honesto cuando el enlace no se puede abrir (caducado, revocado o inexistente). */
function EnlaceNoDisponible({ motivo }: { motivo: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4 text-amber-400" />
            Este informe ya no está disponible
          </CardTitle>
          <CardDescription>{motivo} Pide un enlace nuevo a quien te lo compartió.</CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export default async function InformeCompartidoPage({ params }: PageProps) {
  const { token } = await params;

  // Límite por IP (no por token): evita que una sola máquina pruebe miles de
  // enlaces al azar. 60 vistas cada 10 min es de sobra para compartir de verdad.
  const clave = claveDeIp({ headers: await headers() } as Request, "informe-publico");
  if (!permitido(clave, 60, 600_000)) {
    return <EnlaceNoDisponible motivo="Demasiadas peticiones seguidas desde tu red. Espera unos minutos." />;
  }

  const informe = await prisma.informeCompartido.findUnique({
    where: { token },
    include: { user: { select: { name: true, email: true } }, cliente: { select: { nombre: true } } },
  });

  if (!informe) return <EnlaceNoDisponible motivo="El enlace no existe o se ha escrito mal." />;
  if (informe.revocadoEn) return <EnlaceNoDisponible motivo="Quien lo compartió lo ha revocado." />;
  if (informe.expiraEn < new Date()) {
    return <EnlaceNoDisponible motivo={`Caducó el ${informe.expiraEn.toLocaleDateString("es-ES")}.`} />;
  }

  // Cuenta la vista sin bloquear el render (no es crítico si falla).
  void prisma.informeCompartido
    .update({ where: { id: informe.id }, data: { vistas: { increment: 1 }, ultimaVistaEn: new Date() } })
    .catch(() => {});

  const propietario = informe.user.name ?? informe.user.email;
  const paraCliente = informe.cliente?.nombre;

  const cabecera = (titulo: string, subtitulo: string) => (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
      <div>
        <p className="mb-1 text-xs text-muted-foreground">
          Informe de {propietario}
          {paraCliente ? ` · preparado para ${paraCliente}` : ""}
        </p>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{subtitulo}</p>
      </div>
      <Badge variant="outline" className="shrink-0 gap-1.5 border-amber-500/30 text-amber-300">
        <Clock className="size-3.5" />
        Válido hasta {informe.expiraEn.toLocaleDateString("es-ES")}
      </Badge>
    </header>
  );

  const pie = (
    <footer className="mt-10 border-t border-border/60 pt-4 text-center text-xs text-muted-foreground">
      Generado con{" "}
      <a href="/" className="font-medium text-indigo-300 hover:underline">
        TrendHunter Pro
      </a>{" "}
      · solo lectura, sin datos de otras cuentas.
    </footer>
  );

  if (informe.tipo === "PRODUCTO") {
    const [detalle, procedencia] = await Promise.all([
      getProductDetail(informe.entidadId),
      obtenerProcedenciaProducto(informe.entidadId),
    ]);
    if (!detalle) return <EnlaceNoDisponible motivo="El producto de este informe ya no existe." />;
    const { product, metrics } = detalle;

    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        {cabecera(product.title, `${product.category} · ${product.nicheTag}`)}

        <div className="mb-6 flex flex-wrap items-center gap-2">
          <SelloConfianza
            nivel={product.nivelConfianza}
            puntos={product.confianza}
            fuentesMedidas={product.fuentesMedidas}
            diasDesdeUltima={
              product.ultimaMedicion
                ? Math.max(0, Math.floor((Date.now() - new Date(product.ultimaMedicion).getTime()) / 86_400_000))
                : null
            }
          />
          {product.isGoldenOpportunity && (
            <Badge variant={product.nivelConfianza === "VERIFICADO" ? "gradient" : "outline"} className="gap-1">
              <Sparkles className="size-3" />
              {etiquetaOportunidad(true, product.nivelConfianza)}
            </Badge>
          )}
          <SaturationBadge level={product.saturationLevel} />
          <Badge variant={product.trendDirection === "RISING" ? "success" : product.trendDirection === "FALLING" ? "danger" : "muted"} className="gap-1">
            <TrendingUp className="size-3" />
            {TREND_DIRECTION_LABELS[product.trendDirection]} · velocidad {Math.round(product.velocityScore)}
          </Badge>
          {product.velocityScore >= 70 && (
            <Badge variant="danger" className="gap-1">
              <Flame className="size-3" />
              Producto viral
            </Badge>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          {product.mainImage && (
            <div className="relative mx-auto size-40 shrink-0 overflow-hidden rounded-lg border border-border/60 sm:mx-0">
              <Image src={product.mainImage} alt={product.title} fill className="object-cover" sizes="160px" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-6">
            <TrendScoreRing score={product.trendScore} size={88} strokeWidth={8} showLabel />
            <div className="space-y-1 text-sm">
              <p>
                Precio de venta sugerido: <strong>{formatCurrency(product.suggestedSellPrice)}</strong>
              </p>
              <p>
                Margen estimado: <strong>{product.estimatedMargin}%</strong>
              </p>
              <p>
                Volumen de búsqueda: <strong>{formatCompactNumber(product.googleSearchVolume)}</strong>/mes
              </p>
              <p className="text-muted-foreground">Actualizado {formatRelativeTime(product.updatedAt)}</p>
            </div>
          </div>
        </div>

        {metrics.length > 1 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Evolución de los últimos 30 días</CardTitle>
            </CardHeader>
            <CardContent>
              <ProductTrendChart data={metrics} height={260} />
            </CardContent>
          </Card>
        )}

        <div className="mt-6">
          {procedencia ? (
            <ProcedenciaPanel
              nivel={procedencia.evaluacion.nivel}
              evaluacion={procedencia.evaluacion}
              items={procedencia.items}
              consulta={procedencia.consulta}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Sin procedencia todavía
                </CardTitle>
                <CardDescription>Este producto no tiene mediciones registradas.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>

        {pie}
      </main>
    );
  }

  // --------------------------------------------------------------- TIENDA
  const detalleTienda = await getStoreDetail(informe.entidadId);
  if (!detalleTienda) return <EnlaceNoDisponible motivo="La tienda de este informe ya no existe." />;
  const { store } = detalleTienda;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      {cabecera(store.name, `${store.domain} · ${store.niche}`)}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Facturación estimada</CardDescription>
            <CardTitle className="text-xl">{formatCurrency(store.estimatedMonthlyRevenue)}/mes</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tráfico mensual</CardDescription>
            <CardTitle className="text-xl">{formatCompactNumber(store.monthlyVisits)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Catálogo</CardDescription>
            <CardTitle className="text-xl">{store.productsCount} productos</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StoreIcon className="size-4 text-indigo-400" />
            Top productos
          </CardTitle>
          <CardDescription>Estimación por ventas, sin medición certificada por fuente externa.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {store.topProducts.slice(0, 8).map((producto, indice) => (
              <li key={`${producto.title}-${indice}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{producto.title}</span>
                <span className="shrink-0 text-muted-foreground">{formatCurrency(producto.price)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {store.appsDetected.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Apps detectadas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {store.appsDetected.map((app) => (
              <Badge key={app} variant="outline">
                {app}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ExternalLink className="size-3.5" />
        <a href={store.shopifyUrl} target="_blank" rel="noreferrer" className="hover:underline">
          Ver la tienda
        </a>
      </p>

      {pie}
    </main>
  );
}
