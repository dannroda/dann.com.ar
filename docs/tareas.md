# Tareas — dann.com.ar

> Export de `compass/`, que es la fuente de verdad. No editar: los cambios se hacen en `compass/` o con `scompass`, y este archivo se regenera.
> Generado: 2026-10-21

## M0 — Base del sitio  (5/5)

Sitio bilingüe en Astro con los juegos sincronizados desde las tiendas, publicado en GitHub Pages.

**Hecho cuando:**
- El sitio responde en dannroda.github.io/dann.com.ar en es y en.
- El workflow sincroniza a diario y vuelve a publicar.

### 0.1 Diseño: home, ficha y links móvil · Hecho

**Terminada:** 2026-10-21 · **Etiquetas:** `diseño`

Canvas con las tres pantallas y el sistema de etiquetas de IA (hecho a mano / asistido / vibe-coded).

### 0.2 Sync de tiendas: Steam, itch.io y Ludum Dare · Hecho

**Terminada:** 2026-10-21 · **Etiquetas:** `datos`

scripts/sync-games.mjs: datos de tienda a content/store/ e imágenes a public/games/. Lista de juegos en content/sources.json.

### 0.3 Sitio Astro bilingüe · Hecho

**Terminada:** 2026-10-21 · **Etiquetas:** `web`

Home, fichas de juego y links en /es/ y /en/, con redirección por idioma del navegador.

### 0.4 Deploy a GitHub Pages con sync diario · Hecho

**Terminada:** 2026-10-21 · **Etiquetas:** `infra`

.github/workflows/deploy.yml: sync, commit de cambios, build y deploy; cron diario.

### 0.5 Alinear columnas de las filas de jams · Hecho

**Terminada:** 2026-10-21 · **Etiquetas:** `web`, `bug`

## M1 — CMS y etiquetas de IA  (6/6, 1 en revisión)

Editar los datos propios de cada juego desde /admin y mostrar cómo se usó la IA en cada uno.

**Hecho cuando:**
- Cada juego tiene etiqueta de IA visible en la home y en su ficha.
- Los datos propios se editan desde /admin sin tocar archivos a mano.

### 1.1 Modelo de datos propios por juego · Hecho

**Terminada:** 2026-10-21 · **Prioridad:** alta · **Tamaño:** M · **Etiquetas:** `datos`

Archivo por juego en content/games/ con etiqueta de IA, desglose "Quién hizo qué", rol, texto es/en, destacado y oculto. La sync nunca lo toca.

**Prueba:** npm run sync crea los faltantes; editar uno y volver a sincronizar no lo cambia.

**Notas:** content/games/<slug>.json; la sync lo crea si falta (flag wx) y nunca lo pisa. Esquema en src/content.config.ts.

**Bloquea a:** 1.2 Sveltia CMS en /admin; 1.4 Etiquetas de IA en tarjetas y filas; 1.5 Tabla "Quién hizo qué" en la ficha

### 1.2 Sveltia CMS en /admin · Revisión

**Prioridad:** alta · **Tamaño:** L · **Etiquetas:** `cms`

Editar los datos propios (y luego posts) desde el navegador; cada cambio es un commit.

**Prueba:** Abrir /admin/, entrar (token o repo local), editar un juego y un post, ver el commit y el cambio publicado.

**Notas:** public/admin/index.html + config.yml (validado contra el JSON Schema de Sveltia; la pantalla de login carga sin errores en Chromium headless). Colecciones: blog (i18n multiple_folders), juegos (content/games, sin crear/borrar), links (content/profile.json).

**Bloqueada por:** 1.1 Modelo de datos propios por juego; 1.3 Login al CMS (token de GitHub)

### 1.3 Login al CMS (token de GitHub) · Hecho

**Terminada:** 2026-10-21 · **Tamaño:** M · **Etiquetas:** `cms`, `infra`

Sveltia necesita un servicio de OAuth para entrar desde el navegador; el worker de Sveltia es gratis.

**Decisiones:**
- ! Entrar al CMS con token personal de GitHub en lugar del Worker de Cloudflare · sin revisar
  Por qué: Un solo editor técnico: el token evita desplegar un Worker y crear una OAuth app. Sveltia lo soporta con 'Sign In with Token'.
  Descartado: Sveltia CMS Authenticator en Cloudflare Workers + OAuth app (sigue disponible si se suma otro editor).

**Notas:** Crear un fine-grained token en GitHub con Contents read/write solo sobre dannroda/dann.com.ar.

**Bloquea a:** 1.2 Sveltia CMS en /admin

