import type { ReactNode } from "react";
import PanelProtegido from "@/components/PanelProtegido";

export default function LayoutAdministrador({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <PanelProtegido rol="administrador">
      {children}
    </PanelProtegido>
  );
}
