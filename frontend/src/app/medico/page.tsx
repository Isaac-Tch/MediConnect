import Link from "next/link";

export default function PanelMedico() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12 text-slate-900">
      <section className="mx-auto max-w-5xl">
        <p className="font-semibold text-teal-700">MediConnect</p>

        <h1 className="mt-2 text-3xl font-bold">Panel del médico</h1>

        <p className="mt-3 text-slate-600">
          Administra tus horarios de atención y consulta tus citas asignadas.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <article className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Mi agenda</h2>
            <p className="mt-2 text-slate-600">
              Consulta tus horarios y citas por fecha.
            </p>
            <Link
              href="/medico/agenda"
              className="mt-5 inline-block rounded-lg bg-teal-700 px-4 py-2 text-white"
            >
              Abrir agenda
            </Link>
          </article>

          <article className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Mis horarios</h2>
            <p className="mt-2 text-slate-600">
              Crea y administra espacios de atención de 30 minutos.
            </p>
            <Link
              href="/medico/agenda#formulario-horario"
              className="mt-5 inline-block rounded-lg bg-teal-700 px-4 py-2 text-white"
            >
              Gestionar horarios
            </Link>
          </article>

          <article className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Mis citas</h2>
            <p className="mt-2 text-slate-600">
              Confirma citas y registra su resultado.
            </p>
            <Link
              href="/medico/agenda#citas"
              className="mt-5 inline-block rounded-lg bg-teal-700 px-4 py-2 text-white"
            >
              Consultar citas
            </Link>
          </article>
        </div>
      </section>
    </main>
  );
}

