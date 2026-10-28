import type { AdPlatform, ProductDTO, ProductoRealParaIA } from "@/types";
import { formatCompactNumber, formatCurrencyPrecise } from "@/lib/utils";

/**
 * ============================================================================
 *  PLANTILLAS Y MOTOR LOCAL DE IA
 * ============================================================================
 *  · `PROMPT_TEMPLATES`: prompts en español para OpenAI / Gemini.
 *  · `generarContenidoLocal`: motor determinista que produce contenido real y
 *    específico del producto sin necesidad de red. Es el modo por defecto en
 *    desarrollo y el respaldo si el proveedor falla.
 *
 *  Todo lo de aquí acepta tanto un producto del catálogo de ejemplo
 *  (`ProductDTO`, con TrendScore/margen/demanda) como un producto REAL
 *  (`ProductoRealParaIA`, solo con lo que sabemos de verdad: título, nicho,
 *  precio y en cuántas tiendas reales se vende). La regla para lo real: nunca
 *  rellenar con un número que no venga de `producto`.
 * ============================================================================
 */

export type ProductoIA = ProductDTO | ProductoRealParaIA;

/** ¿Es un producto real (no del catálogo de ejemplo)? */
export function esProductoReal(producto: ProductoIA | null | undefined): producto is ProductoRealParaIA {
  return Boolean(producto && "esReal" in producto && producto.esReal === true);
}

/** Resumen textual del producto que se inyecta en los prompts. */
export function construirContextoProducto(producto: ProductoIA): string {
  if (esProductoReal(producto)) {
    const tiendas = producto.tiendasDominios.slice(0, 3).join(", ") || "una tienda real";
    return [
      `Producto REAL (leído del catálogo público de una tienda Shopify de verdad, no es un ejemplo): ${producto.title}`,
      `Nicho: ${producto.nicheTag}`,
      `Precio de venta real ahora mismo: ${formatCurrencyPrecise(producto.suggestedSellPrice)}`,
      `Validación de mercado: lo vende${producto.vendedoresReales === 1 ? "" : "n"} ${producto.vendedoresReales} tienda${producto.vendedoresReales === 1 ? "" : "s"} real${producto.vendedoresReales === 1 ? "" : "es"} ahora mismo (${tiendas}).`,
      `IMPORTANTE: no hay coste de proveedor, margen, TrendScore ni cifras de búsquedas/TikTok/Meta para este producto. No inventes esos números ni los menciones como si existieran: usa solo el precio y el dato de cuántas tiendas reales lo venden.`,
    ].join("\n");
  }
  return [
    `Producto: ${producto.title}`,
    `Categoría: ${producto.category} · Nicho: ${producto.nicheTag}`,
    `Descripción: ${producto.description}`,
    `Coste proveedor: ${formatCurrencyPrecise(producto.costPrice)} · Precio de venta sugerido: ${formatCurrencyPrecise(producto.suggestedSellPrice)} · Margen: ${producto.estimatedMargin}%`,
    `TrendScore: ${producto.trendScore}/100 · Saturación: ${producto.saturationLevel} · Dirección: ${producto.trendDirection}`,
    `Demanda: ${formatCompactNumber(producto.googleSearchVolume)} búsquedas/mes en Google, ${formatCompactNumber(producto.tiktokViews)} visualizaciones en TikTok, ${producto.metaAdsCount} anuncios activos en Meta.`,
    `Países objetivo: ${producto.countryAvailability.join(", ") || "sin especificar"}`,
  ].join("\n");
}

interface PromptContext {
  producto?: ProductoIA | null;
  [clave: string]: unknown;
}

/** Instrucción de sistema común a todas las herramientas. */
const SISTEMA = `Eres el director creativo y estratega de marketing de TrendHunter Pro, una plataforma de investigación de productos para dropshipping.
Escribes en español neutro de España, con tono directo, vendedor y sin exageraciones legales (nada de promesas médicas).
Trabajas para emprendedores de e-commerce que necesitan material listo para publicar. Respondes SIEMPRE en JSON válido.`;

