"""Genera supabase/setup.sql (esquema + seguridad + datos) a partir de data/*.json.

Uso:  python3 supabase/build_sql.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ADMIN_EMAIL = "leandroguerschberg@gmail.com"


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, list):
        return "array[" + ", ".join(lit(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"


def inserts(table, cols, rows):
    out = []
    for pos, r in enumerate(rows):
        vals = [lit(r.get(src) if not callable(src) else src(r)) for _, src in cols]
        vals.append(str(pos))
        names = ", ".join(c for c, _ in cols) + ", position"
        out.append(f"insert into public.{table} ({names}) values ({', '.join(vals)});")
    return "\n".join(out)


articles = json.loads((ROOT / "data/articles.json").read_text())
projects = json.loads((ROOT / "data/projects.json").read_text())
books = json.loads((ROOT / "data/books.json").read_text())

vis = lambda r: r.get("visible") is not False

SCHEMA = f"""-- =====================================================================
-- miperfil · Supabase setup (tablas, seguridad y datos iniciales)
-- Pegar completo en Supabase → SQL Editor → New query → Run.
-- Se puede volver a ejecutar: borra y recrea las tablas con los datos del repo.
-- =====================================================================

-- ---------- Quién es admin ----------
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = '{ADMIN_EMAIL}'
$$;

-- ---------- Tablas ----------
drop table if exists public.articles cascade;
drop table if exists public.projects cascade;
drop table if exists public.books cascade;
drop table if exists public.site_settings cascade;

create table public.articles (
  id          text primary key default 'pub-' || floor(extract(epoch from now())*1000)::bigint,
  year        int  not null,
  title       text not null,
  authors     text default 'Guerschberg',
  venue       text not null,
  type        text default 'Artículo',
  date        text,
  status      text default 'Publicado',
  link        text,
  citation    text,
  tags        text[] default '{{}}',
  visible     boolean not null default true,
  position    int not null default 0,
  updated_at  timestamptz not null default now()
);

create table public.projects (
  id             text primary key default 'proj-' || floor(extract(epoch from now())*1000)::bigint,
  title          text not null,
  slug           text,
  category       text not null default 'programacion',
  category_label text,
  url            text,
  description    text,
  tags           text[] default '{{}}',
  badge          text,
  icon           text,
  status         text,
  thumb          text,
  visible        boolean not null default true,
  position       int not null default 0,
  updated_at     timestamptz not null default now()
);

create table public.books (
  id          text primary key default 'book-' || floor(extract(epoch from now())*1000)::bigint,
  type        text not null default 'Libro',
  title       text not null,
  authors     text,
  editor      text,
  date        text,
  year        int,
  pages       text,
  isbn        text,
  status      text default 'Publicado',
  link        text,
  description text,
  citation    text,
  cover       text,
  visible     boolean not null default true,
  position    int not null default 0,
  updated_at  timestamptz not null default now()
);

create table public.site_settings (
  key   text primary key,
  value text,
  visible boolean not null default true,
  position int not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Seguridad (Row Level Security) ----------
-- Visitantes: solo leen lo visible. Admin: lee y modifica todo.
do $$
declare t text;
begin
  foreach t in array array['articles','projects','books','site_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "publico lee visibles" on public.%I for select using (visible or public.is_admin())', t);
    execute format('create policy "admin inserta" on public.%I for insert with check (public.is_admin())', t);
    execute format('create policy "admin edita" on public.%I for update using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin borra" on public.%I for delete using (public.is_admin())', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Almacenamiento de imágenes (foto y portadas) ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media lectura publica" on storage.objects;
drop policy if exists "media admin sube" on storage.objects;
drop policy if exists "media admin reemplaza" on storage.objects;
drop policy if exists "media admin borra" on storage.objects;
create policy "media lectura publica" on storage.objects for select using (bucket_id = 'media');
create policy "media admin sube" on storage.objects for insert with check (bucket_id = 'media' and public.is_admin());
create policy "media admin reemplaza" on storage.objects for update using (bucket_id = 'media' and public.is_admin());
create policy "media admin borra" on storage.objects for delete using (bucket_id = 'media' and public.is_admin());

-- ---------- Datos iniciales ----------
"""

sql = SCHEMA
sql += "-- Publicaciones (" + str(len(articles)) + ")\n" + inserts("articles", [
    ("id", "id"), ("year", "year"), ("title", "title"), ("authors", "authors"),
    ("venue", "venue"), ("type", "type"), ("date", "date"), ("status", "status"),
    ("link", "link"), ("citation", "citation"), ("tags", "tags"), ("visible", vis),
], articles) + "\n\n"
sql += "-- Proyectos (" + str(len(projects)) + ")\n" + inserts("projects", [
    ("id", "id"), ("title", "title"), ("slug", "slug"), ("category", "category"),
    ("category_label", "categoryLabel"), ("url", "url"), ("description", "desc"),
    ("tags", "tags"), ("badge", "badge"), ("icon", "icon"), ("status", "status"),
    ("thumb", "thumb"), ("visible", vis),
], projects) + "\n\n"
sql += "-- Libros y capítulos (" + str(len(books)) + ")\n" + inserts("books", [
    ("id", "id"), ("type", "type"), ("title", "title"), ("authors", "authors"),
    ("editor", "editor"), ("date", "date"), ("year", "year"), ("pages", "pages"),
    ("isbn", "isbn"), ("status", "status"), ("link", "link"), ("description", "desc"),
    ("citation", "citation"), ("cover", "cover"), ("visible", vis),
], books) + "\n"

(ROOT / "supabase/setup.sql").write_text(sql)
print(f"OK: {len(articles)} publicaciones, {len(projects)} proyectos, {len(books)} libros")
