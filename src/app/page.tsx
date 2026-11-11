import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser, homeFor } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function Home() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/login");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  redirect(homeFor(user.role));
}
