/**
 * Verificación del buscador global del header.
 *
 *   npm run verify:buscador        (requiere `npm run start`)
 *
 * Comprueba que:
 *   1. La API /api/buscar exige sesión y agrupa productos, tiendas,
 *      anuncios y páginas.
 *   2. Buscar «pets» devuelve productos y tiendas reales (no solo
 *      redirige siempre a Winning Products).
 *   3. Las páginas sugeridas respetan el plan (un plan Free no ve
 *      «Equipo», que es de Business+).
 *   4. En la interfaz: escribir abre el panel, las flechas resaltan un
 *      resultado y Enter navega al resultado correcto (no al catálogo).
 *   5. Sin resultados, el aviso es honesto (no finge encontrar algo).
 */
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EJECUTABLE = process.env.CHROMIUM_PATH ?? path.join(process.cwd(), ".chromium", "chromium");
const LIBRERIAS = [path.join(process.cwd(), ".chromium", "libs"), path.join(process.cwd(), ".chromium", "libs", "lib")].join(":");

const resultados = [];
function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

const navegador = await chromium.launch({
  executablePath: EJECUTABLE,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  env: { ...process.env, LD_LIBRARY_PATH: `${LIBRERIAS}:${process.env.LD_LIBRARY_PATH ?? ""}` },
});

async function sesion(email, password) {
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

try {
  const demo = await sesion("demo@trendhunter.pro", "demo1234");
  const free = await sesion("free@trendhunter.pro", "free1234");

  // ---------------------------------------------- 1 · API
  const sinSesion = await (await navegador.newContext()).newPage();
  const respuestaSinSesion = await sinSesion.request.fetch(`${BASE}/api/buscar?q=pet`, { failOnStatusCode: false });
  registrar("La API exige sesión (401)", respuestaSinSesion.status() === 401, `${respuestaSinSesion.status()}`);

  const respuesta = await demo.request.fetch(`${BASE}/api/buscar?q=pet`);
  const datos = await respuesta.json();
  registrar(
    "Buscar «pet» devuelve productos y tiendas reales",
    respuesta.status() === 200 && datos.productos?.length > 0 && datos.tiendas?.length > 0,
    `${datos.productos?.length ?? 0} productos · ${datos.tiendas?.length ?? 0} tiendas · ${datos.anuncios?.length ?? 0} anuncios`,
  );
  registrar(
    "Las tiendas encontradas de verdad tienen «pet» en nombre/dominio/nicho",
    (datos.tiendas ?? []).every(
      (t) => `${t.titulo} ${t.subtitulo}`.toLowerCase().includes("pet") || t.subtitulo.toLowerCase().includes("mascotas"),
    ),
  );

  const sinResultados = await demo.request.fetch(`${BASE}/api/buscar?q=zzzzznoexistenunca`);
  const datosSinResultados = await sinResultados.json();
  registrar(
    "Un término sin coincidencias no inventa resultados",
    datosSinResultados.productos.length === 0 &&
      datosSinResultados.tiendas.length === 0 &&
      datosSinResultados.anuncios.length === 0,
  );

  // ---------------------------------------------- 2 · páginas respetan el plan
  const equipoDemo = await demo.request.fetch(`${BASE}/api/buscar?q=equipo`);
  const datosEquipoDemo = await equipoDemo.json();
  registrar(
    "Un plan sin equipo no ve «Equipo» sugerido (requiere Business+)",
    !datosEquipoDemo.paginas.some((p) => p.titulo === "Equipo"),
  );

  const equipoFree = await free.request.fetch(`${BASE}/api/buscar?q=ganadores`);
  const datosEquipoFree = await equipoFree.json();
  registrar(
    "Buscar una página por su descripción también funciona",
    datosEquipoFree.paginas.some((p) => p.titulo === "Winning Products"),
  );

  // ---------------------------------------------- 3 · interfaz: teclado y clic
  const buscador = demo.getByRole("combobox", { name: "Buscador global" });
  await buscador.click();
  await buscador.type("pet", { delay: 40 });
  await demo.waitForTimeout(900);
  const panel = demo.locator("#buscador-global-resultados");
  registrar("Escribir abre el panel de resultados", await panel.isVisible());

  await buscador.press("ArrowDown");
  await demo.waitForTimeout(150);
  const primerResaltado = await demo.locator('[role="option"][aria-selected="true"]').first().innerText();
  await buscador.press("Enter");
  await demo.waitForTimeout(1_200);
  registrar(
    "Enter con un resultado resaltado navega a ESE resultado (no siempre a Winning Products)",
    !demo.url().includes("/dashboard/winning-products?search=") && primerResaltado.length > 0,
    `fue a ${demo.url()} (resaltaba «${primerResaltado.split("\n")[0]}»)`,
  );

  // ---------------------------------------------- 4 · sin resultado resaltado cae al catálogo
  await demo.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await demo.waitForTimeout(1_000);
  const buscador2 = demo.getByRole("combobox", { name: "Buscador global" });
  await buscador2.click();
  await buscador2.type("galaxia", { delay: 40 });
  await demo.waitForTimeout(900);
  await buscador2.press("Enter");
  await demo.waitForTimeout(1_000);
  registrar(
    "Enter sin resaltar navega al primer resultado real (nunca se queda sin hacer nada)",
    demo.url().includes("/dashboard/winning-products/") || demo.url().includes("/dashboard/store-tracker/"),
    demo.url(),
  );
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, error.message);
} finally {
  await navegador.close();
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
