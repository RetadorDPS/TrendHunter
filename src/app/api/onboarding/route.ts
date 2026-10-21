import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { logger } from "@/lib/logger";

/**
 *   PATCH /api/onboarding
 *
 * Onboarding de 3 pasos (elegir nicho, seguir tiendas, activar avisos) en el
 * primer acceso al panel. No hay pantalla ni ruta nueva: solo guarda el
 * progreso para no volver a mostrarlo.
 *
 *   { "nicho": "Mascotas" }       → guarda el nicho elegido (paso 1)
 *   { "estado": "completado" }    → terminó los 3 pasos
 *   { "estado": "saltado" }       → lo saltó (se puede llamar en cualquier paso)
 */

const esquema = z
  .object({
    nicho: z.enum(PRODUCT_CATEGORIES).optional(),
    estado: z.enum(["completado", "saltado"]).optional(),
  })
  .refine((datos) => datos.nicho !== undefined || datos.estado !== undefined, {
    message: "No hay nada que guardar.",
  });

export async function PATCH(request: Request) {
  const sesion = await auth();
  if (!sesion?.user?.id) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });

  const datos = esquema.safeParse(await request.json().catch(() => ({})));
  if (!datos.success) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });

  const actualizado = await prisma.user.update({
    where: { id: sesion.user.id },
    data: {
      ...(datos.data.nicho ? { onboardingNicho: datos.data.nicho } : {}),
      ...(datos.data.estado === "completado" ? { onboardingCompletadoEn: new Date() } : {}),
      ...(datos.data.estado === "saltado" ? { onboardingSaltadoEn: new Date() } : {}),
    },
    select: { onboardingNicho: true, onboardingCompletadoEn: true, onboardingSaltadoEn: true },
  });

  if (datos.data.estado) {
    logger.info("onboarding_" + datos.data.estado, { usuario: sesion.user.email, nicho: actualizado.onboardingNicho });
  }

  return NextResponse.json({
    onboardingNicho: actualizado.onboardingNicho,
    visto: Boolean(actualizado.onboardingCompletadoEn || actualizado.onboardingSaltadoEn),
  });
}
