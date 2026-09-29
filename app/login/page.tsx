import { Suspense } from "react";
import AuthForm from "@/components/auth/AuthForm";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return <Suspense><AuthForm mode="login" /></Suspense>;
}
