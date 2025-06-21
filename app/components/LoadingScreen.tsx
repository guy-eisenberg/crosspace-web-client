import { Spinner } from "@heroui/react";
import { cn } from "@heroui/theme";

export default function LoadingScreen({
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "absolute inset-0 z-[99999] flex items-center justify-center bg-black/60 transition",
        rest.className,
      )}
    >
      <Spinner variant="wave" size="lg" />
    </div>
  );
}
