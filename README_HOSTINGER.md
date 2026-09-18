# RifadosCUU — Guía para publicar en Hostinger

## Panel para organizar rifas

Ahora hay un panel privado en **`admin.html`**. Desde ahí las personas autorizadas podrán crear rifas, asignar precio por boleto, total de boletos, fecha, imagen, descripción y estado (borrador, publicada o pausada).

Para activarlo de forma segura:

1. Crea un proyecto en Supabase y abre su **SQL Editor**.
2. Ejecuta el archivo `supabase/setup.sql` completo.
3. En **Authentication → Users**, crea la cuenta de quien administrará las rifas. Copia su UUID y ejecútalo en el último `insert` indicado por el SQL.
4. Crea un bucket **público** llamado `raffle-images` en **Storage**. Úsalo sólo para imágenes de premios, nunca para comprobantes o documentos personales.
5. Copia la URL del proyecto y la **Publishable key** (nunca `service_role`) a `supabase-config.js`.
6. Sube `index.html`, `admin.html`, `admin.css`, `admin.js`, `raffles-public.js`, `supabase-config.js` y tus archivos existentes al mismo directorio de Hostinger. **No subas la carpeta `supabase/`**: `setup.sql` es sólo para configurarla desde el panel de Supabase. Entra a `tudominio.com/admin.html`.

El login no se habilita hasta configurar Supabase. No publiques `setup.sql` ni datos bancarios en la página pública. La etapa de cobro y reserva automática sigue pendiente: sólo debe activarse cuando haya una pasarela de pago y validación del comprobante en un backend.

## 1. Qué archivo subir

Con esta versión basta con **un solo archivo: `index.html`**. Tu logo (en el menú, la portada, el pie de página) y el ícono de la pestaña del navegador ya están incrustados dentro del propio archivo, así que se ven aunque subas nada más ese archivo, lo abras localmente en tu computadora, o lo mandes por WhatsApp o correo — no dependen de ninguna carpeta aparte.

La carpeta `assets/` que se generó por separado ya no es necesaria para que el logo se vea; la puedes conservar como respaldo o para cuando agregues fotos reales de tus premios (ver sección 6).

## 2. Cómo subirlo a Hostinger

1. Entra a **hPanel** (el panel de Hostinger).
2. Ve a **Sitios web → Administrar** (o "Websites → Manage") del dominio donde quieres publicar la rifa.
3. Abre el **Administrador de archivos** ("File Manager").
4. Entra a la carpeta **`public_html`** (ahí va todo lo que se ve en tu dominio).
5. Si ya hay un `index.html` de ejemplo de Hostinger, bórralo o renómbralo.
6. Sube tu archivo `index.html` (botón "Subir" / "Upload") dentro de `public_html`.
7. Abre tu dominio en el navegador — ya debería verse la página en vivo, con tu logo y catálogo incluidos.

También puedes subirlo por **FTP** (con FileZilla, por ejemplo) usando los datos de conexión que te da Hostinger en hPanel → "Archivos → FTP".

> Nota técnica: como el logo va incrustado en base64 dentro del HTML, el archivo pesa más de lo normal (~360 KB en vez de unos 60 KB). Es completamente normal y no afecta que la página funcione bien; sigue cargando rápido.

## 2.1. Qué trae esta versión

> Estado de publicación: actualmente sólo se muestra la rifa de Nintendo Switch 2. Las otras cinco tarjetas permanecen como plantillas ocultas en el HTML y no se muestran a participantes hasta que les quites el atributo `data-demo="true"` y sustituyas toda su información por datos reales.

