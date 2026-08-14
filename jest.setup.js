// Dummy vrednosti da bilo koji transitivno uvezen modul (npr. lib/supabase) može da se
// učita bez greške. Klijent se NIKAD ne poziva u testovima čistih funkcija — ovo nije
// mock Supabase-a, samo konfiguracija da konstrukcija ne padne.
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://localhost";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
