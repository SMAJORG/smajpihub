import { useEffect, useRef } from "react";

type Props = {
  vtt: string;
  onLoad: () => void;
};

export default function CommunityCaptionTrack({ vtt, onLoad }: Props) {
  const trackRef = useRef<HTMLTrackElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
    track.src = url;
    return () => {
      track.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [vtt]);

  return <track ref={trackRef} kind="captions" srcLang="en" label="English" onLoad={onLoad} />;
}
