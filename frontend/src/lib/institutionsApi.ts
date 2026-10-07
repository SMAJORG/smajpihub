import { axiosClient } from "./axiosClient";
import type {
  Institution,
  InstitutionApplication,
  InstitutionProfileResponse,
  InstitutionPortalResponse,
  InstitutionRecord,
} from "../types/institutions";
export const institutionApi = {
  directory: async (params: URLSearchParams) =>
    (
      await axiosClient.get<{ institutions: Institution[]; total: number; page: number; totalPages: number }>(
        "/education/institutions",
        { params }
      )
    ).data,
  profile: async (id: string) =>
    (await axiosClient.get<InstitutionProfileResponse>("/education/institutions/" + id)).data,
  applications: async () =>
    (await axiosClient.get<{ applications: InstitutionApplication[] }>("/education/institution-applications/mine"))
      .data,
  portalList: async () =>
    (await axiosClient.get<{ institutions: Institution[] }>("/education/institution-portal")).data,
  portal: async (id: string) =>
    (await axiosClient.get<InstitutionPortalResponse>("/education/institution-portal/" + id)).data,
  admin: async () =>
    (
      await axiosClient.get<{ institutions: Institution[]; applications: InstitutionApplication[] }>(
        "/education/admin/institutions"
      )
    ).data,
  learning: async () =>
    (
      await axiosClient.get<{ enrollments: InstitutionRecord[]; applications: InstitutionRecord[] }>(
        "/education/institution-learning"
      )
    ).data,
  post: async (path: string, body: unknown) => (await axiosClient.post("/education/" + path, body)).data,
  patch: async (path: string, body: unknown) => (await axiosClient.patch("/education/" + path, body)).data,
};
