import { cn } from "@heroui/theme";

export default function LoadingScreen({
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-black/60 transition",
        rest.className,
      )}
    >
      <span className="loading loading-spinner text-primary" />
    </div>
  );
}
