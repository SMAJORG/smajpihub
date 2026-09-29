export const isSoloHostRuntime = () =>
  typeof window !== "undefined" && window.__ENV?.soloHost === "true";

export const isPiPaymentAvailable = () =>
  !isSoloHostRuntime() &&
  typeof window !== "undefined" &&
  typeof window.Pi?.authenticate === "function" &&
  typeof window.Pi?.createPayment === "function";
