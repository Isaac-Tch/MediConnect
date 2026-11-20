"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { erroresPaciente } from "@/lib/erroresPaciente";

type Medico = {
  id: number;
  nombre: string;
  especialidad: string;
  tarifa_consulta: string;
  moneda: string;
};

type Horario = {
  id: number;
  inicia_en: string;
  termina_en: string;
};

type Cita = {
  id: number;
  inicia_en: string;
  medico: string;
  estado: string;
  motivo: string;
  motivo_cancelacion: string | null;
  precio: string;
  moneda: string;
  puede_cancelar: boolean;
};

type Pagina<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
};

export default function PanelPaciente() {
  const [medicos, setMedicos] = useState<Pagina<Medico> | null>(null);
  const [paginaMedicos, setPaginaMedicos] = useState(1);
  const [medico, setMedico] = useState<Medico | null>(null);

  const [fecha, setFecha] = useState("");
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [horarioId, setHorarioId] = useState("");
  const [motivo, setMotivo] = useState("");

  const [citas, setCitas] = useState<Pagina<Cita> | null>(null);
  const [paginaCitas, setPaginaCitas] = useState(1);

  const [cancelando, setCancelando] = useState<Cita | null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState("");

  const [revision, setRevision] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [cargandoMedicos, setCargandoMedicos] = useState(true);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);
  const [cargandoCitas, setCargandoCitas] = useState(true);

  const [errorMedicos, setErrorMedicos] = useState("");
  const [errorHorarios, setErrorHorarios] = useState("");
  const [errorCitas, setErrorCitas] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [exito, setExito] = useState("");

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargandoMedicos(true);
      setErrorMedicos("");

      try {
        const respuesta = await api.get<Pagina<Medico>>("/api/medicos", {
          params: { page: paginaMedicos },
        });

        if (vigente) setMedicos(respuesta.data);
      } catch (error: unknown) {
        if (vigente) setErrorMedicos(erroresPaciente(error).join(" "));
      } finally {
        if (vigente) setCargandoMedicos(false);
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [paginaMedicos, revision]);

  useEffect(() => {
    let vigente = true;

    async function cargar() {
      setCargandoCitas(true);
      setErrorCitas("");

      try {
        const respuesta = await api.get<Pagina<Cita>>("/api/paciente/citas", {
          params: { page: paginaCitas },
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
  }, [paginaCitas, revision]);

  useEffect(() => {
    let vigente = true;
    setHorarios([]);
    setHorarioId("");
    setErrorHorarios("");

    if (!medico || !fecha) {
      setCargandoHorarios(false);
      return;
    }

    const medicoId = medico.id;

    async function cargar() {
      setCargandoHorarios(true);

      try {
        const respuesta = await api.get<{ data: Horario[] }>(
          `/api/paciente/medicos/${medicoId}/horarios`,
          { params: { fecha } }
        );

        if (vigente) setHorarios(respuesta.data.data);
      } catch (error: unknown) {
        if (vigente) setErrorHorarios(erroresPaciente(error).join(" "));
      } finally {
        if (vigente) setCargandoHorarios(false);
      }
    }

    cargar();

    return () => {
      vigente = false;
    };
  }, [medico, fecha, revision]);

  async function reservar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (ocupado || !horarioId) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.post<{ message: string }>(
        "/api/paciente/citas",
        {
          horario_id: Number(horarioId),
          motivo,
        }
      );

      setExito(respuesta.data.message);
      setMotivo("");
      setHorarioId("");
      setPaginaCitas(1);
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
      setRevision((valor) => valor + 1);
    } finally {
      setOcupado(false);
    }
  }

  async function cancelarCita(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (ocupado || !cancelando) return;

    setOcupado(true);
    setErrores([]);
    setExito("");

    try {
      await api.get("/sanctum/csrf-cookie");

      const respuesta = await api.patch<{ message: string }>(
        `/api/paciente/citas/${cancelando.id}/cancelar`,
        { motivo_cancelacion: motivoCancelacion }
      );

      setExito(respuesta.data.message);
      setCancelando(null);
      setMotivoCancelacion("");
      setRevision((valor) => valor + 1);
    } catch (error: unknown) {
      setErrores(erroresPaciente(error));
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Mi panel de paciente</h1>
          <Link
            href="/paciente/perfil"
            className="rounded-lg bg-teal-700 px-4 py-2 text-white"
          >
            Mi perfil
          </Link>
        </div>

        <p className="mt-3 text-slate-600">
          Reserva una consulta y revisa tus citas. Todas las horas
          corresponden a El Salvador.
        </p>

        <button
          type="button"
          disabled={ocupado}
          onClick={() => setRevision((valor) => valor + 1)}
          className={`${boton} mt-4`}
        >
          Actualizar información
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
          <h2 className="text-xl font-semibold">1. Elige un médico</h2>

          {cargandoMedicos ? (
            <p className="mt-4">Cargando médicos…</p>
          ) : errorMedicos ? (
            <p role="alert" className="mt-4 text-red-700">{errorMedicos}</p>
          ) : (
            <>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {medicos?.data.map((item) => (
                  <article key={item.id} className="rounded-lg border p-4">
                    <h3 className="font-semibold">{item.nombre}</h3>
                    <p>{item.especialidad}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Consulta: {item.tarifa_consulta} {item.moneda}
                    </p>
                    <button
                      type="button"
                      disabled={ocupado}
                      onClick={() => {
                        setMedico(item);
                        setHorarioId("");
                        setHorarios([]);
                        setErrores([]);
                      }}
                      className={`${boton} mt-3`}
                    >
                      {medico?.id === item.id ? "Seleccionado" : "Seleccionar"}
                    </button>
                  </article>
                ))}
              </div>

              {medicos?.data.length === 0 && (
                <p className="mt-4">No hay médicos disponibles.</p>
              )}

              {medicos && (
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={ocupado || paginaMedicos <= 1}
                    onClick={() => setPaginaMedicos((valor) => valor - 1)}
                    className={boton}
                  >
                    Anterior
                  </button>
                  <span>{medicos.current_page} / {medicos.last_page}</span>
                  <button
                    type="button"
                    disabled={ocupado || paginaMedicos >= medicos.last_page}
                    onClick={() => setPaginaMedicos((valor) => valor + 1)}
                    className={boton}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {medico && (
          <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">
              2. Reserva con {medico.nombre}
            </h2>

            <form onSubmit={reservar} className="mt-5">
              <fieldset disabled={ocupado} className="space-y-4">
                <label className="block">
                  Fecha
                  <input
                    type="date"
                    required
                    value={fecha}
                    onChange={(evento) => {
                      setFecha(evento.target.value);
                      setHorarioId("");
                      setHorarios([]);
                    }}
                    className={input}
                  />
                </label>

                {cargandoHorarios && <p>Buscando horarios…</p>}

                {errorHorarios && (
                  <p role="alert" className="text-red-700">{errorHorarios}</p>
                )}

                {fecha && !cargandoHorarios && !errorHorarios &&
                  horarios.length === 0 && (
                    <p>No hay horarios disponibles para esta fecha.</p>
                  )}

                <label className="block">
                  Horario
                  <select
                    required
                    value={horarioId}
                    onChange={(evento) => setHorarioId(evento.target.value)}
                    className={input}
                  >
                    <option value="">Selecciona un horario</option>
                    {horarios.map((horario) => (
                      <option key={horario.id} value={horario.id}>
                        {horario.inicia_en.slice(11, 16)} a{" "}
                        {horario.termina_en.slice(11, 16)}
                        {horario.inicia_en.slice(0, 10) !==
                          horario.termina_en.slice(0, 10) && " (día siguiente)"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  Motivo de la consulta
                  <textarea
                    required
                    maxLength={1000}
                    value={motivo}
                    onChange={(evento) => setMotivo(evento.target.value)}
                    className={input}
                  />
                </label>

                <p className="text-sm text-slate-600">
                  La solicitud quedará pendiente de confirmación del médico.
                  Reservar no realiza un cobro.
                </p>

                <button
                  type="submit"
                  disabled={ocupado || cargandoHorarios || !horarioId}
                  className="rounded-lg bg-teal-700 px-4 py-3 text-white disabled:opacity-40"
                >
                  {ocupado ? "Procesando…" : "Reservar cita"}
                </button>
              </fieldset>
            </form>
          </section>
        )}

        <section className="mt-8 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Mis citas</h2>

          {cancelando && (
            <form onSubmit={cancelarCita} className="mt-5 rounded-lg bg-amber-50 p-4">
              <h3 className="font-semibold">
                Cancelar cita con {cancelando.medico}
              </h3>
              <label className="mt-3 block">
                Motivo de cancelación
                <textarea
                  required
                  maxLength={1000}
                  disabled={ocupado}
                  value={motivoCancelacion}
                  onChange={(evento) => setMotivoCancelacion(evento.target.value)}
                  className={input}
                />
              </label>
              <div className="mt-3 flex gap-3">
                <button type="submit" disabled={ocupado} className={boton}>
                  Confirmar cancelación
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => setCancelando(null)}
                  className={boton}
                >
                  Volver
                </button>
              </div>
            </form>
          )}

          {cargandoCitas ? (
            <p className="mt-4">Cargando citas…</p>
          ) : errorCitas ? (
            <p role="alert" className="mt-4 text-red-700">{errorCitas}</p>
          ) : (
            <>
              <div className="mt-5 space-y-4">
                {citas?.data.map((cita) => (
                  <article key={cita.id} className="rounded-lg border p-4">
                    <h3 className="font-semibold">{cita.medico}</h3>
                    <p>{cita.inicia_en.slice(0, 16)}</p>
                    <p className="mt-1 capitalize">
                      Estado: {cita.estado.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm">
                      Motivo: {cita.motivo}
                    </p>
                    <p className="mt-1 text-sm">
                      Tarifa reservada: {cita.precio} {cita.moneda}
                    </p>
                    {cita.motivo_cancelacion && (
                      <p className="mt-2 text-sm text-red-700">
                        Cancelación: {cita.motivo_cancelacion}
                      </p>
                    )}
                    {cita.puede_cancelar && (
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => {
                          setCancelando(cita);
                          setMotivoCancelacion("");
                          setErrores([]);
                          setExito("");
                        }}
                        className={`${boton} mt-3`}
                      >
                        Cancelar cita
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {citas?.data.length === 0 && (
                <p className="mt-4">Todavía no tienes citas.</p>
              )}

              {citas && (
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={ocupado || paginaCitas <= 1}
                    onClick={() => setPaginaCitas((valor) => valor - 1)}
                    className={boton}
                  >
                    Anterior
                  </button>
                  <span>{citas.current_page} / {citas.last_page}</span>
                  <button
                    type="button"
                    disabled={ocupado || paginaCitas >= citas.last_page}
                    onClick={() => setPaginaCitas((valor) => valor + 1)}
                    className={boton}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

