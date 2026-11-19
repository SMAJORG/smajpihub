import { useId, type CSSProperties } from "react";
import "./UserAvatarFrame.css";

export type AvatarFrameId = "ambassador" | "open_to_work" | "seller" | "hiring";
const frameLabels: Record<AvatarFrameId, string> = {
  ambassador: "AMBASSADOR",
  open_to_work: "OPEN TO WORK",
  seller: "SELLER",
  hiring: "HIRING",
};

type UserAvatarFrameProps = {
  name: string;
  image?: string;
  frame?: AvatarFrameId | null;
  size?: number;
  className?: string;
};

export default function UserAvatarFrame({ name, image, frame, size = 72, className = "" }: UserAvatarFrameProps) {
  const pathId = `user-avatar-frame-${useId().replaceAll(":", "")}`;
  return (
    <span
      className={`user-avatar-frame${frame ? " has-frame" : ""}${className ? ` ${className}` : ""}`}
      data-frame={frame || undefined}
      style={{ "--user-avatar-size": `${size}px` } as CSSProperties}
      aria-label={frame ? `${name}, ${frameLabels[frame]} frame` : name}
      role="img"
    >
      <span className="user-avatar-frame__picture">
        {image ? <img src={image} alt="" /> : <span>{name.slice(0, 1).toUpperCase() || "?"}</span>}
      </span>
      {frame ? (
        <svg className="user-avatar-frame__label" viewBox="0 0 100 100" aria-hidden="true">
          <defs><path id={pathId} d="M 19 81 A 44 44 0 0 0 81 81" /></defs>
          <text><textPath href={`#${pathId}`} startOffset="50%">{frameLabels[frame]}</textPath></text>
        </svg>
      ) : null}
    </span>
  );
}