/** Prompts específicos por herramienta. */
export const PROMPT_TEMPLATES = {
  sistema: () => SISTEMA,

  adCopy: ({ producto, plataforma = "FACEBOOK", tono = "directo", publico = "público general", cantidad = 5 }: PromptContext) =>
    `${construirContextoProducto(producto as ProductoIA)}

Genera exactamente ${cantidad} variantes de anuncio para ${plataforma} con tono ${tono} y dirigidas a ${publico}.
Cada variante debe atacar un ÁNGULO psicológico diferente (dolor, regalo, ahorro, prueba social, curiosidad, autoridad).
Devuelve un JSON con la forma:
{"copies":[{"id":"1","angle":"...","hook":"...","primaryText":"...","headline":"...","description":"...","callToAction":"..."}]}
"primaryText" entre 300 y 500 caracteres y emojis con moderación (máximo 3).`,

  videoScript: ({ producto, duracion = 30, plataforma = "TIKTOK", estilo = "ugc" }: PromptContext) =>
    `${construirContextoProducto(producto as ProductoIA)}

Escribe un guion de vídeo de ${duracion} segundos para ${plataforma} en estilo ${estilo}.
El primer segundo debe ser un hook visual imposible de ignorar. Incluye texto en pantalla y sugerencias de sonido.
Devuelve un JSON: {"duration":${duracion},"platform":"${plataforma}","concept":"...","hook":"...","scenes":[{"timecode":"0-3 s","visual":"...","voiceover":"...","onScreenText":"...","sound":"..."}],"cta":"...","hashtags":["..."]}`,

  buyerPersona: ({ producto, pais = "España", rangoEdad = "28-45", genero = "indiferente" }: PromptContext) =>
    `${construirContextoProducto(producto as ProductoIA)}

Crea un buyer persona realista que compre este producto en ${pais}, con edad ${rangoEdad} y género ${genero}.
Devuelve un JSON: {"name":"...","ageRange":"...","gender":"...","location":"...","income":"...","occupation":"...","painPoints":["..."],"desires":["..."],"objections":["..."],"buyingTriggers":["..."],"channels":["..."],"quote":"..."}`,

  storeNames: ({ nicho, estilo = "moderno", idioma = "es", cantidad = 8 }: PromptContext) =>
    `Nicho: ${nicho}. Estilo de marca: ${estilo}. Idioma: ${idioma}.
Propón ${cantidad} nombres de tienda online con su dominio ideal y una justificación breve.
Devuelve un JSON: {"names":[{"name":"...","domain":"...","rationale":"..."}]}`,

  productAnalysis: ({ producto }: PromptContext) =>
    `${construirContextoProducto(producto as ProductoIA)}

Analiza si merece la pena vender este producto ahora mismo. Sé crítico y concreto con los números dados; si un dato
(margen, demanda, TrendScore) no aparece arriba, no lo inventes ni lo des por supuesto — basa el análisis solo en lo
que sí se indica (precio, y cuántas tiendas reales lo venden cuando sea un producto real).
Devuelve un JSON: {"resumen":"...","fortalezas":["..."],"riesgos":["..."],"recomendacion":"...","precioOptimo":"...","canalesRecomendados":["..."]}`,
} as const;

// ---------------------------------------------------------------------------
//  Motor local (determinista, sin red)
// ---------------------------------------------------------------------------

/** Ángulos creativos reutilizables, con su plantilla de hook y texto. */
const ANGULOS = [
  {
    angle: "Dolor específico",
    hook: (p: ProductoIA) => `¿Sigues con el problema que ${p.title.toLowerCase()} resuelve?`,
    sufijo: "Deja de aguantarlo: resultados desde el primer uso.",
  },
  {
    angle: "Regalo que acierta",
    hook: (p: ProductoIA) => `El regalo que nadie devuelve: ${p.title.toLowerCase()}`,
    sufijo: "Si siempre te quedas sin ideas, este año aciertas seguro.",
  },
  {
    angle: "Ahorro frente a alternativas",
    hook: (p: ProductoIA) => `Cuesta ${formatCurrencyPrecise(p.suggestedSellPrice)} y sustituye alternativas de cientos de euros`,
    sufijo: "Misma función, una fracción del precio. Envío gratis y devolución en 30 días.",
  },
  {
    angle: "Prueba social",
    hook: (p: ProductoIA) =>
      esProductoReal(p)
        ? `Ya lo venden ${p.vendedoresReales} tienda${p.vendedoresReales === 1 ? "" : "s"} real${p.vendedoresReales === 1 ? "" : "es"}: no es un producto sin probar`
        : `Más de ${formatCompactNumber(Math.round(p.estimatedUnitsSold / 30) * 30)} personas ya lo usan cada día`,
    sufijo: "Mira las reseñas antes de decidir. Sin riesgos: garantía de devolución.",
  },
  {
    angle: "Curiosidad / descubrimiento",
    hook: () => "El producto que todavía no está en todas partes",
    sufijo: "Pruébalo antes de que se vuelva evidente para todo el mundo.",
  },
  {
    angle: "Transformación rápida",
    hook: (p: ProductoIA) => `De 0 a resultado en la primera semana con ${p.title.toLowerCase()}`,
    sufijo: "Fácil de usar, sin instalación complicada y con guía incluida.",
  },
  {
    angle: "Comparativa antes/después",
    hook: () => "Antes y después: la diferencia en 30 días",
    sufijo: "Míralo en vídeo antes de comprar. Miles de clientes satisfechos.",
  },
  {
    angle: "Urgencia y disponibilidad",
    hook: () => "Stock limitado del modelo más pedido del mes",
    sufijo: "Cuando se agota, tarda hasta 3 semanas en volver. Asegura el tuyo hoy.",
  },
] as const;

