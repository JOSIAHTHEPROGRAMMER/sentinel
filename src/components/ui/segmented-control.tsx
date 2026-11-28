import { cn } from "@/lib/cn";

type SegmentedControlProps = {
  label: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
};

export function SegmentedControl({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-control border border-border p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-7 cursor-pointer rounded-control px-2.5 text-ui font-medium transition-colors",
            value === option.value
              ? "bg-accent-subtle text-fg"
              : "text-fg-muted hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
