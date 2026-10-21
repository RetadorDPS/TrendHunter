import { randomBytes } from "node:crypto";
import type { PlanType } from "@/types";

/**
 * ============================================================================
 *  INFORMES COMPARTIBLES (modo agencia)
 * ============================================================================
 *  Enlace público de solo lectura a un informe de producto o tienda: el
 *  propietario (plan Agency) lo genera para un cliente suyo, con caducidad y
 *  revocable en cualquier momento. La ruta pública (`/informe/:token`) nunca
 *  expone más que lo que ese registro apunta: ni otros productos, ni otras
 *  cuentas, ni datos internos.
 * ============================================================================
 */

export const DIAS_VALIDEZ_DEFECTO = 14;
export const DIAS_VALIDEZ_MAXIMO = 90;

/** Solo Agency vende el modo cliente, así que solo Agency comparte informes. */
export function planPermiteCompartir(plan: PlanType): boolean {
  return plan === "AGENCY";
}

/** Token largo de un solo enlace (igual de entropía que las invitaciones de equipo). */
export function generarTokenInforme(): string {
  return randomBytes(24).toString("base64url");
}

/** URL pública completa a partir del token. */
export function urlInforme(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/informe/${token}`;
}