/** Llamadas a la acción por plataforma. */
const CTAS: Record<string, string[]> = {
  FACEBOOK: ["Comprar ahora", "Más información", "Conseguir oferta", "Pedir hoy"],
  TIKTOK: ["Ver oferta", "Consigue el tuyo", "Enlace en bio", "Comprar ya"],
  INSTAGRAM: ["Comprar ahora", "Ver más", "Envío gratis", "Descubrir"],
};

/** Devuelve el índice determinista para una semilla y un número. */
function indiceDeterminista(semilla: string, total: number, desplazamiento = 0): number {
  let hash = 0;
  for (let i = 0; i < semilla.length; i += 1) {
    hash = (hash * 31 + semilla.charCodeAt(i)) % 100_000;
  }
  return (hash + desplazamiento) % total;
}

/** Genera descripciones largas plausibles a partir de los datos del producto. */
function cuerpoAnuncio(producto: ProductoIA, angulo: string): string {
  if (esProductoReal(producto)) {
    // Sin descripción ni países objetivo reales: el cuerpo se apoya solo en
    // lo que sí sabemos (nicho, precio, cuántas tiendas reales lo venden).
    const validacion =
      producto.vendedoresReales > 1
        ? `Ahora mismo lo venden ${producto.vendedoresReales} tiendas reales distintas`
        : "Lo encontramos en el catálogo público de una tienda real";
    const bloques: Record<string, string> = {
      "Dolor específico": `${producto.title}, en el nicho de ${producto.nicheTag}. ${validacion}, a ${formatCurrencyPrecise(producto.suggestedSellPrice)}. Si buscas algo en esta categoría, esta es una opción que ya se está vendiendo de verdad.`,
      "Regalo que acierta": `${producto.title}, por ${formatCurrencyPrecise(producto.suggestedSellPrice)}. Un acierto fácil dentro de ${producto.nicheTag}.`,
      "Ahorro frente a alternativas": `${producto.title} a ${formatCurrencyPrecise(producto.suggestedSellPrice)}. ${validacion} a precios similares: compara antes de pagar de más por lo mismo.`,
      "Prueba social": `${producto.title}. ${validacion} en el nicho de ${producto.nicheTag} — no es un producto sin validar.`,
      "Curiosidad / descubrimiento": `${producto.title}, de ${producto.nicheTag}. ${validacion}.`,
      "Transformación rápida": `${producto.title}, a ${formatCurrencyPrecise(producto.suggestedSellPrice)}. ${validacion}.`,
      "Comparativa antes/después": `${producto.title}. ${validacion}: compara tú mismo entre esas tiendas antes de decidir.`,
      "Urgencia y disponibilidad": `${producto.title}, a ${formatCurrencyPrecise(producto.suggestedSellPrice)}. ${validacion} ahora mismo.`,
    };
    return bloques[angulo] ?? bloques["Prueba social"];
  }

  const beneficio = producto.description.split(".")[0].trim();
  const paises = producto.countryAvailability.slice(0, 3).join(", ") || "España";
  const bloques: Record<string, string> = {
    "Dolor específico": `${beneficio}. Si has probado otras opciones y no te han funcionado, esta es la diferencia: funciona desde el primer uso y no requiere cambiar tu rutina. Miles de clientes en ${paises} lo confirman cada mes.`,
    "Regalo que acierta": `${beneficio}. Perfecto para cumpleaños, Navidad o simplemente para sorprender. Llega en caja lista para regalar y con guía de uso en español.`,
    "Ahorro frente a alternativas": `${beneficio}. Frente a las alternativas de gama alta, mantiene los resultados clave a una fracción del precio. Sin suscripciones ni consumibles obligatorios.`,
    "Prueba social": `${beneficio}. Miles de unidades vendidas este mes y una valoración media de 4,7 sobre 5. Los clientes destacan lo fácil que es empezar a usarlo.`,
    "Curiosidad / descubrimiento": `${beneficio}. Es el tipo de producto que aún no está en todas partes: la demanda crece cada semana y la competencia sigue baja.`,
    "Transformación rápida": `${beneficio}. En la primera semana ya notas la diferencia y a partir del primer mes el resultado se mantiene. Incluye plan de uso paso a paso.`,
    "Comparativa antes/después": `${beneficio}. Compara el antes y el después en vídeo: los clientes suben su propio resultado y el cambio se ve a simple vista.`,
    "Urgencia y disponibilidad": `${beneficio}. El modelo más pedido del mes se agota rápido por la demanda de TikTok. No esperes a que vuelva a entrar stock.`,
  };
  return bloques[angulo] ?? bloques["Prueba social"];
}

