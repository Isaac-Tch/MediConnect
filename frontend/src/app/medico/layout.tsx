import type { ReactNode } from "react";
import PanelProtegido from "@/components/PanelProtegido";

export default function LayoutMedico({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PanelProtegido rol="medico">
      {children}
    </PanelProtegido>
  );
}
