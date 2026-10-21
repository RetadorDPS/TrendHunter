import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { urlApp } from "@/lib/app-url";
import {
  DIAS_VALIDEZ_DEFECTO,
  DIAS_VALIDEZ_MAXIMO,
  generarTokenInforme,
  planPermiteCompartir,
  urlInforme,
} from "@/lib/informesCompartidos";
import { logger } from "@/lib/logger";

/**
 *   POST   /api/productos/:id/informe/compartir   { clienteId?, dias? }
 *   DELETE /api/productos/:id/informe/compartir
 *
 * Crea (o reutiliza, si ya hay uno activo) el enlace público de solo lectura
 * de este producto, o revoca el que esté activo. Solo Agency: es la pieza
 * que vende "clientes propios".
 */

const esquemaCrear = z.object({
  clienteId: z.string().optional(),
  dias: z.number().int().min(1).max(DIAS_VALIDEZ_MAXIMO).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (!planPermiteCompartir(sesion.user.planType)) {
    return NextResponse.json(
      { error: "Compartir informes está en el plan Agency (incluye el modo cliente).", plan: true },
      { status: 402 },
    );
  }

  const { id } = await params;
  const producto = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });

  const datos = esquemaCrear.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });

  if (datos.data.clienteId) {
    const cliente = await prisma.cliente.findFirst({
      where: { id: datos.data.clienteId, ownerId: sesion.user.id },
      select: { id: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado." }, { status: 404 });
  }

  // Reutiliza el enlace activo si ya existe uno (no acumula tokens sin usar).
  const activo = await prisma.informeCompartido.findFirst({
    where: { userId: sesion.user.id, tipo: "PRODUCTO", entidadId: id, revocadoEn: null, expiraEn: { gt: new Date() } },
  });

  const dias = datos.data.dias ?? DIAS_VALIDEZ_DEFECTO;
  const expiraEn = new Date(Date.now() + dias * 86_400_000);

  const informe = activo
    ? await prisma.informeCompartido.update({
        where: { id: activo.id },
        data: { expiraEn, ...(datos.data.clienteId ? { clienteId: datos.data.clienteId } : {}) },
      })
    : await prisma.informeCompartido.create({
        data: {
          userId: sesion.user.id,
          tipo: "PRODUCTO",
          entidadId: id,
          clienteId: datos.data.clienteId,
          token: generarTokenInforme(),
          expiraEn,
        },
      });

  logger.info("informe_compartido_creado", { usuario: sesion.user.email, tipo: "PRODUCTO", entidad: id });

  return NextResponse.json({
    url: urlInforme(urlApp(request), informe.token),
    expiraEn: informe.expiraEn.toISOString(),
    reutilizado: Boolean(activo),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const { id } = await params;
  const revocados = await prisma.informeCompartido.updateMany({
    where: { userId: sesion.user.id, tipo: "PRODUCTO", entidadId: id, revocadoEn: null },
    data: { revocadoEn: new Date() },
  });

  return NextResponse.json({ ok: true, revocados: revocados.count });
}
