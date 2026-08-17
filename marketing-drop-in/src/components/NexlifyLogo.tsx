import Image from "next/image";
import Link from "next/link";

type NexlifyLogoProps = {
  /** Full wordmark (default) or icon mark only */
  variant?: "full" | "mark";
  className?: string;
  href?: string;
  priority?: boolean;
};

export function NexlifyLogo({
  variant = "full",
  className = "",
  href = "/",
  priority = false,
}: NexlifyLogoProps) {
  const isMark = variant === "mark";
  const img = (
    <Image
      src={isMark ? "/logo-mark.png" : "/logo-full.png"}
      alt="Nexlify"
      width={isMark ? 36 : 140}
      height={isMark ? 36 : 40}
      priority={priority}
      className={`h-auto w-auto object-contain ${isMark ? "h-9 w-9" : "h-8 md:h-9 w-auto max-w-[140px] md:max-w-[160px]"} ${className}`}
    />
  );

  if (!href) return img;

  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      {img}
    </Link>
  );
}
