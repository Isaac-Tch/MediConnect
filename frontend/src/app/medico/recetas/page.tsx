import DescargarRecetas from "@/components/DescargarRecetas";
import RecetasPanel from "@/components/RecetasPanel";

export default function RecetasMedico() {
  return (
    <>
      <DescargarRecetas modo="medico" />
      <RecetasPanel modo="medico" />
    </>
  );
}
