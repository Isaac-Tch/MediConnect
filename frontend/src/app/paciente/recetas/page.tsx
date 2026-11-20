import DescargarRecetas from "@/components/DescargarRecetas";
import RecetasPanel from "@/components/RecetasPanel";

export default function RecetasPaciente() {
  return (
    <>
      <DescargarRecetas modo="paciente" />
      <RecetasPanel modo="paciente" />
    </>
  );
}
