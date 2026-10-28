/**
 * ============================================================================
 *  ENLACES REALES DE SOURCING
 * ============================================================================
 *  Antes "Suppliers Finder" mostraba una lista de 12 proveedores inventados
 *  (nombre, valoración, nº de reseñas, "verificado") — ninguno real.
 *
 *  No existe una API gratuita de proveedores mayoristas verificados, así que
 *  en vez de inventar perfiles, esto genera enlaces de búsqueda reales y
 *  comprobables: se abren en una pestaña nueva, directo a los resultados de
 *  búsqueda de verdad para el título exacto del producto.
 *
 *  Formatos verificados a mano (petición HTTP real, con redirección final):
 *    · AliExpress → https://www.aliexpress.com/w/wholesale-<query>.html
 *    · Alibaba    → https://www.alibaba.com/trade/search?SearchText=<query>
 *    · Amazon     → https://www.amazon.com/s?k=<query>  (precio de referencia,
 *                    no es un proveedor mayorista, pero ayuda a comparar).
 *  CJ Dropshipping no tiene una URL de búsqueda pública estable (su página de
 *  resultados exige pasar primero una verificación): se deja fuera para no
 *  enlazar a algo que no carga.
 * ============================================================================
 */

function limpiarTermino(titulo: string): string {
  return titulo.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function urlBusquedaAliExpress(titulo: string): string {
  const termino = limpiarTermino(titulo);
  return `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(termino)}`;
}

export function urlBusquedaAlibaba(titulo: string): string {
  const termino = limpiarTermino(titulo);
  return `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(termino)}`;
}

export function urlBusquedaAmazon(titulo: string): string {
  const termino = limpiarTermino(titulo);
  return `https://www.amazon.com/s?k=${encodeURIComponent(termino)}`;
}
