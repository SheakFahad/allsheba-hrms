import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function EmployeeAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      {photoUrl && <AvatarImage src={photoUrl} alt={name} className="object-cover" />}
      <AvatarFallback className="bg-brand-soft text-[11px] font-semibold text-brand-deep dark:text-brand">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
