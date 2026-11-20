"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Receta = {
  id: number;
  numero_receta: string;
  paciente: string;
  medico: string;
  estado: string;
  emitida_en: string;
  vencida: boolean;
};

type Pagina = {
  data: Receta[];
  current_page: number;
  last_page: number;
};

type Props = {
  modo: "medico" | "paciente";
};

export default function DescargarRecetas({ modo }: Props) {
  const [resultado, setResultado] = useState<Pagina | null>(null);
  const [pagina, setPagina] = useState(1);
  const [seleccionada, setSeleccionada] = useState("");
  const [revision, setRevision] = useState(0);

  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargando(true);
      setError("");
      setSeleccionada("");

      try {
        const respuesta = await api.get<Pagina>(
          `/api/${modo}/recetas`,
          { params: { page: pagina } }
        );

        if (vigente) {
          setResultado(respuesta.data);
        }
      } catch (error: unknown) {
        if (vigente) {
          setError(erroresPaciente(error).join(" "));
        }
      } finally {
        if (vigente) {
          setCargando(false);
        }
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [modo, pagina, revision]);

  async function descargar() {
    if (!seleccionada || descargando) return;

    setDescargando(true);
    setError("");

    try {
      const respuesta = await api.get<Blob>(
        `/api/recetas/${seleccionada}/pdf`,
        {
          responseType: "blob",
        }
      );

      const archivo = new Blob([respuesta.data], {
        type: "application/pdf",
      });

      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement("a");

      enlace.href = url;
      enlace.download = `receta-${seleccionada}.pdf`;

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      // Da tiempo al navegador para iniciar la descarga.
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error: unknown) {
      let mensaje = erroresPaciente(error).join(" ");

      // Con responseType "blob", los errores JSON llegan como Blob.
      if (
        axios.isAxiosError(error) &&
        error.response?.data instanceof Blob
      ) {
        try {
          const texto = await error.response.data.text();
          const datos: unknown = JSON.parse(texto);

          if (
            typeof datos === "object" &&
            datos !== null &&
            "message" in datos &&
            typeof datos.message === "string"
          ) {
            mensaje = datos.message;
          }
        } catch {
          // Conserva el mensaje general si no era una respuesta JSON.
        }
      }

      setError(mensaje);
    } finally {
      setDescargando(false);
    }
  }

  const bloqueado = cargando || descargando;

  return (
    <section className="border-b border-slate-200 bg-slate-50 px-5 py-6 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-xl font-semibold">Descargar receta en PDF</h2>

        <p className="mt-2 text-sm text-slate-600">
          Selecciona una receta. Si acabas de emitirla, pulsa Actualizar lista.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-100 p-3 text-red-900"
          >
            {error}
          </p>
        )}

        {cargando ? (
          <p role="status" className="mt-4">Cargando recetas…</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-60 flex-1">
              <span className="text-sm font-medium">Receta</span>
              <select
                value={seleccionada}
                disabled={bloqueado}
                onChange={(evento) => setSeleccionada(evento.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">Selecciona una receta</option>

                {resultado?.data
                  .filter((receta) =>
                    ["emitida", "anulada"].includes(receta.estado)
                  )
                  .map((receta) => (
                    <option key={receta.id} value={receta.id}>
                      #{receta.id} —{" "}
                      {modo === "medico" ? receta.paciente : receta.medico}
                      {" — "}{receta.emitida_en.slice(0, 10)}
                      {" — "}{receta.estado}
                      {receta.vencida ? " / vencida" : ""}
                    </option>
                  ))}
              </select>
            </label>

            <button
              type="button"
              disabled={bloqueado || !seleccionada}
              onClick={descargar}
              className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-40"
            >
              {descargando ? "Generando PDF…" : "Descargar PDF"}
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => setRevision((valor) => valor + 1)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
          >
            Actualizar lista
          </button>

          {resultado && (
            <>
              <button
                type="button"
                disabled={bloqueado || pagina <= 1}
                onClick={() => setPagina((valor) => valor - 1)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
              >
                Anterior
              </button>

              <span className="text-sm">
                {resultado.current_page} / {resultado.last_page}
              </span>

              <button
                type="button"
                disabled={bloqueado || pagina >= resultado.last_page}
                onClick={() => setPagina((valor) => valor + 1)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40"
              >
                Siguiente
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
