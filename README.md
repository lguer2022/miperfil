# miperfil

Sitio de perfil profesional de Leandro Guerschberg (UNPAZ): libros, publicaciones y proyectos,
con un **Dashboard** protegido para administrarlos.

## Arquitectura

- **Frontend estático**: `index.html`, `style.css`, `app.js` (sin compilación). Se publica en Netlify.
- **Datos, login e imágenes**: [Supabase](https://supabase.com) (proyecto `miperfilBD`).
  - Tablas `articles`, `projects`, `books`, `site_settings`.
  - Seguridad por Row Level Security: los visitantes solo leen lo visible; solo el email admin
    (definido en `config.js` y en `supabase/setup.sql`) puede crear, editar, ocultar, reordenar y borrar.
  - Bucket `media` para la foto de perfil y las portadas.
- **Respaldo**: si Supabase no responde, la página muestra la copia de `data/*.json` (solo lectura).

## Puesta en marcha (una sola vez)

1. **Crear tablas y cargar datos**: Supabase → *SQL Editor* → *New query* → pegar todo
   `supabase/setup.sql` → *Run*.
   ⚠️ Volver a ejecutarlo **reemplaza** los datos de la base por los de `data/*.json`.
2. **Crear el admin**: *Authentication → Users → Add user → Create new user*, con el email de
   `config.js`, una contraseña segura y *Auto Confirm User* tildado.
3. **Cerrar registros nuevos**: *Authentication → Sign In / Providers* → desactivar
   *Allow new users to sign up*.
4. **Publicar**: en Netlify, *Add new site → Import from GitHub* → este repo. No requiere build
   (ver `netlify.toml`).

## Desarrollo local

```bash
npm install
npm start   # http://localhost:3000
```

Para regenerar `supabase/setup.sql` desde los JSON: `python3 supabase/build_sql.py`.
