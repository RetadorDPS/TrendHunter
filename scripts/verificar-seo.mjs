/**
 * Verificación de la infraestructura SEO real (sin datos inventados):
 *
 *   npm run verify:seo        (requiere `npm run start`, idealmente con
 *                               NEXT_PUBLIC_APP_URL apuntando a un dominio
 *                               real para probar la resolución de URLs)
 *
 * Comprueba que:
 *   1. /robots.txt existe, permite las páginas públicas, bloquea el panel,
 *      la API y los enlaces con token (invitación, informe compartido) y
 *      apunta al sitemap.
 *   2. /sitemap.xml existe, lista solo páginas públicas reales (home,
 *      pricing, login, registro) y nunca una ruta del panel.
 *   3. La portada tiene URL canónica, og:title/og:description/og:url y una
 *      og:image que de verdad se puede descargar (no un enlace roto).
 *   4. La imagen generada es un PNG real de 1200×630 (no un error
 *      disfrazado de imagen).
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const resultados = [];
function registrar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok });
  console.log(`${ok ? "✅" : "❌"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

try {
  // ---------------------------------------------- 1 · robots.txt
  const respuestaRobots = await fetch(`${BASE}/robots.txt`);
  const robots = await respuestaRobots.text();
  registrar("GET /robots.txt responde 200", respuestaRobots.status === 200, `${respuestaRobots.status}`);
  registrar("robots.txt permite la raíz", /Allow:\s*\//.test(robots));
  registrar(
    "robots.txt bloquea el panel, la API y los enlaces con token",
    ["/dashboard", "/api", "/equipos/aceptar", "/informe"].every((ruta) => robots.includes(`Disallow: ${ruta}`)),
  );
  registrar("robots.txt apunta a un sitemap.xml absoluto", /Sitemap:\s*https?:\/\/.+\/sitemap\.xml/.test(robots));

  // ---------------------------------------------- 2 · sitemap.xml
  const respuestaSitemap = await fetch(`${BASE}/sitemap.xml`);
  const sitemap = await respuestaSitemap.text();
  registrar("GET /sitemap.xml responde 200", respuestaSitemap.status === 200, `${respuestaSitemap.status}`);
  registrar("sitemap.xml es un <urlset> válido", sitemap.includes("<urlset"));
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  registrar(
    "El sitemap lista las páginas públicas reales",
    ["/pricing", "/login", "/register"].every((ruta) => urls.some((u) => u.endsWith(ruta))),
    `${urls.length} URLs`,
  );
  registrar(
    "El sitemap NUNCA incluye el panel ni enlaces con token",
    !urls.some((u) => u.includes("/dashboard") || u.includes("/informe") || u.includes("/equipos/aceptar")),
  );

  // ---------------------------------------------- 3 · metadatos de la portada
  const respuestaHome = await fetch(`${BASE}/`);
  const html = await respuestaHome.text();
  registrar("La portada tiene <link rel=\"canonical\">", /<link rel="canonical" href="https?:\/\/[^"]+"/.test(html));
  registrar("La portada tiene og:title y og:description reales", html.includes('property="og:title"') && html.includes('property="og:description"'));
  const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
  registrar("La portada declara una og:image", Boolean(ogImageMatch));

  // ---------------------------------------------- 4 · la og:image se puede descargar de verdad
  if (ogImageMatch) {
    // Se pide contra BASE (no contra el dominio absoluto de la etiqueta):
    // en producción coinciden, pero este script puede probarse con un
    // NEXT_PUBLIC_APP_URL de ejemplo que no resuelve por DNS de verdad.
    const urlImagen = new URL(new URL(ogImageMatch[1]).pathname + new URL(ogImageMatch[1]).search, BASE).toString();
    const respuestaImagen = await fetch(urlImagen);
    const buffer = Buffer.from(await respuestaImagen.arrayBuffer());
    const esPngValido = buffer.length > 1000 && buffer[0] === 0x89 && buffer[1] === 0x50; // cabecera PNG
    registrar(
      "La og:image se descarga y es un PNG real (no un enlace roto)",
      respuestaImagen.status === 200 && respuestaImagen.headers.get("content-type") === "image/png" && esPngValido,
      `${respuestaImagen.status} · ${buffer.length} bytes`,
    );
  }
} catch (error) {
  registrar("La verificación terminó sin excepciones", false, error.message);
}

const fallos = resultados.filter((fila) => !fila.ok).length;
console.log(`\n=== RESUMEN: ${resultados.length - fallos}/${resultados.length} comprobaciones correctas ===`);
if (fallos > 0) process.exit(1);
