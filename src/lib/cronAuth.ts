import "server-only";

import { auth } from "@/auth";

/**
 * Autorización para tareas programadas (cron).
 *
 * Tres vías válidas:
 *  1 · Cabecera `x-cron-secret` con el CRON_SECRET
 *      (GitHub Actions, cron-job.org…).
 *  2 · Cabecera `Authorization: Bearer <CRON_SECRET>`, que es la que manda
 *      Vercel Cron automáticamente cuando el proyecto tiene una variable de
 *      entorno llamada `CRON_SECRET` (sin configurar nada aparte).
 *  3 · Sesión de administrador (para pruebas manuales).
 *
 * Devuelve { autorizado, via, respuesta } — `respuesta`
 * solo se usa cuando NO está autorizado.
 */
export async function autorizarTarea(request: Request): Promise<{
  autorizado: boolean;
  via?: "cron" | "admin";
  respuesta?: Response;
}> {
  const secreto = process.env.CRON_SECRET ?? "";
  const cabecera = request.headers.get("x-cron-secret") ?? "";
  const autorizacionBearer = request.headers.get("authorization") ?? "";

  if (secreto && (cabecera === secreto || autorizacionBearer === `Bearer ${secreto}`)) {
    return { autorizado: true, via: "cron" };
  }

  const sesion = await auth();
  if (sesion?.user && (sesion.user as { role?: string }).role === "ADMIN") {
    return { autorizado: true, via: "admin" };
  }

  return {
    autorizado: false,
    respuesta: new Response(
      JSON.stringify({ error: "No autorizado: se requiere x-cron-secret o sesión de admin." }),
      { status: 401, headers: { "content-type": "application/json" } },
    ),
  };
}