- Tu **logo con fondo transparente** (la versión que me pasaste), sin el cuadro negro de antes — se ve "flotando" en el menú, la portada y el pie de página, con una sombra sutil para que resalte tanto en fondo blanco como en fondo negro.
- Tema visual de **contraste negro, blanco y dorado**: el menú y ciertas secciones (Catálogo, Métodos de pago, Testimonios, pie de página) van en negro sólido, y otras (portada, Cómo funciona, Ganadores, Preguntas) van en blanco — todo conectado con acentos dorados a juego con el logo.
- **Banners promocionales dinámicos**: un carrusel con 4 anuncios que rotan solos cada 5 segundos, con flechas, puntos y deslizable en celular.
- Menú fijo que se resalta según la sección que estás viendo, con transiciones suaves en botones, tarjetas y al hacer scroll.
- **Catálogo de rifas** con filtros por categoría (Autos, Motos, Tecnología, Videojuegos, Hogar, Y más) y buscador por nombre.
- Barra de progreso de boletos vendidos y etiquetas de estado (En vivo, Últimos boletos, Próximamente) en cada rifa.
- Contador de estadísticas animado, sección de "Ganadores recientes" y testimonios.
- Métodos de pago: transferencia SPEI, OXXO, tarjeta, PayPal y efectivo en persona.
- Mención de verificación del sorteo (Lotería Nacional / Tris Clásico) y transmisión en vivo, para dar la misma confianza — o más — que otras páginas de rifas.
- Dos números de WhatsApp configurados (Alberto y Jr) en los botones de compra y en la sección de contacto.
- Selección de números para la rifa publicada, que genera un mensaje de WhatsApp para confirmar disponibilidad y bases. No procesa pagos ni reserva números automáticamente.
- Botón flotante de WhatsApp y botón para volver arriba.
- Preguntas frecuentes con acordeón y formulario de contacto.

## 3. Datos que DEBES editar antes de publicar

Todo el contenido de ejemplo está marcado dentro del archivo con comentarios `<!-- [EDITA: ...] -->`. Abre `index.html` con cualquier editor de texto (Bloc de notas, VS Code, etc.) y busca (Ctrl+F) estas palabras:

- **`[EDITA: WHATSAPP]`** — ya están puestos los números de Alberto (614 303 9272) y Jr (614 601 3280). El de Alberto es el que usan todos los botones de "Comprar boletos", el botón flotante y los banners; el de Jr solo aparece como contacto adicional en la sección de Contacto y en el pie de página. Si alguno cambia, búscalo como `5216143039272` (Alberto) o `5216146013280` (Jr) — código de país 52 + el número a 10 dígitos, sin espacios ni signos +.
- **`[EDITA: INSTAGRAM]`** — cambia el link `instagram.com/rifadoscuu` por tu usuario real.
- **`[EDITA: FACEBOOK]`** — cambia el link `facebook.com/rifadoscuu` por tu página real.
- **`[EDITA: RIFA]`** — hay una rifa publicada (Nintendo Switch 2) y 5 tarjetas de plantilla ocultas (Motoneta, iPhone, PS5, Pantalla y Combo). Sustituye por datos reales y elimina `data-demo="true"` al publicar una de ellas (ver sección 4).
- **`[EDITA: BANNER]`** — hay 4 banners de ejemplo en el carrusel, justo debajo de la cuenta regresiva. Cambia el título, texto y botón de cada uno por tus promociones reales (ver sección 4.1).
- **`[EDITA: FECHA]`** — aparece en la rifa destacada del hero y en `drawDate` dentro del `<script>` (casi al final del archivo). Cambia ambas por la fecha real de tu sorteo destacado.
- **`[EDITA: PAGO]`** — junto a la sección "Métodos de pago"; agrega ahí (o donde prefieras) tus datos reales: CLABE, banco, referencia de OXXO, link de tu pasarela de tarjeta, etc. Esos datos también se los puedes mandar por WhatsApp cuando alguien aparte boletos, en vez de ponerlos públicos en la página.
- **`[EDITA: VERIFICA]`** — aparece en un banner, en "Ganadores" y en el FAQ. Ahora mismo dice que verificas el sorteo con la Lotería Nacional o el Tris Clásico (el método más común y confiable en México); cámbialo si usas otro mecanismo.

## 4. Cómo agregar, quitar o editar una rifa del catálogo

Cada rifa es un bloque `<div class="raffle-card" data-category="...">` dentro de `<div class="catalog-grid" id="catalogGrid">`. Para editar una:

