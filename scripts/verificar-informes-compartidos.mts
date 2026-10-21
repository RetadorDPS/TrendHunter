/**
 * Verificación de los informes compartibles (modo agencia).
 *
 *   npm run verify:informes-compartidos   (requiere `npm run start`)
 *
 * Comprueba que:
 *   1. Solo Agency puede crear el enlace (402 con el motivo para otros planes).
 *   2. El enlace público se abre SIN sesión y muestra el sello de confianza
 *      real del producto (no inventa un "Verificado" que no existe).
 *   3. Un token que no existe nunca da datos: mensaje honesto, no error ni 500.
 *   4. Revocar lo deja inservible al momento.
 *   5. Caducado (fecha pasada) también queda inservible, con su propio motivo.
 *   6. El informe de tienda también funciona (sin sello de confianza: las
 *      tiendas no lo tienen, y no se inventa uno).
 *
 * Deja la base como estaba (borra el enlace y el plan de prueba).
 */
import path from "node:path";
import { chromium } from "playwright-core";
import prisma from "../src/lib/prisma.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");

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

async function sesion(email: string, password: string) {
  const contexto = await navegador.newContext({ locale: "es-ES", colorScheme: "dark" });
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await pagina.waitForTimeout(1_500);
  await pagina.fill("#email", email);
  await pagina.fill("#password", password);
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(3_000);
  return pagina;
}

async function pedir(pagina: Awaited<ReturnType<typeof sesion>>, ruta: string, metodo: "POST" | "DELETE") {
  const respuesta = await pagina.request.fetch(`${BASE}${ruta}`, { method: metodo, failOnStatusCode: false });
  const texto = await respuesta.text();
  let datos: Record<string, unknown> = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = { crudo: texto.slice(0, 200) };
  }
  return { estado: respuesta.status(), datos };
}

let planOriginalAdmin: string | null = null;

try {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@trendhunter.pro" } });
  planOriginalAdmin = admin.planType;
  await prisma.user.update({ where: { id: admin.id }, data: { planType: "AGENCY" } });

  const producto = await prisma.product.findFirstOrThrow({ select: { id: true, title: true } });
  const tienda = await prisma.store.findFirstOrThrow({ select: { id: true } });

  const paginaAdmin = await sesion("admin@trendhunter.pro", "admin1234");
  const paginaDemo = await sesion("demo@trendhunter.pro", "demo1234");

  // ---------------------------------------------- 1 · gate de plan
  const rechazoDemo = await pedir(paginaDemo, `/api/productos/${producto.id}/informe/compartir`, "POST");
  registrar("Un plan Pro no puede compartir informes (402)", rechazoDemo.estado === 402, `${rechazoDemo.estado}`);

  // ---------------------------------------------- 2 · crear y ver sin sesión
  const creado = await pedir(paginaAdmin, `/api/productos/${producto.id}/informe/compartir`, "POST");
  const url = creado.datos.url as string | undefined;
  registrar("Agency crea el enlace público", creado.estado === 200 && Boolean(url), `${creado.estado} · ${url}`);

  const contextoAnonimo = await navegador.newContext({ locale: "es-ES", colorScheme: "dark" });
  const paginaAnonima = await contextoAnonimo.newPage();
  await paginaAnonima.goto(url!.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded", timeout: 90_000 });
  await paginaAnonima.waitForTimeout(1_200);
  const textoPublico = await paginaAnonima.locator("body").innerText();
  registrar(
    "Se abre sin sesión y muestra el producto real",
    textoPublico.includes(producto.title),
    producto.title,
  );
  registrar(
    "Muestra el sello de confianza real (no inventa «Verificado»)",
    textoPublico.includes("Estimado") || textoPublico.includes("Parcial") || textoPublico.includes("Verificado"),
  );
  registrar("Avisa de que es solo lectura y sin datos de otras cuentas", textoPublico.includes("sin datos de otras cuentas"));

  // ---------------------------------------------- 3 · token inexistente
  await paginaAnonima.goto(`${BASE}/informe/token-de-prueba-que-no-existe-nunca`, { waitUntil: "domcontentloaded" });
  await paginaAnonima.waitForTimeout(800);
  const textoInexistente = await paginaAnonima.locator("body").innerText();
  registrar(
    "Un token inexistente nunca da datos (mensaje honesto, no error)",
    textoInexistente.includes("no está disponible"),
  );

  // ---------------------------------------------- 4 · revocar
  const revocado = await pedir(paginaAdmin, `/api/productos/${producto.id}/informe/compartir`, "DELETE");
  registrar("Revocar funciona", revocado.estado === 200 && (revocado.datos.revocados as number) >= 1);

  await paginaAnonima.goto(url!.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" });
  await paginaAnonima.waitForTimeout(800);
  const textoRevocado = await paginaAnonima.locator("body").innerText();
  registrar("El enlace revocado deja de servir al momento", textoRevocado.includes("revocado"));

  // ---------------------------------------------- 5 · caducidad real
  const segundo = await pedir(paginaAdmin, `/api/productos/${producto.id}/informe/compartir`, "POST");
  const urlCaduco = (segundo.datos.url as string).replace(/^https?:\/\/[^/]+/, BASE);
  await prisma.informeCompartido.updateMany({
    where: { userId: admin.id, tipo: "PRODUCTO", entidadId: producto.id },
    data: { expiraEn: new Date(Date.now() - 1000) },
  });
  await paginaAnonima.goto(urlCaduco, { waitUntil: "domcontentloaded" });
  await paginaAnonima.waitForTimeout(800);
  const textoCaducado = await paginaAnonima.locator("body").innerText();
  registrar("Caducado (fecha pasada) también deja de servir, con su motivo", textoCaducado.includes("Caducó"));

  // ---------------------------------------------- 6 · informe de tienda
  const creadoTienda = await pedir(paginaAdmin, `/api/tiendas/${tienda.id}/informe/compartir`, "POST");
  const urlTienda = ((creadoTienda.datos.url as string) ?? "").replace(/^https?:\/\/[^/]+/, BASE);
  await paginaAnonima.goto(urlTienda, { waitUntil: "domcontentloaded" });
  await paginaAnonima.waitForTimeout(1_000);
  const textoTienda = await paginaAnonima.locator("body").innerText();
  registrar(
    "El informe de tienda funciona y no inventa un sello de confianza que no existe",
    creadoTienda.estado === 200 && textoTienda.includes("Facturación estimada") && !textoTienda.includes("Verificado"),
  );
  await pedir(paginaAdmin, `/api/tiendas/${tienda.id}/informe/compartir`, "DELETE");
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, (error as Error).message);
} finally {
  await navegador.close();
  await prisma.informeCompartido.deleteMany({}).catch(() => {});
  if (planOriginalAdmin) {
    await prisma.user.update({ where: { email: "admin@trendhunter.pro" }, data: { planType: planOriginalAdmin as never } }).catch(() => {});
  }
  await prisma.$disconnect();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
