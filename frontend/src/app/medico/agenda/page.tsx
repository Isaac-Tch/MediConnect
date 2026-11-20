"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import axios from "axios";
import { api } from "@/lib/api";
import { mensajeError } from "@/lib/auth";

type Horario = {
  id: number;
  inicia_en: string;
  termina_en: string;
  total_citas: number;
  ocupado: boolean;
  editable: boolean;
};

type EstadoCita =
  | "pendiente"
  | "confirmada"
  | "cancelada"
  | "completada"
  | "no_asistio";

type AccionCita = Exclude<EstadoCita, "pendiente">;

type Cita = {
  id: number;
  inicia_en: string;
  termina_en: string;
  paciente: string;
  motivo: string;
  motivo_cancelacion: string | null;
  estado: EstadoCita;
  acciones: AccionCita[];
};

type ListaCitas = {
  data: Cita[];
  current_page: number;
  last_page: number;
  total: number;
};

type Operacion =
  | { tipo: "eliminarHorario"; horario: Horario }
  | { tipo: "cambiarCita"; cita: Cita; estado: AccionCita };

type RespuestaError = {
  message?: string;
  errors?: Record<string, string[]>;
};

const etiquetas: Record<EstadoCita, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
  no_asistio: "No asistió",
};

const botones: Record<AccionCita, string> = {
  confirmada: "Confirmar cita",
  cancelada: "Cancelar cita",
  completada: "Marcar completada",
  no_asistio: "Registrar inasistencia",
};

function fechaHoy(): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/El_Salvador",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obtener = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? "";

  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

function hora(valor: string): string {
  return valor.slice(11, 16);
}

function erroresSolicitud(error: unknown): string[] {
  if (axios.isAxiosError<RespuestaError>(error)) {
    if (
      error.response?.status === 422 &&
      error.response.data.errors
    ) {
      return Object.values(error.response.data.errors).flat();
    }

    if (
      [404, 409].includes(error.response?.status ?? 0) &&
      error.response?.data.message
    ) {
      return [error.response.data.message];
    }
  }

  return [mensajeError(error)];
}

