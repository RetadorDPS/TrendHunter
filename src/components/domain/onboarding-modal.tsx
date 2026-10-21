"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Sparkles, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PushPanel, type DispositivoPush } from "@/components/pwa/push-panel";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";

interface TiendaCandidata {
  id: string;
  name: string;
  domain: string;
  niche: string;
  estimatedMonthlyRevenue: number;
}

interface OnboardingModalProps {
  mostrar: boolean;
  tiendas: TiendaCandidata[];
  pushConfigurado: boolean;
  clavePublicaPush: string | null;
}

const TOTAL_PASOS = 3;
const MAX_TIENDAS = 3;

/**
 * Onboarding de 3 pasos en el primer acceso al panel: elegir nicho, seguir
 * hasta 3 tiendas y activar avisos. Saltable en cualquier momento, medible
 * (se guarda si se terminó o se saltó) y sin pantalla ni ruta nueva: es un
 * diálogo sobre el panel general.
 */
export function OnboardingModal({ mostrar, tiendas, pushConfigurado, clavePublicaPush }: OnboardingModalProps) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(mostrar);
  const [paso, setPaso] = useState(1);
  const [nicho, setNicho] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);

  async function guardar(body: { nicho?: string; estado?: "completado" | "saltado" }) {
    try {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // El onboarding no debe bloquear al usuario por un fallo de red: se
      // reintentará en el próximo acceso si el estado no quedó guardado.
    }
  }

  async function saltar() {
    setAbierto(false);
    await guardar({ estado: "saltado" });
  }

  async function irAPaso2() {
    if (!nicho) {
      toast.error("Elige un nicho para continuar (o salta el onboarding).");
      return;
    }
    setOcupado(true);
    await guardar({ nicho });
    setOcupado(false);
    setPaso(2);
  }

  function alternarTienda(id: string) {
    setSeleccion((actual) => {
      if (actual.includes(id)) return actual.filter((item) => item !== id);
      if (actual.length >= MAX_TIENDAS) {
        toast.error(`Máximo ${MAX_TIENDAS} tiendas en este paso. Puedes seguir más luego desde Store Tracker.`);
        return actual;
      }
      return [...actual, id];
    });
  }

  async function irAPaso3() {
    setOcupado(true);
    let seguidas = 0;
    for (const storeId of seleccion) {
      try {
        const respuesta = await fetch("/api/trackers/stores", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ storeId }),
        });
        if (respuesta.ok) {
          seguidas += 1;
        } else {
          const datos = (await respuesta.json().catch(() => ({}))) as { error?: string };
          toast.error(datos.error ?? "No se pudo seguir una tienda.");
        }
      } catch {
        toast.error("No se pudo seguir una tienda (sin conexión).");
      }
    }
    setOcupado(false);
    if (seguidas > 0) toast.success(`Siguiendo ${seguidas} tienda${seguidas === 1 ? "" : "s"}.`);
    setPaso(3);
  }

  async function terminar() {
    setOcupado(true);
    await guardar({ estado: "completado" });
    setOcupado(false);
    setAbierto(false);
    router.refresh();
  }

  const tiendasMostradas = tiendas.slice(0, 6);

  return (
    <Dialog open={abierto} onOpenChange={(valor) => !valor && void saltar()}>
      <DialogContent className="max-w-xl" hideClose>
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className="border-indigo-500/30 text-indigo-300">
              Paso {paso} de {TOTAL_PASOS}
            </Badge>
            <Button variant="ghost" size="sm" onClick={() => void saltar()} className="text-muted-foreground">
              Saltar
            </Button>
          </div>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-5 text-indigo-400" />
            {paso === 1 && "¿Qué nicho te interesa?"}
            {paso === 2 && "Sigue hasta 3 tiendas"}
            {paso === 3 && "Activa los avisos"}
          </DialogTitle>
          <DialogDescription>
            {paso === 1 && "Usamos tu elección para ordenarte mejor el catálogo. Lo puedes cambiar cuando quieras."}
            {paso === 2 && "Verás sus cambios de precio, altas y bajas de stock en Store Tracker."}
            {paso === 3 && "Recibe en este dispositivo las mismas alertas que ya llegan a la campana."}
          </DialogDescription>
        </DialogHeader>

        {paso === 1 && (
          <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-3">
            {PRODUCT_CATEGORIES.map((categoria) => (
              <button
                key={categoria}
                type="button"
                onClick={() => setNicho(categoria)}
                className={cn(
                  "rounded-lg border px-3 py-3 text-sm transition-colors",
                  nicho === categoria
                    ? "border-indigo-500/60 bg-indigo-500/15 text-indigo-200"
                    : "border-border text-muted-foreground hover:border-indigo-500/30",
                )}
                aria-pressed={nicho === categoria}
              >
                {categoria}
              </button>
            ))}
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-2 py-2">
            {tiendasMostradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay tiendas en el radar. Puedes seguir alguna más tarde desde Store Tracker.
              </p>
            ) : (
              tiendasMostradas.map((tienda) => {
                const marcada = seleccion.includes(tienda.id);
                return (
                  <label
                    key={tienda.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors",
                      marcada ? "border-indigo-500/50 bg-indigo-500/10" : "border-border hover:border-indigo-500/30",
                    )}
                  >
                    <Checkbox checked={marcada} onCheckedChange={() => alternarTienda(tienda.id)} />
                    <StoreIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{tienda.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tienda.domain} · {tienda.niche}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatCurrency(tienda.estimatedMonthlyRevenue)}/mes
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}

        {paso === 3 && (
          <div className="py-2">
            <PushPanel configurado={pushConfigurado} clavePublica={clavePublicaPush} dispositivos={[] as DispositivoPush[]} />
          </div>
        )}

        <DialogFooter>
          {paso === 1 && (
            <Button onClick={() => void irAPaso2()} disabled={ocupado} className="gap-2">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Continuar
            </Button>
          )}
          {paso === 2 && (
            <Button onClick={() => void irAPaso3()} disabled={ocupado} className="gap-2">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {seleccion.length === 0 ? "Seguir luego, continuar" : `Seguir ${seleccion.length} y continuar`}
            </Button>
          )}
          {paso === 3 && (
            <Button onClick={() => void terminar()} disabled={ocupado} className="gap-2">
              {ocupado ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Terminar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
