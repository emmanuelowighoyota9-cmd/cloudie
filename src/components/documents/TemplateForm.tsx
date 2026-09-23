import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DocumentValues, FieldDef, TemplateSchema } from "@/lib/docTemplateEngine";

/**
 * Renders a SoftBaker template's `schema.fields` as a working form.
 *
 * Native selects/checkboxes are used deliberately: template options are
 * dynamic and every option value is non-empty by validation, so the shadcn
 * Select's non-empty-value rule cannot be satisfied generically.
 */

interface TemplateFormProps {
  schema: TemplateSchema;
  values: DocumentValues;
  errors?: Record<string, string>;
  onChange: (fieldId: string, value: unknown) => void;
  className?: string;
}

const inputClass =
  "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15";

function valueOf(values: DocumentValues, field: FieldDef): string {
  const raw = values[field.id];
  if (raw === undefined || raw === null) return "";
  return String(raw);
}

export function TemplateForm({ schema, values, errors = {}, onChange, className }: TemplateFormProps) {
  const visible = schema.fields.filter((f) => !f.hidden);

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {visible.map((field) => {
        const value = valueOf(values, field);
        const error = errors[field.id];
        const wide = field.type === "textarea" || field.type === "address";
        return (
          <div key={field.id} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
            <Label htmlFor={field.id} className="text-xs font-medium text-muted-foreground">
              {field.label}
              {field.required && <span className="ml-1 text-destructive">*</span>}
            </Label>

            {field.type === "textarea" || field.type === "address" ? (
              <Textarea
                id={field.id}
                rows={field.type === "textarea" ? 3 : 2}
                value={value}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                onChange={(e) => onChange(field.id, e.target.value)}
                className={cn(error && "border-destructive")}
              />
            ) : field.type === "checkbox" ? (
              <label className="flex h-9 items-center gap-2 text-sm text-foreground">
                <input
                  id={field.id}
                  type="checkbox"
                  checked={values[field.id] === true || values[field.id] === "true"}
                  onChange={(e) => onChange(field.id, e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-[var(--primary)]"
                />
                <span className="text-xs text-muted-foreground">{field.placeholder ?? "Enabled"}</span>
              </label>
            ) : field.type === "select" || field.type === "radio" || field.type === "status" ? (
              <select
                id={field.id}
                value={value}
                onChange={(e) => onChange(field.id, e.target.value)}
                className={cn(inputClass, error && "border-destructive")}
              >
                {(field.type === "status" || !field.required) && <option value="">—</option>}
                {(field.options ?? []).map((opt) => (
                  <option key={`${field.id}-${opt.value}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : field.type === "color" ? (
              <div className="flex items-stretch gap-2">
                <input
                  id={field.id}
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#0f172a"}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  aria-label={`${field.label} swatch`}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
                />
                <Input
                  value={value}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  placeholder="#0f172a"
                  className={cn("h-9 font-mono text-xs", error && "border-destructive")}
                />
              </div>
            ) : (
              <Input
                id={field.id}
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "date"
                      ? "date"
                      : field.type === "time"
                        ? "time"
                        : field.type === "datetime"
                          ? "datetime-local"
                          : "text"
                }
                value={value}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                min={field.min}
                max={field.max}
                inputMode={field.type === "currency" || field.type === "number" ? "decimal" : undefined}
                onChange={(e) => onChange(field.id, e.target.value)}
                className={cn("h-9", error && "border-destructive")}
              />
            )}

            {error ? (
              <p className="text-[11px] text-destructive">{error}</p>
            ) : field.help ? (
              <p className="text-[11px] text-muted-foreground">{field.help}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
