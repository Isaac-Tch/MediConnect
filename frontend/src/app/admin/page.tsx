import Link from "next/link";

const secciones = [
  {
    titulo: "Personal médico",
    descripcion: "Crea y administra perfiles y cuentas del personal médico.",
    ruta: "/admin/medicos",
    boton: "Gestionar médicos",
  },
  {
    titulo: "Especialidades",
    descripcion: "Administra las especialidades disponibles en la plataforma.",
    ruta: "/admin/especialidades",
    boton: "Gestionar especialidades",
  },
  {
    titulo: "Reportes",
    descripcion: "Solicita estadísticas, revisa su estado y descarga los resultados.",
    ruta: "/admin/reportes",
    boton: "Gestionar reportes",
  },
];

export default function PanelAdministrador() {
  return (
    <main className="min-h-screen bg-slate-100 px-6 py-12 text-slate-900">
      <section className="mx-auto max-w-5xl">
        <p className="font-semibold text-teal-700">MediConnect</p>
        <h1 className="mt-2 text-3xl font-bold">Panel del administrador</h1>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {secciones.map((seccion) => (
            <article key={seccion.ruta} className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold">{seccion.titulo}</h2>
              <p className="mt-2 text-slate-600">{seccion.descripcion}</p>
              <Link
                href={seccion.ruta}
                className="mt-5 inline-block rounded-lg bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
              >
                {seccion.boton}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

