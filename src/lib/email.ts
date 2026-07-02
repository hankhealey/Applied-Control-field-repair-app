import { Resend } from "resend";

export function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "healeyhank@gmail.com";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
