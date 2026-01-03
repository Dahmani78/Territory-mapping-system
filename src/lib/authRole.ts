import { supabase } from "@/lib/supabaseClient";

export async function isAdmin(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (error) return false;
  return data?.role === "admin";
}
