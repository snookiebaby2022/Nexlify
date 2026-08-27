import dynamic from "next/dynamic";

const MultiviewGrid = dynamic(() => import("./multiview-grid"), { ssr: false });

export default function MultiviewPage() {
  return <MultiviewGrid />;
}
