"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type Notificacion = {
  id: number;
  tipo: string;
  titulo: string;
  mensaje: string;
  url: string | null;
  cita_id: number | null;
  leida_en: string | null;
  creado_en: string;
};

export default function CampanaNotificaciones() {
  const [items, setItems] = useState<Notificacion[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get("/api/notificaciones");
      setItems(data.data);
      setNoLeidas(data.no_leidas);
    } catch {
      // La campana no debe romper el panel si falla la carga.
    }
  }, []);

  useEffect(() => {
    void cargar();
    const intervalo = setInterval(() => void cargar(), 30000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  useEffect(() => {
    function cerrarAlHacerClicFuera(evento: MouseEvent) {
      if (
        contenedor.current &&
        !contenedor.current.contains(evento.target as Node)
      ) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", cerrarAlHacerClicFuera);
    return () =>
      document.removeEventListener("mousedown", cerrarAlHacerClicFuera);
  }, []);

  async function marcar(n: Notificacion) {
    if (n.leida_en) return;
    try {
      await api.post(`/api/notificaciones/${n.id}/leer`);
      await cargar();
    } catch {}
  }

  async function marcarTodas() {
    try {
      await api.post("/api/notificaciones/leer-todas");
      await cargar();
    } catch {}
  }

  function fecha(valor: string) {
    return new Date(valor.replace(" ", "T")).toLocaleString("es-SV", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        aria-label="Notificaciones"
        onClick={() => {
          setAbierto((valor) => !valor);
          void cargar();
        }}
        className="relative rounded-full border border-slate-300 bg-white px-3 py-2 text-lg"
      >
        🔔
        {noLeidas > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-xs font-bold text-white">
            {noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Notificaciones
            </h2>
            {noLeidas > 0 && (
              <button
                type="button"
                onClick={marcarTodas}
                className="text-xs text-blue-700 underline"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes notificaciones.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((n) => (
                <li
                  key={n.id}
                  onClick={() => marcar(n)}
                  className={`cursor-pointer rounded-lg border p-3 text-sm ${
                    n.leida_en
                      ? "border-slate-200 bg-white"
                      : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <p className="font-semibold text-slate-900">{n.titulo}</p>
                  <p className="mt-1 text-slate-700">{n.mensaje}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {fecha(n.creado_en)}
                  </p>
                  {n.url && (
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(evento) => evento.stopPropagation()}
                      className="mt-2 inline-block rounded-md bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Unirse a la videollamada
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}