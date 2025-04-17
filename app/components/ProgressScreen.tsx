import { fileSizeLabel } from "@/utils/fileSizeLabel";
import { cn } from "@heroui/theme";

export default function ProgressScreen({
  progress,
  rate,
  ...rest
}: { progress: number; rate: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 transition",
        rest.className,
      )}
    >
      <p className="font-medium text-white">
        Download rate: {fileSizeLabel(rate)}/s
      </p>
      <progress
        className="progress progress-primary w-56"
        value={progress}
        max="100"
      />
    </div>
  );
}
