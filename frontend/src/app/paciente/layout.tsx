import type { ReactNode } from "react";
import PanelProtegido from "@/components/PanelProtegido";

export default function LayoutPaciente({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PanelProtegido rol="paciente">
      {children}
    </PanelProtegido>
  );
}
