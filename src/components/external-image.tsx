import Image from "next/image";
import type { CSSProperties, SyntheticEvent } from "react";

type ExternalImageProps = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  onError?: (e: SyntheticEvent<HTMLImageElement, Event>) => void;
};

/** External URLs (avatars, TMDB) via next/image unoptimized. */
export function ExternalImage({
  src,
  alt = "",
  width = 32,
  height = 32,
  className,
  style,
  onError,
}: ExternalImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={className}
      style={style}
      onError={onError}
    />
  );
}
