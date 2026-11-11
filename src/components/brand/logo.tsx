import { cn } from "@/lib/utils";
import { DEFAULT_LOGO, DEFAULT_LOGO_MARK } from "@/lib/constants";

/**
 * Company logo. Always rendered with its natural aspect ratio (object-contain,
 * width auto) so it is never stretched or distorted.
 */
export function Logo({
  src,
  variant = "full",
  className,
  alt = "Company logo",
}: {
  src?: string | null;
  variant?: "full" | "mark";
  className?: string;
  alt?: string;
}) {
  const url = src && src !== DEFAULT_LOGO ? src : variant === "mark" ? DEFAULT_LOGO_MARK : DEFAULT_LOGO;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo may be a user-uploaded URL of unknown size
    <img src={url} alt={alt} className={cn("h-10 w-auto max-w-full object-contain", className)} draggable={false} />
  );
}
