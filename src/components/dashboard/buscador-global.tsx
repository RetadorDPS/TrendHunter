"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FileQuestion, Megaphone, Search, Store as StoreIcon, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ResultadoItem {
  id: string;
  titulo: string;
  subtitulo: string;
  imagen: string | null;
  href: string;
}

interface Resultados {
  productos: ResultadoItem[];
  tiendas: ResultadoItem[];
  anuncios: ResultadoItem[];
  paginas: ResultadoItem[];
}

const VACIO: Resultados = { productos: [], tiendas: [], anuncios: [], paginas: [] };

const GRUPOS: Array<{ clave: keyof Resultados; etiqueta: string; icono: typeof Trophy }> = [
  { clave: "productos", etiqueta: "Productos", icono: Trophy },
  { clave: "tiendas", etiqueta: "Tiendas", icono: StoreIcon },
  { clave: "anuncios", etiqueta: "Anuncios", icono: Megaphone },
  { clave: "paginas", etiqueta: "Páginas", icono: FileQuestion },
];

/**
 * Buscador global del header: productos, tiendas, anuncios y páginas del
 * panel, agrupados, con navegación por teclado (flechas, Enter, Escape).
 * Sin resultado destacado, Enter cae en el catálogo filtrado (comportamiento
 * anterior), para no dejar nunca un buscador vacío de las manos.
 */
export function BuscadorGlobal() {
  const router = useRouter();
  const [termino, setTermino] = useState("");
  const [resultados, setResultados] = useState<Resultados>(VACIO);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(-1);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const controladorRef = useRef<AbortController | null>(null);

  const lista = useMemo(
    () => GRUPOS.flatMap((grupo) => resultados[grupo.clave]),
    [resultados],
  );

  // Busca con un pequeño retraso: no una petición por cada tecla.
  useEffect(() => {
    const texto = termino.trim();
    if (texto.length < 2) {
      setResultados(VACIO);
      setCargando(false);
      return;
    }
    setCargando(true);
    const temporizador = setTimeout(() => {
      controladorRef.current?.abort();
      const controlador = new AbortController();
      controladorRef.current = controlador;
      fetch(`/api/buscar?q=${encodeURIComponent(texto)}`, { signal: controlador.signal })
        .then((respuesta) => (respuesta.ok ? respuesta.json() : VACIO))
        .then((datos: Resultados) => {
          setResultados(datos);
          setIndiceActivo(-1);
        })
        .catch(() => {})
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(temporizador);
  }, [termino]);

  // Cierra al hacer clic fuera.
  useEffect(() => {
    function alClicar(evento: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClicar);
    return () => document.removeEventListener("mousedown", alClicar);
  }, []);

  function irA(href: string) {
    setAbierto(false);
    setTermino("");
    router.push(href);
  }

  function manejarTeclado(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAbierto(true);
      setIndiceActivo((actual) => Math.min(actual + 1, lista.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setIndiceActivo((actual) => Math.max(actual - 1, 0));
    } else if (evento.key === "Escape") {
      setAbierto(false);
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      if (indiceActivo >= 0 && lista[indiceActivo]) {
        irA(lista[indiceActivo].href);
      } else if (lista.length > 0) {
        irA(lista[0].href);
      } else {
        const texto = termino.trim();
        if (texto) irA(`/dashboard/winning-products?search=${encodeURIComponent(texto)}`);
      }
    }
  }

  const hayResultados = lista.length > 0;
  const mostrarPanel = abierto && termino.trim().length >= 2;

  return (
    <div ref={contenedorRef} className="relative hidden max-w-md flex-1 sm:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={termino}
        onChange={(evento) => {
          setTermino(evento.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        onKeyDown={manejarTeclado}
        placeholder="Buscar productos, tiendas, anuncios o secciones…"
        className="pl-9"
        aria-label="Buscador global"
        role="combobox"
        aria-expanded={mostrarPanel}
        aria-controls="buscador-global-resultados"
        autoComplete="off"
      />

      {mostrarPanel && (
        <div
          id="buscador-global-resultados"
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border/70 bg-slate-950/95 p-1.5 shadow-xl backdrop-blur-lg"
        >
          {cargando && lista.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Buscando…</p>
          )}
          {!cargando && !hayResultados && (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Sin resultados para «{termino.trim()}».
            </p>
          )}
          {GRUPOS.map((grupo) => {
            const items = resultados[grupo.clave];
            if (items.length === 0) return null;
            const Icono = grupo.icono;
            return (
              <div key={grupo.clave} className="mb-1 last:mb-0">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {grupo.etiqueta}
                </p>
                {items.map((item) => {
                  const indiceGlobal = lista.indexOf(item);
                  const activo = indiceGlobal === indiceActivo;
                  return (
                    <button
                      key={`${grupo.clave}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={activo}
                      onMouseEnter={() => setIndiceActivo(indiceGlobal)}
                      onClick={() => irA(item.href)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        activo ? "bg-indigo-500/15 text-indigo-200" : "hover:bg-surface",
                      )}
                    >
                      {item.imagen ? (
                        <Image
                          src={item.imagen}
                          alt=""
                          width={28}
                          height={28}
                          className="size-7 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <Icono className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.titulo}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.subtitulo}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
