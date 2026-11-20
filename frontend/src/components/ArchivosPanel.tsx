"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Cita = {
  id: number;
  inicia_en: string;
  estado: string;
  medico: string;
  paciente: string;
};

type Archivo = {
  id: number;
  cita_id: number;
  nombre_original: string;
  tipo_mime: string;
  tamano_bytes: number;
  creado_en: string;
  inicia_en: string;
  medico: string;
  paciente: string;
  subido_por_nombre: string;
};

type Pagina<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

type Props = {
  modo: "medico" | "paciente";
};

export default function ArchivosPanel({ modo }: Props) {
  const [fecha, setFecha] = useState("");
  const [citas, setCitas] = useState<Pagina<Cita> | null>(null);
  const [paginaCitas, setPaginaCitas] = useState(1);
  const [citaId, setCitaId] = useState("");

  const [archivos, setArchivos] = useState<Pagina<Archivo> | null>(null);
  const [paginaArchivos, setPaginaArchivos] = useState(1);
  const [revision, setRevision] = useState(0);

  const [cargandoCitas, setCargandoCitas] = useState(false);
  const [cargandoArchivos, setCargandoArchivos] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const [errorCitas, setErrorCitas] = useState("");
  const [errorArchivos, setErrorArchivos] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vigente = true;

    setCitas(null);
    setCitaId("");
    setErrorCitas("");

    if (!fecha) {
      setCargandoCitas(false);
      return;
    }

    async function cargar() {
      setCargandoCitas(true);

      try {
        const respuesta = await api.get<Pagina<Cita>>("/api/archivos/citas", {
          params: { fecha, page: paginaCitas },
        });

        if (vigente) setCitas(respuesta.data);
      } catch (error: unknown) {
        if (vigente) setErrorCitas(erroresPaciente(error).join(" "));
      } finally {
        if (vigente) setCargandoCitas(false);
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [fecha, paginaCitas, revision]);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargandoArchivos(true);
      setErrorArchivos("");

      try {
        const respuesta = await api.get<Pagina<Archivo>>("/api/archivos", {
          params: { page: paginaArchivos },
        });

        if (vigente) setArchivos(respuesta.data);
      } catch (error: unknown) {
        if (vigente) setErrorArchivos(erroresPaciente(error).join(" "));
      } finally {
        if (vigente) setCargandoArchivos(false);
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [paginaArchivos, revision]);

  async function subir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (ocupado || !citaId) return;

    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    const archivo = datos.get("archivo");

    if (!(archivo instanceof File) || archivo.size === 0) {
      setErrores(["Selecciona un archivo."]);
      return;
    }

    if (archivo.size > 2 * 1024 * 1024) {
      setErrores(["El archivo no puede superar 2 MB."]);
      return;
    }

    datos.set("cita_id", citaId);

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      // El navegador genera automáticamente el encabezado multipart.
      const respuesta = await api.post<{ message: string }>(
        "/api/archivos",
        datos
      );

      setExito(respuesta.data.message);
      formulario.reset();
      setCitaId("");
      setPaginaArchivos(1);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
    } finally {
      setOcupado(false);
    }
  }

  async function descargar(archivo: Archivo) {
    if (ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      const respuesta = await api.get<Blob>(
        `/api/archivos/${archivo.id}/descargar`,
        { responseType: "blob" }
      );

      const extensiones: Record<string, string> = {
        "application/pdf": "pdf",
        "image/jpeg": "jpg",
        "image/png": "png",
        "application/dicom": "dcm",
      };

      const extension = extensiones[archivo.tipo_mime] ?? "bin";
      const url = URL.createObjectURL(respuesta.data);
      const enlace = document.createElement("a");

      enlace.href = url;
      enlace.download = `documento-${archivo.id}.${extension}`;

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

  const boton =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40";

  const input =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2";

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <Link
          href={modo === "medico" ? "/medico" : "/paciente"}
          className="font-medium text-teal-700 underline"
        >
          Volver a mi panel
        </Link>

        <h1 className="mt-4 text-3xl font-bold">Documentos médicos</h1>

        <p className="mt-3 text-slate-600">
          Comparte documentos asociados a una cita. Solo el paciente y
          el médico de esa cita pueden acceder a ellos desde este módulo.
        </p>

        <button
          type="button"
          disabled={ocupado}
          onClick={() => setRevision((valor) => valor + 1)}
          className={`${boton} mt-4`}
        >
          Actualizar
        </button>

        {exito && (
          <p role="status" className="mt-5 rounded-lg bg-green-100 p-4 text-green-900">
            {exito}
          </p>
        )}

        {errores.length > 0 && (
          <ul role="alert" className="mt-5 list-inside list-disc rounded-lg bg-red-100 p-4 text-red-900">
            {errores.map((error, indice) => (
              <li key={indice}>{error}</li>
            ))}
          </ul>
        )}

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Subir documento</h2>

          <p className="mt-2 text-sm text-slate-600">
            PDF, JPG o PNG. Tamaño máximo: 2 MB.
          </p>

          <label className="mt-5 block">
            Fecha de la cita
            <input
              type="date"
              value={fecha}
              disabled={ocupado}
              onChange={(evento) => {
                setFecha(evento.target.value);
                setPaginaCitas(1);
                setCitaId("");
                setCitas(null);
              }}
              className={input}
            />
          </label>

          {cargandoCitas && <p className="mt-3">Buscando citas…</p>}

          {errorCitas && (
            <p role="alert" className="mt-3 text-red-700">{errorCitas}</p>
          )}

          {fecha && !cargandoCitas && !errorCitas &&
            citas?.data.length === 0 && (
              <p className="mt-3 text-slate-600">
                No hay citas compatibles en esa fecha.
              </p>
            )}

          <form onSubmit={subir} className="mt-5">
            <fieldset disabled={ocupado} className="space-y-4">
              <label className="block">
                Cita
                <select
                  required
                  value={citaId}
                  onChange={(evento) => setCitaId(evento.target.value)}
                  className={input}
                >
                  <option value="">Selecciona una cita</option>
                  {citas?.data.map((cita) => (
                    <option key={cita.id} value={cita.id}>
                      #{cita.id} — {cita.inicia_en.slice(11, 16)} —{" "}
                      {modo === "medico" ? cita.paciente : cita.medico}
                      {" — "}{cita.estado}
                    </option>
                  ))}
                </select>
              </label>

              {citas && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={paginaCitas <= 1 || cargandoCitas}
                    onClick={() => {
                      setCitaId("");
                      setPaginaCitas((valor) => valor - 1);
                    }}
                    className={boton}
                  >
                    Anterior
                  </button>
                  <span>{citas.current_page} / {citas.last_page}</span>
                  <button
                    type="button"
                    disabled={paginaCitas >= citas.last_page || cargandoCitas}
                    onClick={() => {
                      setCitaId("");
                      setPaginaCitas((valor) => valor + 1);
                    }}
                    className={boton}
                  >
                    Siguiente
                  </button>
                </div>
              )}

              <label className="block">
                Archivo
                <input
                  name="archivo"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  required
                  className={input}
                />
              </label>

              <button
                type="submit"
                disabled={!citaId || cargandoCitas || ocupado}
                className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-40"
              >
                {ocupado ? "Procesando…" : "Subir documento"}
              </button>
            </fieldset>
          </form>
        </section>

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Documentos disponibles</h2>

          {cargandoArchivos ? (
            <p className="mt-4">Cargando documentos…</p>
          ) : errorArchivos ? (
            <p role="alert" className="mt-4 text-red-700">
              {errorArchivos}
            </p>
          ) : archivos && archivos.data.length > 0 ? (
            <>
              <div className="mt-5 space-y-4">
                {archivos.data.map((archivo) => (
                  <article key={archivo.id} className="rounded-lg border p-4">
                    <h3 className="break-all font-semibold">
                      {archivo.nombre_original}
                    </h3>

                    <p className="mt-2 text-sm text-slate-600">
                      Cita #{archivo.cita_id} — {archivo.inicia_en.slice(0, 16)}
                    </p>

                    <p className="text-sm">
                      {modo === "medico"
                        ? `Paciente: ${archivo.paciente}`
                        : `Médico: ${archivo.medico}`}
                    </p>

                    <p className="text-sm">
                      Subido por: {archivo.subido_por_nombre}
                    </p>

                    <p className="text-sm text-slate-500">
                      {(archivo.tamano_bytes / 1024).toFixed(1)} KB
                      {" — "}{archivo.creado_en}
                    </p>

                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => descargar(archivo)}
                      className={`${boton} mt-3`}
                    >
                      Descargar
                    </button>
                  </article>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={ocupado || paginaArchivos <= 1}
                  onClick={() => setPaginaArchivos((valor) => valor - 1)}
                  className={boton}
                >
                  Anterior
                </button>
                <span>{archivos.current_page} / {archivos.last_page}</span>
                <button
                  type="button"
                  disabled={ocupado || paginaArchivos >= archivos.last_page}
                  onClick={() => setPaginaArchivos((valor) => valor + 1)}
                  className={boton}
                >
                  Siguiente
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 text-slate-600">
              Todavía no hay documentos disponibles.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