1. Busca el comentario `<!-- [EDITA: RIFA N] -->` de la rifa que quieres cambiar.
2. Cambia el título, la descripción, el precio (`$80<small> / boleto</small>`), la fecha del sorteo y el ancho de la barra de progreso (`style="width:61%"`, junto con el texto "610 / 1,000 boletos vendidos"). Cuando ya sea real, elimina `data-demo="true"` de la etiqueta inicial de su tarjeta para publicarla.
3. Cambia el texto después de `?text=` en el link de WhatsApp por el mensaje que quieras que le llegue a tu WhatsApp.
4. El atributo `data-category` controla en qué filtro aparece la tarjeta. Usa exactamente uno de estos valores: `autos`, `motos`, `tecnologia`, `videojuegos`, `hogar`, `ymas`.

Para **agregar una rifa nueva**, copia un bloque `<div class="raffle-card" ...> ... </div>` completo (de `<!-- [EDITA: RIFA` hasta el `</div>` que le corresponde) y pégalo antes de `</div>` que cierra `catalogGrid`, luego edítalo como en los pasos anteriores.

Para **quitar una rifa**, borra su bloque completo desde `<div class="raffle-card"` hasta su `</div>` de cierre.

## 4.1. Cómo editar los banners del carrusel

Busca `<!-- [EDITA: BANNER N] -->` (hay 4). Cada banner es un bloque `<div class="carousel-slide" style="background:...">`. Puedes cambiar:
- El texto del `<h3>` (título) y el `<p>` (descripción).
- El botón: su texto y el `href` (a dónde lleva — puede ser `#catalogo`, un link de WhatsApp, etc.).
- El color de fondo: cambia los valores del `linear-gradient(...)` en el `style` si quieres otros tonos.

Para agregar o quitar un banner, copia o borra un bloque `<div class="carousel-slide" ...> ... </div>` completo dentro de `<div class="carousel-track" id="carouselTrack">`. No necesitas tocar el JavaScript — el carrusel detecta automáticamente cuántos banners hay.

## 5. El formulario de contacto (opcional)

El formulario de la sección "Contacto" está conectado a un servicio llamado **Formspree** (gratis para uso básico), porque Hostinger en su plan básico solo sirve archivos estáticos — no puede "recibir" un formulario sin un servicio externo o un backend.

Para activarlo:
1. Crea una cuenta gratis en **formspree.io**.
2. Crea un formulario nuevo y copia el "endpoint" que te dan (algo como `https://formspree.io/f/abcd1234`).
3. En `index.html`, busca `TU_ID_DE_FORMSPREE` y reemplaza toda esa URL por la que te dio Formspree.

Si no quieres configurar esto todavía, no hay problema: el botón de WhatsApp flotante y los botones de "Comprar boletos" ya funcionan sin nada adicional, así que la gente puede escribirte directo.

## 6. Cambiar imágenes

**Logo:** ya está incrustado en el propio `index.html`, con fondo transparente tal cual el archivo que me pasaste, por eso no necesitas subir ninguna carpeta aparte. Si en algún momento quieres cambiar el logo por otra versión, dímelo y te genero de nuevo el archivo con el logo actualizado — es un proceso técnico (convertir la imagen a texto base64) que no se edita a mano fácilmente.

**Fotos de premios:** ahora mismo cada tarjeta del catálogo muestra un ícono dibujado (no es una foto real). Cuando tengas fotos:

1. Crea (si no existe) una carpeta `assets/` junto a tu `index.html` en Hostinger, y sube ahí tu imagen (por ejemplo `assets/camioneta.jpg`).
2. En `index.html`, busca el bloque `<div class="raffle-visual">` de esa rifa y reemplaza el `<svg>...</svg>` de adentro por:
   `<img src="assets/camioneta.jpg" alt="Nombre del premio" style="width:100%;height:100%;object-fit:cover;">`

## 7. Antes de anunciar la página

- Revisa que el número de WhatsApp y las fechas de sorteo ya estén correctos en todas las rifas.
- Revisa la sección de preguntas frecuentes (FAQ) — tiene textos marcados `[EDITA]` que debes completar con tus propias reglas del sorteo.
- Revisa "Ganadores recientes" y "Testimonios" — son ejemplos, sustitúyelos por casos reales en cuanto los tengas (dan mucha confianza).
- Agrega tu dominio con **HTTPS activado** (Hostinger lo activa gratis con "SSL" en hPanel) para que se vea el candadito de seguridad.