/** Bloques de guion por duración (segundos). */
const ESTRUCTURA_GUION: Record<number, Array<{ etiqueta: string; enfoque: string }>> = {
  15: [
    { etiqueta: "0-3 s", enfoque: "Hook visual: problema en primer plano" },
    { etiqueta: "3-10 s", enfoque: "Demostración del producto en uso real" },
    { etiqueta: "10-15 s", enfoque: "Resultado + llamada a la acción" },
  ],
  30: [
    { etiqueta: "0-3 s", enfoque: "Hook: la objeción más común del cliente" },
    { etiqueta: "3-9 s", enfoque: "Presentación del producto y su función principal" },
    { etiqueta: "9-18 s", enfoque: "Demostración paso a paso con texto en pantalla" },
    { etiqueta: "18-25 s", enfoque: "Prueba social y comparativa de precio" },
    { etiqueta: "25-30 s", enfoque: "Oferta, garantía y llamada a la acción" },
  ],
  60: [
    { etiqueta: "0-3 s", enfoque: "Hook con el dolor más repetido en comentarios" },
    { etiqueta: "3-12 s", enfoque: "Historia personal: cómo era antes de usarlo" },
    { etiqueta: "12-25 s", enfoque: "Demostración completa sin cortes" },
    { etiqueta: "25-38 s", enfoque: "Explicación del mecanismo que lo hace funcionar" },
    { etiqueta: "38-50 s", enfoque: "Resultados, reseñas y prueba social" },
    { etiqueta: "50-60 s", enfoque: "Oferta con urgencia + llamada a la acción clara" },
  ],
};

