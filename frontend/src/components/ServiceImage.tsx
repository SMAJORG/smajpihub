import type { ImgHTMLAttributes } from "react";
import { useSiteContent } from "../lib/siteContent";
export default function ServiceImage({ slug, src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { slug: string }) {
  const { services } = useSiteContent();
  return <img {...props} src={services.find(service => service.slug === slug)?.icon || src} />;
}
