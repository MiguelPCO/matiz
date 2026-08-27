"use client";

interface SegmentedOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SegmentedProps<T extends string | number> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
  readonly "aria-label"?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  ...aria
}: SegmentedProps<T>) {
  return (
    <div className="flex gap-2" role="radiogroup" {...aria}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          onClick={() => onChange(opt.value)}
          disabled={disabled || opt.disabled}
          className={`flex-1 rounded-[var(--radius-panel)] border border-line py-1.5 font-mono text-xs capitalize disabled:opacity-40 ${
            opt.value === value ? "bg-signal text-signal-ink" : "text-text-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
