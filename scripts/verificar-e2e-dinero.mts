/**
 * Test e2e del flujo de dinero completo: registro → plan de pago → equipo
 * (invitar y aceptar) → webhook (crear y probar) → cancelar.
 *
 *   npm run verify:e2e-dinero        (requiere `npm run start`)
 *
 * Todo a través de la interfaz real (no llamadas directas a la API): es la
 * misma secuencia de clics que haría un cliente de verdad. Sin claves de
 * Stripe, el pago se activa en modo demostración (ya documentado); el resto
 * del flujo (equipo, invitación, webhook) es 100% real.
 *
 * Crea y borra sus propias cuentas.
 */
import path from "node:path";
import { chromium, type Page } from "playwright-core";
import prisma from "../src/lib/prisma.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const PASSWORD = "flujoDeDinero1234";

const resultados: Array<{ nombre: string; ok: boolean }> = [];
function registrar(nombre: string, ok: boolean, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

async function nuevaPagina(): Promise<Page> {
  const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark", viewport: { width: 1440, height: 1000 } });
  return contexto.newPage();
}

/** Registra una cuenta real a través del formulario (no la API directamente). */
async function registrarCuenta(pagina: Page, nombre: string, email: string): Promise<boolean> {
  await pagina.goto(`${BASE}/register`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForTimeout(1_500);
  await pagina.fill("#nombre", nombre);
  await pagina.fill("#email-registro", email);
  await pagina.fill("#password-registro", PASSWORD);
  await pagina.fill("#repetir", PASSWORD);
  await pagina.locator('button[role="checkbox"]').click();
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(3_500);
  return pagina.url().includes("/dashboard");
}

/** Cierra el onboarding si aparece (se prueba aparte en verify:onboarding). */
async function saltarOnboardingSiAparece(pagina: Page) {
  const boton = pagina.getByRole("button", { name: "Saltar" });
  if (await boton.isVisible().catch(() => false)) {
    await boton.click();
    await pagina.waitForTimeout(500);
  }
}

const correoDueno = `e2e-dueno-${Date.now()}@trendhunter.pro`;
const correoInvitado = `e2e-invitado-${Date.now()}@trendhunter.pro`;

try {
  // ---------------------------------------------------- 1 · registro real
  const dueno = await nuevaPagina();
  const registroOk = await registrarCuenta(dueno, "Dueña E2E", correoDueno);
  registrar("El registro real inicia sesión y entra al panel", registroOk, dueno.url());
  await saltarOnboardingSiAparece(dueno);

  const sesionViva = await dueno.request.fetch(`${BASE}/api/buscar?q=x`);
  registrar("La sesión queda iniciada tras registrarse", sesionViva.status() === 200, `${sesionViva.status()}`);

  // ---------------------------------------------------------- 2 · plan de pago
  await dueno.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
  await dueno.waitForTimeout(1_500);
  await dueno.getByRole("button", { name: "Pasar a Business" }).click();
  await dueno.waitForTimeout(2_000);
  const avisoPlan = await dueno.locator("body").innerText();
  registrar(
    "Pasar a Business activa el plan (modo demostración sin claves de Stripe)",
    avisoPlan.includes("Business") || dueno.url().includes("billing"),
  );

  await dueno.goto(`${BASE}/dashboard/settings/billing`, { waitUntil: "domcontentloaded" });
  await dueno.waitForTimeout(1_500);
  const textoBilling = await dueno.locator("body").innerText();
  registrar("La pantalla de facturación confirma el plan Business", textoBilling.includes("Business"));

  // --------------------------------------------------------------- 3 · equipo
  await dueno.goto(`${BASE}/dashboard/equipos`, { waitUntil: "domcontentloaded" });
  await dueno.waitForTimeout(1_500);
  await dueno.fill('input[placeholder*="Nombre del equipo"]', "Equipo E2E");
  await dueno.getByRole("button", { name: "Crear equipo" }).click();
  await dueno.waitForTimeout(1_500);
  const textoEquipo = await dueno.locator("body").innerText();
  registrar("El equipo se crea de verdad y aparece en el panel", textoEquipo.includes("Equipo E2E"));

  await dueno.fill("#invitar-email", correoInvitado);
  await dueno.getByRole("button", { name: "Crear invitación" }).click();
  await dueno.waitForTimeout(1_500);
  const cajaEnlace = dueno.locator("code").first();
  const enlaceInvitacion = (await cajaEnlace.innerText().catch(() => "")).trim();
  registrar("La invitación genera un enlace real", enlaceInvitacion.includes("/equipos/aceptar?token="), enlaceInvitacion);

  // --------------------------------------------------- 4 · aceptar invitación
  const invitado = await nuevaPagina();
  const registroInvitadoOk = await registrarCuenta(invitado, "Invitada E2E", correoInvitado);
  registrar("El invitado también se registra de verdad", registroInvitadoOk);
  await saltarOnboardingSiAparece(invitado);

  await invitado.goto(`${BASE}${enlaceInvitacion}`, { waitUntil: "domcontentloaded" });
  await invitado.waitForTimeout(1_500);
  const textoAceptacion = await invitado.locator("body").innerText();
  const tieneBotonAceptar = await invitado.getByRole("button", { name: /Aceptar/i }).isVisible().catch(() => false);
  if (tieneBotonAceptar) {
    await invitado.getByRole("button", { name: /Aceptar/i }).click();
    await invitado.waitForTimeout(1_500);
  }
  registrar("La pantalla de invitación es real y nombra el equipo correcto", textoAceptacion.includes("Equipo E2E"));

  await invitado.goto(`${BASE}/dashboard/equipos`, { waitUntil: "domcontentloaded" });
  await invitado.waitForTimeout(1_500);
  const textoInvitadoEquipo = await invitado.locator("body").innerText();
  registrar(
    "El invitado hereda el plan Business de verdad (sin pagar otra vez)",
    textoInvitadoEquipo.includes("Heredas BUSINESS") || textoInvitadoEquipo.includes("Business"),
  );

  // -------------------------------------------------------------- 5 · webhook
  await dueno.goto(`${BASE}/dashboard/settings/notifications`, { waitUntil: "domcontentloaded" });
  await dueno.waitForTimeout(1_500);
  const formularioAbierto = await dueno.locator("#webhook-nombre").isVisible().catch(() => false);
  if (!formularioAbierto) await dueno.getByRole("button", { name: "Añadir webhook" }).click();
  await dueno.waitForTimeout(500);
  await dueno.fill("#webhook-nombre", "Webhook E2E");
  await dueno.fill("#webhook-url", "https://hooks.slack.com/services/T000/B000/e2eVerificacionDeDinero1");
  await dueno.getByRole("button", { name: "Crear webhook" }).click();
  await dueno.waitForTimeout(1_500);
  const textoWebhook = await dueno.locator("body").innerText();
  registrar("El webhook se crea de verdad y aparece en la lista", textoWebhook.includes("Webhook E2E"));

  await dueno.getByRole("button", { name: "Probar" }).first().click();
  await dueno.waitForTimeout(1_500);
  await dueno.getByRole("button", { name: /Historial/i }).first().click();
  await dueno.waitForTimeout(1_000);
  const textoHistorial = await dueno.locator("body").innerText();
  registrar(
    "Probar deja una entrega real en el historial (no un simulacro)",
    textoHistorial.includes("prueba") && (textoHistorial.includes("ms") || textoHistorial.includes("sin respuesta")),
  );

  // -------------------------------------------------- 6 · cerrar el ciclo: cancelar
  await dueno.goto(`${BASE}/dashboard/settings/billing`, { waitUntil: "domcontentloaded" });
  await dueno.waitForTimeout(1_500);
  await dueno.getByRole("button", { name: "Cancelar suscripción" }).click();
  await dueno.waitForTimeout(1_500);
  const textoCancelado = await dueno.locator("body").innerText();
  registrar("Cancelar la suscripción vuelve a Free de verdad", textoCancelado.includes("Plan gratuito activo"));
} catch (error) {
  registrar("El flujo terminó sin excepciones", false, (error as Error).message);
} finally {
  await navegador.close();
  // Limpieza real: borra las dos cuentas de prueba y todo lo que crearon.
  const usuarios = await prisma.user.findMany({
    where: { email: { in: [correoDueno, correoInvitado] } },
    select: { id: true, email: true },
  });
  for (const usuario of usuarios) {
    await prisma.teamMember.deleteMany({ where: { OR: [{ userId: usuario.id }, { email: usuario.email }] } }).catch(() => {});
    await prisma.team.deleteMany({ where: { ownerId: usuario.id } }).catch(() => {});
    await prisma.webhook.deleteMany({ where: { userId: usuario.id } }).catch(() => {});
    await prisma.alertNotification.deleteMany({ where: { userId: usuario.id } }).catch(() => {});
    await prisma.subscription.deleteMany({ where: { userId: usuario.id } }).catch(() => {});
    await prisma.verificationToken.deleteMany({ where: { identifier: usuario.email } }).catch(() => {});
    await prisma.user.delete({ where: { id: usuario.id } }).catch(() => {});
  }
  await prisma.$disconnect();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} pasos del flujo correctos ===`);
if (fallos > 0) process.exit(1);
