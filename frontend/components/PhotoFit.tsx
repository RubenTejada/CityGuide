import Image from "next/image";

/**
 * Las proporciones que el portal dibuja: nada más alto que 4:5 ni más ancho que
 * 16:9. Una caja que se sale de ahí desordena el listado aunque la foto lo pida.
 */
const MIN_BOX = 4 / 5;
const MAX_BOX = 16 / 9;

/**
 * Cuánto puede recortarse una foto antes de que salga más a cuenta enseñarla
 * entera. Un 35% es la diferencia entre un 3:2 y un 2:1: se pierde cielo o mantel,
 * no el plato. Por encima ya se está tirando el asunto de la foto.
 */
const MAX_CROP = 0.35;

/**
 * La proporción de caja que le va a una foto: la suya, sin pasarse de los
 * extremos que el portal dibuja. `null` cuando no se sabe cuánto mide —una URL
 * suelta, sin paso por la biblioteca de medios—, y entonces quien la coloca se
 * queda con la caja que ya tenía.
 */
export function photoBoxAspect(photo: {
  width: number | null;
  height: number | null;
} | null): number | null {
  if (!photo?.width || !photo?.height) return null;
  return Math.min(MAX_BOX, Math.max(MIN_BOX, photo.width / photo.height));
}

/** Cuánto de la foto se llevaría por delante esa caja, en tanto por uno. */
function cropOf(
  width: number | null | undefined,
  height: number | null | undefined,
  box: number | null | undefined,
): number {
  if (!width || !height || !box) return 0;
  const photo = width / height;
  return Math.max(photo, box) / Math.min(photo, box) - 1;
}

/**
 * Una foto dentro de su caja, cortándole lo menos posible.
 *
 * Casi todas las fotos del portal las trae el agente —de Google, de Commons o del
 * sitio del propio local— y vienen como las hizo quien las hizo: verticales
 * muchas. Recortar al centro para llenar la caja (que es lo que hace
 * `object-cover`, y lo que sigue haciendo casi siempre) está bien mientras lo que
 * se pierde sea borde; deja de estarlo cuando la caja se come la mitad de la foto
 * y con ella el plato, el rótulo o la cara.
 *
 * Así que el recorte se mide antes: el CMS dice cuánto mide cada imagen, y quien
 * la coloca dice la proporción de su caja (`box`). Mientras el corte no pase de
 * `MAX_CROP` la foto llena la caja como siempre. Solo cuando la foto no cabe de
 * ninguna manera —una vertical de móvil en una tira apaisada— se enseña entera y
 * el hueco lo rellena una copia de ella misma, ampliada y desenfocada, que es
 * preferible a una banda vacía y no mueve la maqueta.
 *
 * Quien puede darle a la caja la forma de la foto se ahorra el caso extremo:
 * `photoBoxAspect` es esa proporción, y una ficha o un artículo, que mandan sobre
 * su propio alto, la usan. Un listado no puede —las tarjetas de una fila tienen
 * que medir lo mismo—, así que ahí la caja manda y la regla decide.
 *
 * Sin tamaño no hay nada que medir y la foto se recorta como siempre. Un SVG
 * tampoco es una foto: los glifos de sección están dibujados para llenar su caja.
 *
 * La caja la pone quien la coloca; tiene que estar posicionada (`relative`) y
 * llevar el redondeo. `className` va sobre la foto y su fondo a la vez, que es lo
 * que deja el zoom del hover y el fundido de la galería moverlos juntos.
 */
export default function PhotoFit({
  src,
  alt,
  sizes,
  className = "",
  priority,
  width,
  height,
  box,
}: {
  src: string;
  alt: string;
  sizes: string;
  /** Transiciones o animaciones que afectan a la foto y a su fondo por igual. */
  className?: string;
  priority?: boolean;
  /** El tamaño que el CMS guarda de la foto, si lo guarda. */
  width?: number | null;
  height?: number | null;
  /** La proporción (ancho/alto) de la caja en la que se coloca. */
  box?: number | null;
}) {
  if (src.endsWith(".svg") || cropOf(width, height, box) <= MAX_CROP)
    return (
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized={src.endsWith(".svg")}
        sizes={sizes}
        priority={priority}
        className={`object-cover ${className}`}
      />
    );

  return (
    // El recorte lo pone esta capa y no la de dentro: `group-hover:scale-105` crece
    // sobre la de dentro, y si el recorte creciera con ella la foto se saldría de la
    // caja en vez de acercarse dentro de ella.
    <span className="absolute inset-0 overflow-hidden">
      <span className={`absolute inset-0 ${className}`}>
        <Image
          src={src}
          alt=""
          aria-hidden
          fill
          // Está desenfocado y nadie le ve el detalle: una foto no cuesta dos
          // descargas de verdad por esto.
          sizes="32px"
          // Un poco más grande que la caja: el desenfoque se come el borde, y sin
          // ese margen se vería la orilla transparente del propio fondo.
          className="scale-125 object-cover blur-xl"
        />
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain"
        />
      </span>
    </span>
  );
}
