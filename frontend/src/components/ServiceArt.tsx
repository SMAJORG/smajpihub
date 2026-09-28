import type { CSSProperties } from "react";

const standaloneServiceArt: Record<number, string> = {
  0: "/assets/services/store.png",
  2: "/assets/services/jobs.png",
  3: "/assets/services/education.png",
  4: "/assets/services/health.png",
  5: "/assets/services/transport.png",
};

const ServiceArt = ({ index, className = "" }: { index: number; className?: string }) => {
  const standaloneAsset = standaloneServiceArt[index];
  const column = index % 5;
  const row = Math.floor(index / 5);
  const style = standaloneAsset
    ? {
        backgroundColor: "transparent",
        backgroundImage: `url('${standaloneAsset}')`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "contain",
      }
    : { backgroundPosition: `${column * 25}% ${row * 50}%` };

  return <span className={`service-art ${className}`} style={style as CSSProperties} aria-hidden="true" />;
};

export default ServiceArt;
