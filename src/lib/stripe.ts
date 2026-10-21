import Stripe from "stripe";
import { PLANS } from "@/lib/constants";
import type { PlanType } from "@/types";

/**
 * ============================================================================
 *  STRIPE: SUSCRIPCIONES
 * ============================================================================
 *  · Modo test listo para usar con las claves de prueba de Stripe.
 *  · Si no hay claves configuradas, la plataforma funciona en "modo demo":
 *    el cambio de plan se simula localmente para poder validar todo el flujo.
 * ============================================================================
 */

/** ¿Hay claves de Stripe configuradas? */
export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cliente: Stripe | null = null;

/** Cliente de Stripe (singleton). Lanza si no hay clave. */
export function getStripe(): Stripe {
  const clave = process.env.STRIPE_SECRET_KEY;
  if (!clave) throw new Error("STRIPE_SECRET_KEY no está configurada.");
  if (!cliente) {
    cliente = new Stripe(clave, { apiVersion: "2025-11-17.clover" as Stripe.LatestApiVersion, typescript: true });
  }
  return cliente;
}

/** Mapa plan → precio de Stripe (leído de variables de entorno). */
export function getPriceId(plan: PlanType): string | null {
  const variables: Record<PlanType, string | undefined> = {
    FREE: undefined,
    PRO: process.env.STRIPE_PRICE_PRO,
    BUSINESS: process.env.STRIPE_PRICE_BUSINESS,
    AGENCY: process.env.STRIPE_PRICE_AGENCY,
  };
  return variables[plan] ?? null;
}

/** Precio de Stripe del asiento extra de un plan (Business/Agency), si existe. */
export function getSeatPriceId(plan: PlanType): string | null {
  const variables: Partial<Record<PlanType, string | undefined>> = {
    BUSINESS: process.env.STRIPE_PRICE_SEAT_BUSINESS,
    AGENCY: process.env.STRIPE_PRICE_SEAT_AGENCY,
  };
  return variables[plan] ?? null;
}

/** Mapa inverso: precio de Stripe → plan de la plataforma. */
export function getPlanFromPriceId(priceId: string | null | undefined): PlanType {
  if (!priceId) return "FREE";
  if (priceId === process.env.STRIPE_PRICE_BUSINESS) return "BUSINESS";
  if (priceId === process.env.STRIPE_PRICE_AGENCY) return "AGENCY";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "PRO";
  return "PRO";
}

/** Crea (o reutiliza) el cliente de Stripe asociado al usuario. */
export async function ensureStripeCustomer(usuario: {
  id: string;
  email: string;
  name?: string | null;
  stripeCustomerId?: string | null;
}): Promise<string> {
  const stripe = getStripe();
  if (usuario.stripeCustomerId) return usuario.stripeCustomerId;
  const clienteCreado = await stripe.customers.create({
    email: usuario.email,
    name: usuario.name ?? undefined,
    metadata: { userId: usuario.id },
  });
  return clienteCreado.id;
}

/** Crea una sesión de checkout de suscripción y devuelve su URL. */
export async function createCheckoutSession(params: {
  plan: PlanType;
  customerId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  const priceId = getPriceId(params.plan);
  if (!priceId) {
    throw new Error(
      `Falta el precio de Stripe para el plan ${params.plan}. Define STRIPE_PRICE_${params.plan} en el .env`,
    );
  }
  const sesion = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: params.userId, plan: params.plan } },
    metadata: { userId: params.userId, plan: params.plan },
  });
  if (!sesion.url) throw new Error("Stripe no devolvió la URL de pago.");
  return sesion.url;
}

/**
 * Sincroniza la cantidad de asientos extra con la suscripción real de Stripe.
 *
 * Los asientos extra viajan como un ítem aparte dentro de la MISMA
 * suscripción (su propio precio por unidad): así el plan base no cambia de
 * precio y los asientos se facturan por lo que de verdad cuestan.
 *
 *   · extraSeats > 0 y no hay ítem todavía → se crea con esa cantidad.
 *   · extraSeats > 0 y ya hay ítem         → se actualiza la cantidad.
 *   · extraSeats === 0 y hay ítem          → se borra (deja de facturarse).
 *
 * Devuelve el id del subscription item (o `null` si ya no existe ninguno).
 */
export async function sincronizarAsientosStripe(params: {
  subscriptionId: string;
  plan: PlanType;
  extraSeats: number;
  itemIdActual?: string | null;
}): Promise<string | null> {
  const stripe = getStripe();
  const seatPriceId = getSeatPriceId(params.plan);
  if (!seatPriceId) {
    throw new Error(`Falta el precio de asiento extra para ${params.plan}. Define STRIPE_PRICE_SEAT_${params.plan}.`);
  }

  if (params.extraSeats <= 0) {
    if (params.itemIdActual) await stripe.subscriptionItems.del(params.itemIdActual);
    return null;
  }

  if (params.itemIdActual) {
    const item = await stripe.subscriptionItems.update(params.itemIdActual, { quantity: params.extraSeats });
    return item.id;
  }

  const item = await stripe.subscriptionItems.create({
    subscription: params.subscriptionId,
    price: seatPriceId,
    quantity: params.extraSeats,
  });
  return item.id;
}

/** Crea una sesión del portal de cliente (gestionar/cancelar suscripción). */
export async function createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const stripe = getStripe();
  const sesion = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return sesion.url;
}

/**
 * Planes disponibles con su información comercial y de Stripe.
 * Centraliza lo que muestra la página de precios.
 */
export function getPlansWithStripeStatus() {
  return PLANS.map((plan) => ({
    ...plan,
    stripeConfigured: plan.id === "FREE" ? true : Boolean(getPriceId(plan.id)),
  }));
}

/** Verifica la firma del webhook y devuelve el evento. */
export function constructWebhookEvent(payload: string, signature: string): Stripe.Event {
  const secreto = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secreto) throw new Error("STRIPE_WEBHOOK_SECRET no está configurada.");
  return getStripe().webhooks.constructEvent(payload, signature, secreto);
}

/** Formatea un importe de Stripe (en céntimos) a euros. */
export function formatStripeAmount(cantidadEnCentimos: number, moneda = "eur"): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda.toUpperCase() }).format(
    cantidadEnCentimos / 100,
  );
}
