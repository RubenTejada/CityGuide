import Image from "next/image";

/**
 * Una foto dentro de una caja de proporción fija, sin cortarle nada.
 *
 * Casi todas las fotos del portal las trae el agente —de Google, de Commons o del
 * sitio del propio local— y vienen como las hizo quien las hizo: verticales la
 * mayoría. Las cajas del portal son cuadradas o apaisadas, así que recortar al
 * centro (que es lo que hace `object-cover`, y lo que hacía cada tarjeta y cada
 * ficha) se lleva más de la mitad de un 2:3 metido en un 11/8, y lo que se pierde
 * suele ser el plato, el rótulo o la cara. Centrar más no se puede: ya está
 * centrado. Lo que se puede es no cortar.
 *
 * Así que la foto se ve entera (`object-contain`) y el hueco que deja lo rellena
 * una copia de ella misma, ampliada y desenfocada: la caja sigue llena, la maqueta
 * no se mueve y no hace falta ninguna foto nueva. El fondo se pide diminuto (32px
 * de ancho) porque está desenfocado y nadie le ve el detalle — una foto no cuesta
 * dos descargas por esto. Cuando la foto ya tiene la proporción de la caja,
 * `contain` y `cover` coinciden y del fondo no se ve nada.
 *
 * Un SVG no es una foto: los glifos de sección y los emblemas están dibujados para
 * llenar su caja, así que esos siguen recortándose como antes.
 *
 * Quien la coloca pone la caja, que tiene que estar posicionada (`relative`) y
 * llevar el redondeo; `className` va sobre las dos capas a la vez, que es lo que
 * deja el zoom del hover y el fundido de la galería mover la foto y su fondo
 * juntos.
 */
export default function PhotoFit({
  src,
  alt,
  sizes,
  className = "",
  priority,
}: {
  src: string;
  alt: string;
  sizes: string;
  /** Transiciones o animaciones que afectan a la foto y a su fondo por igual. */
  className?: string;
  priority?: boolean;
}) {
  if (src.endsWith(".svg"))
    return (
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
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
