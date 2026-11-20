"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Reporte = {
  id: number;
  tipo_reporte: string;
  periodo_inicio: string;
  periodo_fin: string;
  estado: string;
  creado_en: string;
  iniciado_en: string | null;
  completado_en: string | null;
  intentos: number;
  codigo_error: string | null;
  solicitado_por_nombre: string;
};

type Pagina = {
  data: Reporte[];
  current_page: number;
  last_page: number;
  total: number;
};

const tipos: Record<string, string> = {
  citas: "Citas por fecha, especialidad y estado",
  pagos: "Cobros y reembolsos registrados",
  estadisticas_semanales: "Resumen de siete días: citas y pagos",
};

export default function ReportesAdministrador() {
  const claveSolicitud = useRef<string | null>(null);

  const [tipo, setTipo] = useState("citas");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");

  const [resultado, setResultado] = useState<Pagina | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vigente = true;
    let consultando = false;

    async function cargar() {
      if (consultando) return;
      consultando = true;

      try {
        const respuesta = await api.get<Pagina>("/api/admin/reportes", {
          params: { page: pagina },
        });

        if (vigente) {
          setResultado(respuesta.data);
          setErrorCarga("");
        }
      } catch (error: unknown) {
        if (vigente) {
          setErrorCarga(erroresPaciente(error).join(" "));
        }
      } finally {
        consultando = false;
        if (vigente) setCargando(false);
      }
    }

    setCargando(true);
    cargar();

    // Consulta el estado; no vuelve a generar los reportes.
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        cargar();
      }
    }, 5000);

    return () => {
      vigente = false;
      window.clearInterval(intervalo);
    };
  }, [pagina, revision]);

  async function solicitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    if (!claveSolicitud.current) {
      claveSolicitud.current = crypto.randomUUID();
    }

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.post<{ message: string }>(
        "/api/admin/reportes",
        {
          tipo_reporte: tipo,
          periodo_inicio: inicio,
          periodo_fin: fin,
          clave_solicitud: claveSolicitud.current,
        }
      );

      setExito(respuesta.data.message);
      claveSolicitud.current = null;
      setPagina(1);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
    } finally {
      setOcupado(false);
    }
  }

  async function descargar(reporte: Reporte) {
    if (ocupado) return;

    setOcupado(true);
    setErrores([]);

    try {
      const respuesta = await api.get<Blob>(
        `/api/admin/reportes/${reporte.id}/descargar`,
        { responseType: "blob" }
      );

      const url = URL.createObjectURL(respuesta.data);
      const enlace = document.createElement("a");

      enlace.href = url;
      enlace.download = `reporte-${reporte.id}.csv`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error: unknown) {
      let mensaje = erroresPaciente(error).join(" ");

      if (
        axios.isAxiosError(error) &&
        error.response?.data instanceof Blob
      ) {
        try {
          const datos: unknown = JSON.parse(
            await error.response.data.text()
          );

          if (
            typeof datos === "object" &&
            datos !== null &&
            "message" in datos &&
            typeof datos.message === "string"
          ) {
            mensaje = datos.message;
          }
        } catch {
          // Conserva el mensaje general.
        }
      }

      setErrores([mensaje]);
    } finally {
      setOcupado(false);
    }
  }

  const input =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";

  const boton =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="font-medium text-teal-700 underline">
          Volver al panel
        </Link>

        <h1 className="mt-4 text-3xl font-bold">Reportes</h1>

        <p className="mt-3 text-slate-600">
          Solicita estadísticas y descarga el resultado en CSV.
          Puedes seguir usando la aplicación mientras se genera.
        </p>

        {exito && (
          <p role="status" className="mt-5 rounded-lg bg-green-100 p-4 text-green-900">
            {exito}
          </p>
        )}

        {errores.length > 0 && (
          <ul role="alert" className="mt-5 list-inside list-disc rounded-lg bg-red-100 p-4 text-red-900">
            {errores.map((error, indice) => <li key={indice}>{error}</li>)}
          </ul>
        )}

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Solicitar reporte</h2>

          <form
            onSubmit={solicitar}
            onChange={() => {
              claveSolicitud.current = null;
            }}
            className="mt-5"
          >
            <fieldset disabled={ocupado} className="grid gap-5 md:grid-cols-3">
              <label className="md:col-span-3">
                Tipo
                <select
                  value={tipo}
                  onChange={(evento) => setTipo(evento.target.value)}
                  className={input}
                >
                  {Object.entries(tipos).map(([valor, texto]) => (
                    <option key={valor} value={valor}>{texto}</option>
                  ))}
                </select>
              </label>

              <label>
                Fecha inicial
                <input
                  type="date"
                  required
                  value={inicio}
                  onChange={(evento) => setInicio(evento.target.value)}
                  className={input}
                />
              </label>

              <label>
                Fecha final
                <input
                  type="date"
                  required
                  value={fin}
                  onChange={(evento) => setFin(evento.target.value)}
                  className={input}
                />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-40"
                >
                  {ocupado ? "Procesando…" : "Generar reporte"}
                </button>
              </div>
            </fieldset>
          </form>

          <p className="mt-4 text-sm text-slate-600">
            Las dos fechas están incluidas. El resumen semanal exige
            exactamente siete días. Los otros tipos permiten hasta 366 días.
          </p>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Solicitudes</h2>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setRevision((valor) => valor + 1)}
              className={boton}
            >
              Actualizar
            </button>
          </div>

          <p className="mt-2 text-sm text-slate-500">
            El estado se actualiza cada cinco segundos mientras esta pestaña está visible.
          </p>

          {errorCarga && (
            <p role="alert" className="mt-4 text-red-700">{errorCarga}</p>
          )}

          {cargando ? (
            <p className="mt-4">Cargando reportes…</p>
          ) : resultado && resultado.data.length > 0 ? (
            <>
              <div className="mt-5 space-y-4">
                {resultado.data.map((reporte) => (
                  <article key={reporte.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h3 className="font-semibold">
                        #{reporte.id} — {tipos[reporte.tipo_reporte] ?? reporte.tipo_reporte}
                      </h3>
                      <span className="font-medium capitalize">{reporte.estado}</span>
                    </div>

                    <p className="mt-2 text-sm">
                      {reporte.periodo_inicio} a {reporte.periodo_fin}
                    </p>
                    <p className="text-sm text-slate-600">
                      Solicitado por: {reporte.solicitado_por_nombre}
                    </p>
                    <p className="text-sm text-slate-600">
                      Creado: {reporte.creado_en}
                    </p>

                    {reporte.estado === "pendiente" && (
                      <p className="mt-3 text-sm">
                        La solicitud está en espera de procesamiento.
                      </p>
                    )}

                    {reporte.estado === "procesando" && (
                      <p className="mt-3 text-sm">
                        Generando el archivo…
                      </p>
                    )}

                    {reporte.estado === "fallido" && (
                      <p className="mt-3 text-sm text-red-700">
                        No se pudo generar. Código: {reporte.codigo_error}.
                        Revisa el proceso de generación antes de solicitar otro.
                      </p>
                    )}

                    {reporte.estado === "completado" && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => descargar(reporte)}
                        className={`${boton} mt-3`}
                      >
                        Descargar CSV
                      </button>
                    )}
                  </article>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={ocupado || pagina <= 1}
                  onClick={() => setPagina((valor) => valor - 1)}
                  className={boton}
                >
                  Anterior
                </button>
                <span>{resultado.current_page} / {resultado.last_page}</span>
                <button
                  type="button"
                  disabled={ocupado || pagina >= resultado.last_page}
                  onClick={() => setPagina((valor) => valor + 1)}
                  className={boton}
                >
                  Siguiente
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4">Todavía no hay solicitudes.</p>
          )}
        </section>
      </div>
    </main>
  );
}

