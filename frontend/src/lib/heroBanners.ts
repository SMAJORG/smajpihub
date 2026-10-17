import { axiosClient } from "./axiosClient";

export type HeroBanner = {
  _id: string;
  sourceKey?: string;
  placement: "dashboard" | "store";
  image: string;
  title: string;
  subtitle: string;
  search: string;
  textColor: string;
  active: boolean;
  order: number;
};

export const getHeroBannerState = async (placement: HeroBanner["placement"]) => {
  const { data } = await axiosClient.get<{ banners: HeroBanner[]; managed?: boolean }>("/hero-banners", { params: { placement } });
  return { banners: data.banners, managed: data.managed ?? data.banners.length > 0 };
};
