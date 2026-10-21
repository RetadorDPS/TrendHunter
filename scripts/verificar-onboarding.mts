/**
 * Verificación del onboarding de 3 pasos (elegir nicho, seguir tiendas,
 * activar avisos) en el primer acceso al panel.
 *
 *   npm run verify:onboarding        (requiere `npm run start`)
 *
 * Comprueba que:
 *   1. Un usuario nuevo ve el onboarding al entrar a /dashboard.
 *   2. Completarlo guarda el nicho, sigue las tiendas elegidas (respetando el
 *      límite real del plan, sin inventar cupos) y marca «completado».
 *   3. No vuelve a aparecer tras recargar.
 *   4. Saltarlo en el primer paso lo marca «saltado» y no sigue tiendas.
 *   5. Una cuenta ya onboardeada (como las del seed) no lo ve.
 *
 * Crea y borra sus propios usuarios de prueba.
 */
import path from "node:path";
import { hash } from "bcryptjs";
import { chromium } from "playwright-core";
import prisma from "../src/lib/prisma.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");
const PASSWORD = "pruebaOnboarding1234";

const resultados: Array<{ nombre: string; ok: boolean }> = [];
function registrar(nombre: string, ok: boolean, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

async function crearUsuario(sufijo: string, planType: "FREE" | "PRO" | "BUSINESS" | "AGENCY" = "FREE") {
  const email = `onboarding-${sufijo}-${Date.now()}@trendhunter.pro`;
  const passwordHash = await hash(PASSWORD, 10);
  const usuario = await prisma.user.create({
    data: { email, name: "Prueba Onboarding", passwordHash, planType, emailVerified: new Date() },
  });
  return { id: usuario.id, email };
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

async function sesion(email: string) {
  const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark" });
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForTimeout(1_500);
  await pagina.fill("#email", email);
  await pagina.fill("#password", PASSWORD);
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(3_000);
  return { contexto, pagina };
}

const idsCreados: string[] = [];

try {
  // ---------------------------------------------------- 1 · flujo completo
  const completa = await crearUsuario("completa", "FREE");
  idsCreados.push(completa.id);
  const { pagina: paginaCompleta } = await sesion(completa.email);

  await paginaCompleta.waitForTimeout(1_000);
  const dialogoAbierto = await paginaCompleta.locator('[role="dialog"]').count();
  registrar("Un usuario nuevo ve el onboarding en /dashboard", dialogoAbierto > 0, `${dialogoAbierto} diálogo(s)`);
  const textoPaso1 = await paginaCompleta.locator('[role="dialog"]').innerText();
  registrar("Empieza en el paso 1 (elegir nicho)", textoPaso1.includes("Paso 1 de 3"));

  await paginaCompleta.getByRole("button", { name: "Mascotas", exact: true }).click();
  await paginaCompleta.getByRole("button", { name: /Continuar/i }).click();
  await paginaCompleta.waitForTimeout(800);
  const textoPaso2 = await paginaCompleta.locator('[role="dialog"]').innerText();
  registrar("Pasa al paso 2 (seguir tiendas) tras elegir nicho", textoPaso2.includes("Paso 2 de 3"));

  // FREE solo permite 2 tiendas: se marcan 3 para comprobar que el límite
  // real del plan se respeta de verdad (nunca se inventa cupo).
  const checks = paginaCompleta.locator('[role="dialog"] [role="checkbox"]');
  const totalCandidatas = await checks.count();
  for (let i = 0; i < Math.min(3, totalCandidatas); i++) await checks.nth(i).click();
  await paginaCompleta.getByRole("button", { name: /continuar/i }).click();
  await paginaCompleta.waitForTimeout(1_200);

  const seguidas = await prisma.trackedStore.count({ where: { userId: completa.id } });
  registrar(
    "Respeta el límite real del plan FREE (2) aunque se marquen 3",
    seguidas === Math.min(2, totalCandidatas),
    `${seguidas} tienda(s) seguida(s) de ${Math.min(3, totalCandidatas)} marcadas`,
  );

  const textoPaso3 = await paginaCompleta.locator('[role="dialog"]').innerText();
  registrar(
    "Pasa al paso 3 (activar avisos) con el panel real de push",
    textoPaso3.includes("Paso 3 de 3") && textoPaso3.includes("Avisos al móvil"),
  );

  await paginaCompleta.getByRole("button", { name: "Terminar" }).click();
  await paginaCompleta.waitForTimeout(1_000);
  const dialogoTrasTerminar = await paginaCompleta.locator('[role="dialog"]').count();
  registrar("El diálogo se cierra al terminar", dialogoTrasTerminar === 0);

  const usuarioTrasTerminar = await prisma.user.findUniqueOrThrow({ where: { id: completa.id } });
  registrar(
    "Guarda el nicho elegido y marca completado (no saltado)",
    usuarioTrasTerminar.onboardingNicho === "Mascotas" &&
      usuarioTrasTerminar.onboardingCompletadoEn !== null &&
      usuarioTrasTerminar.onboardingSaltadoEn === null,
    `nicho=${usuarioTrasTerminar.onboardingNicho}`,
  );

  await paginaCompleta.reload({ waitUntil: "domcontentloaded" });
  await paginaCompleta.waitForTimeout(1_200);
  const dialogoTrasRecargar = await paginaCompleta.locator('[role="dialog"]').count();
  registrar("No vuelve a aparecer tras recargar", dialogoTrasRecargar === 0);

  // ---------------------------------------------------------- 2 · saltarlo
  const salta = await crearUsuario("salta");
  idsCreados.push(salta.id);
  const { pagina: paginaSalta } = await sesion(salta.email);
  await paginaSalta.waitForTimeout(1_200);
  await paginaSalta.getByRole("button", { name: "Saltar" }).click();
  await paginaSalta.waitForTimeout(800);
  const dialogoTrasSaltar = await paginaSalta.locator('[role="dialog"]').count();
  registrar("Saltar cierra el diálogo al momento", dialogoTrasSaltar === 0);

  const usuarioTrasSaltar = await prisma.user.findUniqueOrThrow({ where: { id: salta.id } });
  registrar(
    "Saltar marca saltado (no completado) y no sigue tiendas",
    usuarioTrasSaltar.onboardingSaltadoEn !== null && usuarioTrasSaltar.onboardingCompletadoEn === null,
  );
  const seguidasTrasSaltar = await prisma.trackedStore.count({ where: { userId: salta.id } });
  registrar("No se sigue ninguna tienda al saltar en el paso 1", seguidasTrasSaltar === 0, `${seguidasTrasSaltar}`);

  // ------------------------------------------------- 3 · cuenta ya onboardeada
  const { pagina: paginaAdmin } = await sesion("admin@trendhunter.pro");
  await paginaAdmin.waitForTimeout(1_200);
  const dialogoAdmin = await paginaAdmin.locator('[role="dialog"]').count();
  registrar("Una cuenta ya onboardeada (admin del seed) no ve el diálogo", dialogoAdmin === 0, `${dialogoAdmin}`);
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, (error as Error).message);
} finally {
  await navegador.close();
  for (const id of idsCreados) {
    await prisma.trackedStore.deleteMany({ where: { userId: id } }).catch(() => {});
    await prisma.user.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