### 1.4 Etiquetas de IA en tarjetas y filas · Hecho

**Terminada:** 2026-10-21 · **Prioridad:** alta · **Tamaño:** S · **Etiquetas:** `web`

**Prueba:** Home: la etiqueta aparece en la tarjeta y en las filas cuando el juego tiene 'ai'.

**Bloqueada por:** 1.1 Modelo de datos propios por juego

### 1.5 Tabla "Quién hizo qué" en la ficha · Hecho

**Terminada:** 2026-10-21 · **Tamaño:** M · **Etiquetas:** `web`

**Prueba:** Ficha: con 'authorship' cargado aparece la tabla; sin datos no se muestra.

**Bloqueada por:** 1.1 Modelo de datos propios por juego

### 1.6 Sugerir etiqueta inicial desde el AI Disclosure de itch · Hecho

**Terminada:** 2026-10-21 · **Prioridad:** baja · **Tamaño:** S · **Etiquetas:** `datos`

Solo como valor inicial; lo que cargues en el CMS manda.

**Notas:** suggestAi() en scripts/sync-games.mjs: 'No generative AI' -> hand; cualquier AI Disclosure -> assisted; si no, vacío. Solo al crear el archivo.

## M2 — Blog  (4/5)

Posts en Markdown por idioma, con listado, tags y RSS.

**Hecho cuando:**
- Hay al menos un post publicado en cada idioma.
- El RSS valida.

### 2.1 Colección de posts por idioma · Hecho

**Terminada:** 2026-10-21 · **Tamaño:** M · **Etiquetas:** `blog`

**Notas:** content/blog/<lang>/<slug>.md, colección blog en src/content.config.ts. Borradores solo en dev.

### 2.2 Listado y página de post · Hecho

**Terminada:** 2026-10-21 · **Tamaño:** M · **Etiquetas:** `blog`

### 2.3 RSS por idioma · Hecho

**Terminada:** 2026-10-21 · **Tamaño:** S · **Etiquetas:** `blog`

**Prueba:** dist/<lang>/rss.xml se genera con items y language; borradores excluidos.

### 2.4 Tags del blog · Hecho

**Terminada:** 2026-10-21 · **Prioridad:** baja · **Tamaño:** S · **Etiquetas:** `blog`

### 2.5 Escribir el primer post (es y en) · Pendiente

**Tamaño:** S · **Etiquetas:** `blog`, `contenido`

M2 pide al menos un post publicado por idioma. Borrar el borrador de prueba content/blog/*/prueba.md.

## M3 — Proyectos y Lab  (0/2)

Mostrar proyectos que no son juegos y separar los vibe-coded en el Lab.

**Hecho cuando:**
- La home tiene secciones Proyectos y Lab con datos reales.

### 3.1 Proyectos que no son juegos, con repos de GitHub como fuente · Pendiente

**Tamaño:** L · **Etiquetas:** `datos`, `web`

### 3.2 Sección Lab para lo vibe-coded · Pendiente

**Tamaño:** M · **Etiquetas:** `web`

## M4 — Pulido  (0/5)

Detalles que mejoran la lectura y el compartir.

**Hecho cuando:**
- Las fichas muestran tráiler, puesto sobre total y textos traducidos.
- Compartir un link muestra imagen y título.

### 4.1 Puesto de Ludum Dare sobre total de entradas · Pendiente

**Tamaño:** S · **Etiquetas:** `datos`

### 4.2 Traducir las filas de itch (Made with, etc.) · Pendiente

**Tamaño:** S · **Etiquetas:** `web`, `i18n`

### 4.3 Tráiler de Steam en la ficha · Pendiente

**Tamaño:** S · **Etiquetas:** `web`

### 4.4 Imagen y metadatos Open Graph · Pendiente

**Tamaño:** S · **Etiquetas:** `web`

### 4.5 Página 404 · Pendiente

**Prioridad:** baja · **Tamaño:** S · **Etiquetas:** `web`

## M5 — Dominio propio  (0/2)

El sitio en un dominio propio en lugar de github.io.

**Hecho cuando:**
- El sitio responde en el dominio propio con HTTPS.

### 5.1 Elegir y comprar dominio · Pendiente

**Tamaño:** S · **Etiquetas:** `infra`

Candidatos libres: dannroda.com, dannroda.dev, dann.games, dannroda.games; dann.gd fuera de Hostinger.

### 5.2 CNAME y DNS hacia GitHub Pages · Pendiente

**Tamaño:** S · **Etiquetas:** `infra`
