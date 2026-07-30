import { CrokiMark } from "../croki/CrokiMark";

export function CrokiSurfaceBrand({
  displayName,
  inverse = false,
}: {
  readonly displayName: string;
  readonly inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <CrokiMark className="size-9 shrink-0 rounded-[11px]" decorative />
      <span
        className={
          inverse
            ? "text-sm font-semibold tracking-tight text-white"
            : "text-sm font-semibold tracking-tight text-foreground"
        }
      >
        {displayName}
      </span>
    </div>
  );
}
