import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. Tạo file .env ở gốc dự án (xem .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
