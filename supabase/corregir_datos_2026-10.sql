-- Corrige estado, años, autores y títulos según el registro de cada revista. Correr en Supabase → SQL Editor.
begin;
update public.articles set status = 'Publicado' where id = 'pub-2025-9';
update public.articles set year = 2023, date = 'Diciembre de 2023' where id = 'pub-2024-5';
update public.articles set year = 2025, date = '2025', authors = 'Guerschberg, Gutierrez' where id = 'pub-2024-8';
update public.articles set year = 2025, date = '2025' where id = 'pub-2024-9';
update public.articles set year = 2025, date = '2025' where id = 'pub-2024-10';
update public.articles set year = 2025, date = '2025' where id = 'pub-2024-11';
update public.articles set authors = 'Guerschberg, Freijo Becchero' where id = 'pub-2024-7';
update public.articles set title = 'The labour market under threat from AI and the rise of right-wing politics' where id = 'pub-2025-12';
update public.articles set title = 'El destino pedagógico de la inteligencia artificial: la «paradoja del Preguntados»' where id = 'pub-2025-1';
update public.articles set title = 'El personal Nodocente en la Universidad de Buenos Aires: aportes a la gestión universitaria y a la calidad educativa desde una revisión integrativa de la literatura' where id = 'pub-2026-4';
commit;
