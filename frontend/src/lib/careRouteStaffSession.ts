import { careRouteService } from "./careRouteService";
import type { CareRouteStaff } from "../types/careroute";

const VERIFICATION_KEY = "smaj_careroute_verified_staff";
export const STAFF_CHANGED = "careroute_staff_changed";

// A frontend display guard, not a substitute for authorization at API endpoints.
// Old automatically fabricated Pi/demo sessions must sign in at the staff endpoint.
export function getHospitalStaff(): CareRouteStaff | null {
  try {
    const staff = careRouteService.getCurrentStaff();
    const verified = JSON.parse(sessionStorage.getItem(VERIFICATION_KEY) || "null");
    return staff?.id && staff.hospitalId && verified?.id === staff.id && verified?.hospitalId === staff.hospitalId
      ? staff
      : null;
  } catch {
    return null;
  }
}
export function setHospitalStaff(staff: CareRouteStaff | null) {
  careRouteService.setCurrentStaff(staff);
  if (staff) sessionStorage.setItem(VERIFICATION_KEY, JSON.stringify({ id: staff.id, hospitalId: staff.hospitalId }));
  else sessionStorage.removeItem(VERIFICATION_KEY);
  window.dispatchEvent(new Event(STAFF_CHANGED));
}
