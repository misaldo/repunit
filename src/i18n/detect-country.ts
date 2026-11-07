import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// Hosting providers derive these country headers from the visitor's request IP.
// Never trust a country supplied by browser JavaScript.
export const detectRequestCountry = createServerFn({ method: "GET" }).handler(() => {
  const candidates = [
    getRequestHeader("cf-ipcountry"),
    getRequestHeader("x-vercel-ip-country"),
    getRequestHeader("x-country-code"),
    getRequestHeader("cloudfront-viewer-country"),
    getRequestHeader("x-nf-country"),
  ];
  const country = candidates.find((value) => value && /^[a-z]{2}$/i.test(value));
  return country?.toUpperCase() ?? null;
});
