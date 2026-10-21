import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { MAX_EXTRA_SEATS } from "@/lib/constants";
import { asientosDelPlan, planEfectivo, precioAsientoExtra } from "@/lib/equipos";
import { createNotification } from "@/lib/notifications";
import { logger } from "@/lib/logger";
import { sincronizarAsientosStripe, stripeConfigured } from "@/lib/stripe";

/**
 * Compra o reduce asientos extra del equipo (por encima de los incluidos en
 * el plan). Solo el propietario decide: es quien paga la suscripción.
 *
 *   POST /api/equipos/asientos  { extraSeats, confirmar? }
 *
 * Sin `confirmar`, devuelve el presupuesto exacto (coste actual, nuevo y la
 * diferencia mensual) sin tocar nada. Con `confirmar: true`, aplica el
 * cambio: actualiza la suscripción real de Stripe si está configurada (nunca
 * reembolsa en silencio al reducir, solo dimensiona hacia delante) o lo deja
 * en modo demostración si no hay claves.
 */

const esquema = z.object({
  extraSeats: z.number().int().min(0).max(MAX_EXTRA_SEATS),
  confirmar: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) {
    return NextResponse.json({ error: `Número de asientos no válido (0-${MAX_EXTRA_SEATS}).` }, { status: 400 });
  }

  const equipo = await prisma.team.findUnique({
    where: { ownerId: sesion.user.id },
    include: { owner: true, members: true },
  });
  if (!equipo) return NextResponse.json({ error: "No tienes un equipo propio." }, { status: 404 });

  const plan = await planEfectivo(equipo.ownerId, sesion.user.planType);
  const precioExtra = precioAsientoExtra(plan);
  if (!precioExtra) {
    return NextResponse.json({ error: "Tu plan no vende asientos extra (solo Business y Agency)." }, { status: 402 });
  }

  const activos = equipo.members.filter((miembro) => miembro.status === "ACTIVE").length;
  const minimoNecesario = Math.max(0, activos - asientosDelPlan(plan));
  if (datos.data.extraSeats < minimoNecesario) {
    return NextResponse.json(
      {
        error: `Ahora mismo hay ${activos} personas activas y el plan incluye ${asientosDelPlan(plan)}. No puedes bajar de ${minimoNecesario} asiento(s) extra sin quitar antes a alguien.`,
      },
      { status: 409 },
    );
  }

  const actual = equipo.extraSeats;
  const nuevo = datos.data.extraSeats;
  const costoActual = precioExtra * actual;
  const costoNuevo = precioExtra * nuevo;

  if (!datos.data.confirmar) {
    return NextResponse.json({
      requiereConfirmacion: true,
      precioAsientoExtra: precioExtra,
      actual: { extraSeats: actual, costoMensual: costoActual },
      nuevo: { extraSeats: nuevo, costoMensual: costoNuevo },
      diferenciaMensual: costoNuevo - costoActual,
    });
  }

  if (nuevo === actual) {
    return NextResponse.json({
      ok: true,
      sinCambios: true,
      extraSeats: actual,
      asientosTotales: asientosDelPlan(plan) + actual,
      costoMensual: costoActual,
    });
  }

  let modo: "stripe" | "demo" = "demo";
  let itemId = equipo.stripeSeatItemId;
  const esSuscripcionReal = Boolean(
    equipo.owner.stripeSubscriptionId && !equipo.owner.stripeSubscriptionId.startsWith("sub_demo_"),
  );

  if (stripeConfigured() && esSuscripcionReal) {
    try {
      itemId = await sincronizarAsientosStripe({
        subscriptionId: equipo.owner.stripeSubscriptionId!,
        plan,
        extraSeats: nuevo,
        itemIdActual: equipo.stripeSeatItemId,
      });
      modo = "stripe";
    } catch (error) {
      return NextResponse.json(
        { error: `No se pudo actualizar la suscripción de Stripe: ${(error as Error).message}` },
        { status: 500 },
      );
    }
  }

  await prisma.team.update({
    where: { id: equipo.id },
    data: { extraSeats: nuevo, stripeSeatItemId: itemId },
  });

  await createNotification({
    userId: equipo.ownerId,
    type: "SUBSCRIPTION",
    title: nuevo > actual ? `${nuevo - actual} asiento(s) extra añadido(s)` : `${actual - nuevo} asiento(s) extra quitado(s)`,
    message:
      modo === "stripe"
        ? `La suscripción ahora factura ${costoNuevo} $/mes extra en asientos.`
        : `Cambio aplicado en modo demostración (sin Stripe conectado, no se cobra de verdad).`,
    actionUrl: "/dashboard/equipos",
  });

  logger.info("equipo_asientos_actualizados", {
    equipo: equipo.id,
    por: sesion.user.email,
    de: actual,
    a: nuevo,
    modo,
  });

  return NextResponse.json({
    ok: true,
    modo,
    extraSeats: nuevo,
    asientosTotales: asientosDelPlan(plan) + nuevo,
    costoMensual: costoNuevo,
    mensaje:
      modo === "demo"
        ? "Cambio guardado en modo demostración: añade STRIPE_SECRET_KEY, STRIPE_PRICE_SEAT_BUSINESS/AGENCY y conecta una suscripción real de Stripe para cobrarlo de verdad."
        : `Suscripción actualizada: ${nuevo} asiento(s) extra a ${precioExtra} $/mes cada uno.`,
  });
}
