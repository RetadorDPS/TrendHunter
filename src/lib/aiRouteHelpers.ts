import { analyzeProduct, generateAdCopies, generateBuyerPersona, generateStoreNames, generateVideoScript } from "@/lib/ai";
import { agruparProductosReales, getProductDetail } from "@/lib/dal";
import { toJsonInput } from "@/lib/json";
import { checkAndConsume } from "@/lib/planLimits";
import type { PlanType, ProductoRealParaIA } from "@/types";

/**
 * Utilidades compartidas por las rutas del AI Studio.
 * Evita duplicar la lógica de cuota y de despacho por herramienta.
 */
export const CONSUMO_IA = {
  /** Comprueba y consume la cuota de generaciones de IA del plan. */
  async comprobarCuota(userId: string, plan: PlanType, tool: string) {
    await checkAndConsume(userId, plan, "AI_GENERATION", { herramienta: tool });
  },

  /** Registra el consumo (se llama tras una generación correcta). */
  async consumir(userId: string, tool: string) {
    const { consumeQuota } = await import("@/lib/planLimits");
    await consumeQuota(userId, "AI_GENERATION", { herramienta: tool });
  },

  /** Convierte cualquier valor en JSON válido para Prisma. */
  aJson(valor: unknown) {
    return toJsonInput(valor) ?? {};
  },

  /**
   * Resuelve un producto REAL a partir de su clave ("nicho::títuloNormalizado"),
   * volviendo a agrupar los productos reales de ese nicho y buscando la
   * clave exacta. Nunca se fía de datos que mande el cliente: el título, el
   * precio y cuántas tiendas lo venden se comprueban aquí, en vivo.
   */
  async resolverProductoReal(claveReal: string): Promise<ProductoRealParaIA | null> {
    const nicho = claveReal.split("::")[0];
    if (!nicho) return null;
    const grupo = (await agruparProductosReales(nicho)).find((producto) => producto.id === claveReal);
    if (!grupo) return null;
    return {
      esReal: true,
      clave: grupo.id,
      title: grupo.titulo,
      nicheTag: grupo.nicho,
      suggestedSellPrice: grupo.precioMin,
      vendedoresReales: grupo.vendedoresReales,
      tiendasDominios: grupo.tiendas.map((tienda) => tienda.dominio),
    };
  },

  /**
   * Ejecuta la herramienta solicitada, sobre un producto del catálogo de
   * ejemplo (`productId`) o sobre un producto REAL (`claveReal`).
   */
  async ejecutar(
    tool: string,
    referencia: { productId?: string; claveReal?: string },
    options: Record<string, unknown>,
  ) {
    const { productId, claveReal } = referencia;

    // Las herramientas de nombres de tienda pueden funcionar sin producto.
    if (tool === "STORE_NAMES") {
      const producto = claveReal
        ? await this.resolverProductoReal(claveReal)
        : productId
          ? (await getProductDetail(productId))?.product ?? null
          : null;
      return generateStoreNames(
        {
          nicho: String(options.nicho ?? producto?.nicheTag ?? "e-commerce"),
          estilo: options.estilo ? String(options.estilo) : undefined,
          idioma: options.idioma ? String(options.idioma) : undefined,
          cantidad: options.cantidad ? Number(options.cantidad) : undefined,
        },
        producto,
      );
    }

    let producto;
    if (claveReal) {
      producto = await this.resolverProductoReal(claveReal);
      if (!producto) throw new Error("El producto real indicado ya no está disponible. Vuelve a guardarlo.");
    } else {
      if (!productId) throw new Error("Esta herramienta necesita un producto de referencia.");
      const detalle = await getProductDetail(productId);
      if (!detalle) throw new Error("El producto indicado no existe.");
      producto = detalle.product;
    }

    switch (tool) {
      case "AD_COPY":
        return generateAdCopies(producto, {
          plataforma: options.plataforma ? String(options.plataforma) : undefined,
          tono: options.tono ? String(options.tono) : undefined,
          publico: options.publico ? String(options.publico) : undefined,
          cantidad: options.cantidad ? Number(options.cantidad) : undefined,
        });
      case "VIDEO_SCRIPT":
        return generateVideoScript(producto, {
          duracion: (options.duracion ? Number(options.duracion) : 30) as 15 | 30 | 60,
          plataforma: options.plataforma ? String(options.plataforma) : undefined,
          estilo: options.estilo ? String(options.estilo) : undefined,
        });
      case "BUYER_PERSONA":
        return generateBuyerPersona(producto, {
          pais: options.pais ? String(options.pais) : undefined,
          rangoEdad: options.rangoEdad ? String(options.rangoEdad) : undefined,
          genero: options.genero ? String(options.genero) : undefined,
        });
      case "PRODUCT_ANALYSIS":
        return analyzeProduct(producto);
      default:
        throw new Error(`Herramienta desconocida: ${tool}`);
    }
  },
};