/** Genera localmente el contenido de cada herramienta del AI Studio. */
export function generarContenidoLocal(
  herramienta: string,
  contexto: { producto?: ProductoIA; nicho?: string; contexto?: string },
  opciones: Record<string, unknown> = {},
): Record<string, unknown> {
  const producto = contexto.producto;
  const semilla = contexto.nicho ?? (producto ? ("id" in producto ? producto.id : producto.clave) : "trendhunter");

  switch (herramienta) {
    case "AD_COPY": {
      const cantidad = Number(opciones.cantidad ?? 5);
      const plataforma = String(opciones.plataforma ?? "FACEBOOK");
      const ctas = CTAS[plataforma] ?? CTAS.FACEBOOK;
      const copies = Array.from({ length: cantidad }, (_, indice) => {
        const angulo = ANGULOS[(indiceDeterminista(semilla, ANGULOS.length) + indice) % ANGULOS.length];
        return {
          id: String(indice + 1),
          angle: angulo.angle,
          hook: angulo.hook(producto as ProductoIA),
          primaryText: `${cuerpoAnuncio(producto as ProductoIA, angulo.angle)} ${angulo.sufijo}`,
          headline: truncarTitulo((producto as ProductoIA).title),
          description: `${angulo.angle} · Envío gratis · Devolución 30 días`,
          callToAction: ctas[indice % ctas.length],
        };
      });
      return { copies };
    }

    case "VIDEO_SCRIPT": {
      const duracion = Number(opciones.duracion ?? 30) as 15 | 30 | 60;
      const plataforma = (opciones.plataforma as AdPlatform) ?? "TIKTOK";
      const estructura = ESTRUCTURA_GUION[duracion] ?? ESTRUCTURA_GUION[30];
      const productoReal = producto as ProductoIA;
      const esReal = esProductoReal(productoReal);
      const fraseDemostracion = esReal
        ? `lo vende${productoReal.vendedoresReales === 1 ? "" : "n"} ${productoReal.vendedoresReales} tienda${productoReal.vendedoresReales === 1 ? "" : "s"} real${productoReal.vendedoresReales === 1 ? "" : "es"} ahora mismo`
        : productoReal.description.split(".")[0].toLowerCase();
      const escenas = estructura.map((bloque, indice) => ({
        timecode: bloque.etiqueta,
        visual: `${
          [
            "Primer plano del problema en manos de una persona real",
            "Unboxing y primer contacto con el producto",
            `Demostración: ${productoReal.title.toLowerCase()} en uso`,
            "Comparativa lado a lado con la alternativa tradicional",
            "Reacciones reales y capturas de reseñas",
            "Carrusel de resultados antes/después",
          ][indice % 6]
        } — ${bloque.enfoque}`,
        voiceover:
          indice === 0
            ? "Si te pasa esto, mira lo que encontré."
            : indice === estructura.length - 1
              ? `Cuesta ${formatCurrencyPrecise(productoReal.suggestedSellPrice)} y tienes 30 días para devolverlo. Enlace abajo.`
              : `Aquí se ve cómo funciona: ${fraseDemostracion}.`,
        onScreenText:
          indice === 0
            ? "Esto cambia todo 👀"
            : indice === estructura.length - 1
              ? `${formatCurrencyPrecise(productoReal.suggestedSellPrice)} · Envío gratis`
              : ["Sin esfuerzo", "Fácil de usar", "Resultados reales", "Miles de clientes"][indice % 4],
        sound: ["Beat con drop en el segundo 3", "Música lo-fi suave", "Trending audio del momento", "Narración con voz humana"][indice % 4],
      }));

      return {
        script: {
          duration: duracion,
          platform: plataforma,
          concept: `Transformación con ${productoReal.title.toLowerCase()} contada en primera persona`,
          hook: `Hook: ${ANGULOS[indiceDeterminista(semilla, ANGULOS.length)].hook(productoReal)}`,
          scenes: escenas,
          cta: `Consigue ${productoReal.title.toLowerCase()} con envío gratis y 30 días de devolución.`,
          hashtags: [
            `#${productoReal.nicheTag.toLowerCase().replace(/\s+/g, "")}`,
            ...(esReal ? [] : [`#${(productoReal as ProductDTO).category.toLowerCase()}`]),
            "#tiktokmademebuyit",
            "#dropshipping",
            "#españa",
          ],
        },
      };
    }

    case "BUYER_PERSONA": {
      const productoReal = producto as ProductoIA;
      const pais = String(opciones.pais ?? "España");
      const generoPorCategoria: Record<string, string> = {
        Belleza: "Femenino (78 % del público)",
        Salud: "Mixto (ligero sesgo femenino)",
        Fitness: "Mixto (45 % mujeres / 55 % hombres)",
        Mascotas: "Femenino (71 %)",
        Hogar: "Femenino (64 %)",
        Tecnología: "Masculino (68 %)",
      };
      return {
        persona: {
          name: "Lucía Martín",
          ageRange: String(opciones.rangoEdad ?? "32-45"),
          gender: esProductoReal(productoReal) ? "Mixto" : (generoPorCategoria[productoReal.category] ?? "Mixto"),
          location: `${pais} · grandes ciudades y áreas metropolitanas`,
          income: "1.900 - 2.800 € netos/mes",
          occupation: "Empleada de oficina / teletrabajo parcial",
          painPoints: [
            `Ha probado soluciones genéricas para ${productoReal.nicheTag.toLowerCase()} sin resultados visibles`,
            "No quiere gastar en servicios profesionales cada mes",
            "Le falta tiempo: necesita soluciones que quepan en menos de 20 minutos al día",
            "Desconfía de las promesas exageradas que ve en anuncios",
          ],
          desires: [
            "Ver resultados medibles en menos de un mes",
            "Cuidarse sin renunciar a su rutina",
            `Pagar alrededor de ${formatCurrencyPrecise(productoReal.suggestedSellPrice)} con la sensación de haber hecho una buena compra`,
            "Poder recomendarlo a sus amigas con seguridad",
          ],
          objections: [
            "¿Funciona de verdad o es otro anuncio de moda?",
            "¿Cuánto tarda el envío y quién responde si falla?",
            "¿Es complicado de usar en el día a día?",
            `¿Merece la pena pagar ${formatCurrencyPrecise(productoReal.suggestedSellPrice)} si hay versiones más baratas?`,
          ],
          buyingTriggers: [
            "Vídeo real de alguien parecido a ella usándolo",
            "Garantía de devolución de 30 días y pago contra reembolso si existe",
            "Comparativa de precio con la alternativa profesional",
            "Opiniones verificadas con fotos antes y después",
          ],
          channels: ["TikTok", "Instagram Reels", "Grupos de Facebook del nicho", "Newsletter de ofertas"],
          quote: `Si funciona de verdad y puedo devolverlo, lo pruebo hoy mismo.`,
        },
      };
    }

    case "STORE_NAMES": {
      const nicho = String(contexto.nicho ?? producto?.nicheTag ?? "e-commerce");
      const raiz = nicho.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "").slice(0, 12) || "tienda";
      const cantidad = Number(opciones.cantidad ?? 8);
      const plantillas = [
        { sufijo: "Lab", tld: ".es", razon: "Sonoridad moderna, transmite innovación y especialización." },
        { sufijo: "Home", tld: ".com", razon: "Enfatiza el uso doméstico, muy buscado en anuncios." },
        { sufijo: "Pro", tld: ".es", razon: "Aporta credibilidad y justifica un ticket más alto." },
        { sufijo: "Club", tld: ".com", razon: "Favorece comunidad y recompra por suscripción." },
        { sufijo: "Store", tld: ".store", razon: "Extensión específica de comercio, disponible a buen precio." },
        { sufijo: "Care", tld: ".es", razon: "Comunica cuidado y bienestar, ideal para salud y belleza." },
        { sufijo: "Hub", tld: ".com", razon: "Sugiere catálogo amplio y experiencia de compra optimizada." },
        { sufijo: "Vital", tld: ".es", razon: "Evoca vitalidad sin encasillar el producto." },
      ];
      const nombres = Array.from({ length: Math.min(cantidad, plantillas.length) }, (_, indice) => {
        const plantilla = plantillas[(indiceDeterminista(semilla, plantillas.length) + indice) % plantillas.length];
        const nombre = `${capitalizar(raiz)}${plantilla.sufijo}`;
        return {
          name: nombre,
          domain: `${raiz}${plantilla.sufijo.toLowerCase()}${plantilla.tld}`,
          rationale: plantilla.razon,
          available: indice % 3 !== 0,
        };
      });
      return { names: nombres };
    }

    case "PRODUCT_ANALYSIS":
    default: {
      if (esProductoReal(producto)) {
        const p = producto;
        const tiendas = p.tiendasDominios.slice(0, 3).join(", ") || "una tienda real";
        const precio = formatCurrencyPrecise(p.suggestedSellPrice);
        return {
          analysis: {
            resumen: `${p.title} se vende ahora mismo en ${p.vendedoresReales} tienda${p.vendedoresReales === 1 ? "" : "s"} real${p.vendedoresReales === 1 ? "" : "es"} del nicho ${p.nicheTag}, a ${precio}. Es un dato real de validación de mercado, comprobable abriendo esas tiendas — pero no hay margen, coste de proveedor ni demanda de búsquedas/TikTok/Meta para este producto: no se inventan aquí.`,
            fortalezas: [
              p.vendedoresReales > 1
                ? `Vendido por ${p.vendedoresReales} tiendas reales distintas (${tiendas}): ya está validado en el mercado, no es una apuesta sin probar.`
                : `Encontrado en una tienda real (${tiendas}): precio y disponibilidad son los que esa tienda publica ahora mismo.`,
              `Precio real de ${precio}, comprobable tú misma abriendo la tienda.`,
            ],
            riesgos: [
              "No hay margen real calculado: hace falta cotizar el coste de proveedor (AliExpress/Alibaba, en Suppliers Finder) antes de decidir si el precio deja beneficio.",
              "No hay dato real de demanda de búsquedas, TikTok o Meta para este producto concreto: no se sabe si hay tráfico detrás todavía.",
              p.vendedoresReales > 3
                ? `Al venderlo ya ${p.vendedoresReales} tiendas, puede haber bastante competencia directa en este producto exacto.`
                : "La competencia que vemos está limitada a las tiendas que hemos leído: puede haber más vendedores fuera de nuestro radar.",
            ],
            recomendacion: `Antes de invertir en anuncios: cotiza el coste real en Suppliers Finder para calcular tu margen de verdad, y valida demanda con una prueba de tráfico pequeña — no hay datos de tendencia que lo decidan por ti.`,
            precioOptimo: `No se puede calcular un precio óptimo sin tu coste real de proveedor. Precio de referencia en el mercado ahora mismo: ${precio}.`,
            canalesRecomendados: ["TikTok Ads con creatividades UGC", "Facebook Advantage+ con catálogo", "Instagram Reels orgánico + Spark Ads"],
          },
        };
      }

      const productoReal = producto as ProductDTO;
      const margenAbsoluto = productoReal.suggestedSellPrice - productoReal.costPrice;
      const saturacionAlta = productoReal.saturationLevel === "HIGH";
      return {
        analysis: {
          resumen: `${productoReal.title} tiene un TrendScore de ${productoReal.trendScore}/100 con saturación ${productoReal.saturationLevel.toLowerCase()} y margen bruto del ${productoReal.estimatedMargin} %. ${
            productoReal.isGoldenOpportunity
              ? "Cumple los criterios de oportunidad dorada: demanda alta y competencia baja."
              : "No cumple los criterios de oportunidad dorada ahora mismo."
          }`,
          fortalezas: [
            `Margen bruto de ${formatCurrencyPrecise(margenAbsoluto)} por unidad (${productoReal.estimatedMargin} %)`,
            `${formatCompactNumber(productoReal.tiktokViews)} visualizaciones en TikTok: valida el interés orgánico`,
            `${productoReal.trendDirection === "RISING" ? "Tendencia en ascenso" : "Tendencia estable"}: velocidad ${Math.round(productoReal.velocityScore)}/100`,
            `${productoReal.estimatedUnitsSold} unidades/mes estimadas en el mercado`,
          ],
          riesgos: [
            saturacionAlta
              ? `Saturación ${productoReal.saturationLevel.toLowerCase()}: ${productoReal.storesUsing} tiendas compitiendo por el mismo tráfico`
              : `Competencia moderada (${productoReal.storesUsing} tiendas detectadas)`,
            productoReal.estimatedMargin < 60
              ? "Margen ajustado: exige un CPA bajo para ser rentable"
              : "Vigilar el CPA: un margen alto invita a competidores a pujar más",
            "Verificar plazos de entrega reales del proveedor antes de escalar",
          ],
          recomendacion: productoReal.isGoldenOpportunity
            ? `Entrar ahora con presupuesto de prueba de 30-50 €/día, anuncio UGC de 30 s y precio de lanzamiento de ${formatCurrencyPrecise(productoReal.suggestedSellPrice)}. Escalar si el CPA se mantiene por debajo de ${formatCurrencyPrecise(margenAbsoluto * 0.55)}.`
            : `Testear con presupuesto contenido (15-25 €/día) y diferenciarse por ángulo creativo o pack de valor. Considerar otro producto del nicho ${productoReal.nicheTag} con mejor relación demanda/competencia.`,
          precioOptimo: `${formatCurrencyPrecise(productoReal.suggestedSellPrice)} (rango rentable entre ${formatCurrencyPrecise(productoReal.costPrice * 2.6)} y ${formatCurrencyPrecise(productoReal.suggestedSellPrice * 1.25)})`,
          canalesRecomendados: ["TikTok Ads con creatividades UGC", "Facebook Advantage+ con catálogo", "Instagram Reels orgánico + Spark Ads"],
        },
      };
    }
  }
}

/** Acorta el título del producto para usarlo como titular de anuncio. */
function truncarTitulo(titulo: string, maximo = 60): string {
  return titulo.length <= maximo ? titulo : `${titulo.slice(0, maximo - 1).trimEnd()}…`;
}

/** Capitaliza la primera letra. */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
