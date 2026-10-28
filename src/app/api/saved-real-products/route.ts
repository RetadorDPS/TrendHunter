import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { guardarProductoReal, listProductosRealesGuardados, quitarProductoReal } from "@/lib/dal";
import { PLAN_LIMITS } from "@/lib/constants";

/** Lista los productos REALES guardados del usuario autenticado. */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const guardados = await listProductosRealesGuardados(sesion.user.id);
  return NextResponse.json({ items: guardados });
}

/** Guarda un producto real (con control de límite por plan). */
export async function POST(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { clave, titulo, nicho, imagen } = (await request.json()) as {
    clave?: string;
    titulo?: string;
    nicho?: string;
    imagen?: string | null;
  };
  if (!clave || !titulo || !nicho) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  const usuario = await prisma.user.findUnique({ where: { id: sesion.user.id }, select: { planType: true } });
  const limite = PLAN_LIMITS[usuario?.planType ?? "FREE"].savedProducts;
  const total = await prisma.savedRealProduct.count({ where: { userId: sesion.user.id } });
  if (limite !== null && total >= limite) {
    return NextResponse.json(
      {
        error: `Tu plan ${usuario?.planType} permite ${limite} favoritos. Mejora a Pro para guardar hasta 200.`,
        code: "PLAN_LIMIT",
      },
      { status: 402 },
    );
  }

  await guardarProductoReal(sesion.user.id, { clave, titulo, nicho, imagen: imagen ?? null });
  return NextResponse.json({ ok: true });
}

/** Quita un producto real de guardados. */
export async function DELETE(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { clave } = (await request.json()) as { clave?: string };
  if (!clave) return NextResponse.json({ error: "Falta el producto" }, { status: 400 });

  await quitarProductoReal(sesion.user.id, clave);
  return NextResponse.json({ ok: true });
}
