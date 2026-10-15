// Configuración pública de Supabase.
// La "anon key" es pública por diseño: la seguridad la aplican las reglas (RLS)
// definidas en supabase/setup.sql. NUNCA poner acá la service_role / secret key.
window.SUPABASE_URL = 'https://nzkypkwghhzkxopaotrd.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56a3lwa3dnaGh6a3hvcGFvdHJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjUxMzYsImV4cCI6MjEwNzY0MTEzNn0.L6RrcLQSvSGP5fcOJ6LslLI9wqIah572r2trGiB7JVs';

// Email del administrador (debe coincidir con el de supabase/setup.sql)
window.ADMIN_EMAIL = 'leandroguerschberg@gmail.com';