export default function AgendaMedica() {
  const [fecha, setFecha] = useState("");
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [citas, setCitas] = useState<ListaCitas | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);

  const [fechaHorario, setFechaHorario] = useState("");
  const [horaHorario, setHoraHorario] = useState("08:00");
  const [editando, setEditando] = useState<Horario | null>(null);

  const [operacion, setOperacion] = useState<Operacion | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");

  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  useEffect(() => {
    const hoy = fechaHoy();
    setFecha(hoy);
    setFechaHorario(hoy);
  }, []);

  useEffect(() => {
    if (!fecha) return;

    let vigente = true;

    async function cargarAgenda() {
      setCargando(true);
      setErrorCarga("");

      try {
        const [respuestaHorarios, respuestaCitas] = await Promise.all([
          api.get<{ data: Horario[] }>("/api/medico/horarios", {
            params: { fecha },
          }),
          api.get<ListaCitas>("/api/medico/citas", {
            params: { fecha, page: pagina },
          }),
        ]);

        if (vigente) {
          setHorarios(respuestaHorarios.data.data);
          setCitas(respuestaCitas.data);
        }
      } catch (error: unknown) {
        if (vigente) {
          setErrorCarga(mensajeError(error));
        }
      } finally {
        if (vigente) {
          setCargando(false);
        }
      }
    }

    cargarAgenda();

    return () => {
      vigente = false;
    };
  }, [fecha, pagina, revision]);

  function refrescar() {
    setPagina(1);
    setRevision((valor) => valor + 1);
  }

  function seleccionarFecha(valor: string) {
    setFecha(valor);
    setPagina(1);
    setEditando(null);
    setFechaHorario(valor);
    setOperacion(null);
    setErrores([]);
    setExito("");
  }

  function prepararEdicion(horario: Horario) {
    setEditando(horario);
    setFechaHorario(horario.inicia_en.slice(0, 10));
    setHoraHorario(hora(horario.inicia_en));
    setOperacion(null);
    setErrores([]);
    setExito("");
    document.getElementById("formulario-horario")?.scrollIntoView({
      behavior: "smooth",
    });
  }

  function prepararOperacion(nueva: Operacion) {
    setOperacion(nueva);
    setMotivoCancelacion("");
    setErrores([]);
    setExito("");
  }

  async function guardarHorario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const datos = {
        fecha: fechaHorario,
        hora: horaHorario,
      };

      const respuesta = editando
        ? await api.put<{ message: string }>(
            `/api/medico/horarios/${editando.id}`,
            datos
          )
        : await api.post<{ message: string }>(
            "/api/medico/horarios",
            datos
          );

      setExito(respuesta.data.message);
      setEditando(null);
      setFecha(fechaHorario);
      refrescar();
    } catch (error: unknown) {
      setErrores(erroresSolicitud(error));
    } finally {
      setOcupado(false);
    }
  }

  async function ejecutarOperacion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (!operacion || ocupado) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta =
        operacion.tipo === "eliminarHorario"
          ? await api.delete<{ message: string }>(
              `/api/medico/horarios/${operacion.horario.id}`
            )
          : await api.patch<{ message: string }>(
              `/api/medico/citas/${operacion.cita.id}/estado`,
              {
                estado: operacion.estado,
                motivo_cancelacion:
                  operacion.estado === "cancelada"
                    ? motivoCancelacion.trim()
                    : null,
              }
            );

      setExito(respuesta.data.message);
      setOperacion(null);
      setEditando(null);
      refrescar();
    } catch (error: unknown) {
      setErrores(erroresSolicitud(error));
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
        <Link href="/medico" className="font-medium text-teal-700 underline">
          Volver al panel
        </Link>

        <h1 className="mt-4 text-3xl font-bold">Mi agenda</h1>
        <p className="mt-2 text-slate-600">
          Horarios y citas en hora de El Salvador. Cada consulta dura
          30 minutos.
        </p>

        <section className="mt-6 flex flex-wrap items-end gap-4 rounded-xl bg-white p-5">
          <label className="block">
            Fecha de la agenda
            <input
              type="date"
              value={fecha}
              required
              disabled={ocupado}
              onChange={(evento) => seleccionarFecha(evento.target.value)}
              className={input}
            />
          </label>

          <button
            type="button"
            disabled={ocupado || cargando || !fecha}
            onClick={() => setRevision((valor) => valor + 1)}
            className={boton}
          >
            Actualizar agenda
          </button>
        </section>

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

        {errorCarga && (
          <p role="alert" className="mt-5 rounded-lg bg-red-100 p-4 text-red-900">
            {errorCarga} Usa el botón Actualizar agenda para reintentar.
          </p>
        )}

        {operacion && (
          <form
            onSubmit={ejecutarOperacion}
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5"
          >
            <h2 className="font-semibold">Confirmar acción</h2>

            <p className="mt-2">
              {operacion.tipo === "eliminarHorario"
                ? `Eliminar el horario de las ${hora(operacion.horario.inicia_en)}.`
                : `${botones[operacion.estado]} de ${operacion.cita.paciente}.`}
            </p>

            {operacion.tipo === "cambiarCita" &&
              operacion.estado === "cancelada" && (
                <label className="mt-3 block">
                  Motivo de cancelación
                  <textarea
                    required
                    maxLength={1000}
                    value={motivoCancelacion}
                    disabled={ocupado}
                    onChange={(evento) =>
                      setMotivoCancelacion(evento.target.value)
                    }
                    className={input}
                  />
                </label>
              )}

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={ocupado}
                className="rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
              >
                {ocupado ? "Procesando…" : "Confirmar"}
              </button>

              <button
                type="button"
                disabled={ocupado}
                onClick={() => setOperacion(null)}
                className={boton}
              >
                Volver
              </button>
            </div>
          </form>
        )}

        <section
          id="formulario-horario"
          className="mt-8 scroll-mt-5 rounded-xl bg-white p-6 shadow-sm"
        >
          <h2 className="text-xl font-semibold">
            {editando ? "Editar horario" : "Crear horario"}
          </h2>

          <form onSubmit={guardarHorario} className="mt-5">
            <fieldset
              disabled={ocupado || operacion !== null}
              className="grid gap-4 md:grid-cols-3"
            >
              <label>
                Fecha
                <input
                  type="date"
                  required
                  value={fechaHorario}
                  onChange={(evento) => setFechaHorario(evento.target.value)}
                  className={input}
                />
              </label>

              <label>
                Hora de inicio
                <select
                  value={horaHorario}
                  onChange={(evento) => setHoraHorario(evento.target.value)}
                  className={input}
                >
                  {Array.from({ length: 48 }, (_, indice) => {
                    const horas = String(Math.floor(indice / 2)).padStart(2, "0");
                    const minutos = indice % 2 === 0 ? "00" : "30";
                    const valor = `${horas}:${minutos}`;

                    return (
                      <option key={valor} value={valor}>
                        {valor}
                      </option>
                    );
                  })}
                </select>
              </label>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-teal-700 px-4 py-2 text-white disabled:opacity-40"
                >
                  {ocupado
                    ? "Guardando…"
                    : editando
                      ? "Guardar cambios"
                      : "Crear horario"}
                </button>

                {editando && (
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    className={boton}
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
            </fieldset>
          </form>
        </section>

        <section id="horarios" className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Horarios del día</h2>

          {cargando ? (
            <p className="mt-4">Cargando…</p>
          ) : errorCarga ? (
            <p className="mt-4">No se pudo actualizar esta sección.</p>
          ) : horarios.length === 0 ? (
            <p className="mt-4 text-slate-600">No hay horarios para esta fecha.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="p-3">Inicio</th>
                    <th className="p-3">Fin</th>
                    <th className="p-3">Reserva</th>
                    <th className="p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {horarios.map((horario) => (
                    <tr key={horario.id} className="border-b">
                      <td className="p-3">{hora(horario.inicia_en)}</td>
                      <td className="p-3">
                        {hora(horario.termina_en)}
                        {horario.termina_en.slice(0, 10) !==
                          horario.inicia_en.slice(0, 10) && " (día siguiente)"}
                      </td>
                      <td className="p-3">
                        {horario.ocupado ? "Con cita" : "Sin reserva vigente"}
                      </td>
                      <td className="p-3">
                        {horario.editable ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() => prepararEdicion(horario)}
                              className={boton}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={ocupado}
                              onClick={() =>
                                prepararOperacion({
                                  tipo: "eliminarHorario",
                                  horario,
                                })
                              }
                              className={boton}
                            >
                              Eliminar
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500">
                            {horario.total_citas > 0
                              ? "Conservado por sus citas"
                              : "Horario pasado"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="citas" className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Citas del día</h2>

          {cargando ? (
            <p className="mt-4">Cargando…</p>
          ) : errorCarga ? (
            <p className="mt-4">No se pudo actualizar esta sección.</p>
          ) : !citas || citas.data.length === 0 ? (
            <p className="mt-4 text-slate-600">
              No tienes citas para esta fecha.
            </p>
          ) : (
            <>
              <div className="mt-5 space-y-4">
                {citas.data.map((cita) => (
                  <article key={cita.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h3 className="font-semibold">
                        {hora(cita.inicia_en)} — {cita.paciente}
                      </h3>
                      <span className="text-sm">{etiquetas[cita.estado]}</span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                      Motivo: {cita.motivo}
                    </p>

                    {cita.motivo_cancelacion && (
                      <p className="mt-2 text-sm text-red-700">
                        Cancelación: {cita.motivo_cancelacion}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {cita.acciones.map((estado) => (
                        <button
                          key={estado}
                          type="button"
                          disabled={ocupado}
                          onClick={() =>
                            prepararOperacion({
                              tipo: "cambiarCita",
                              cita,
                              estado,
                            })
                          }
                          className={boton}
                        >
                          {botones[estado]}
                        </button>
                      ))}

                      {cita.acciones.length === 0 && (
                        <p className="text-sm text-slate-500">
                          Sin cambios de estado disponibles en este momento.
                        </p>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">
                  Página {citas.current_page} de {citas.last_page}.
                  Total: {citas.total} citas.
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={ocupado || pagina <= 1}
                    onClick={() => setPagina((valor) => valor - 1)}
                    className={boton}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || pagina >= citas.last_page}
                    onClick={() => setPagina((valor) => valor + 1)}
                    className={boton}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
