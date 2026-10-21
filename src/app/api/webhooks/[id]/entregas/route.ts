import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";

/**
 *   GET /api/webhooks/:id/entregas
 *
 * Últimas entregas de un webhook (código, latencia y motivo del fallo), para
 * que el propietario vea lo que de verdad pasó sin salir del panel de
 * Notificaciones. Scoped al usuario de la sesión.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { id } = await params;
  const webhook = await prisma.webhook.findFirst({ where: { id, userId: sesion.user.id }, select: { id: true } });
  if (!webhook) return NextResponse.json({ error: "Webhook no encontrado." }, { status: 404 });

  const entregas = await prisma.webhookEntrega.findMany({
    where: { webhookId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    entregas: entregas.map((entrega) => ({
      id: entrega.id,
      evento: entrega.evento,
      estado: entrega.estado,
      ok: entrega.estado !== null && entrega.estado >= 200 && entrega.estado < 300,
      latenciaMs: entrega.latenciaMs,
      error: entrega.error,
      fecha: entrega.createdAt.toISOString(),
    })),
  });
}
