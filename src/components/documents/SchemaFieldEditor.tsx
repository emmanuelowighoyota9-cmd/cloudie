import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  FIELD_TYPES,
  isValidFieldId,
  type FieldDef,
  type FieldType,
  type TemplateSchema,
} from "@/lib/docTemplateEngine";

/**
 * Editor for a template's dynamic form.
 *
 * Field ids are the contract between the form and the layout: changing an id
 * invalidates every element bound to it, so ids are validated here and
 * orphaned bindings are surfaced by the layout validator on save.
 */

interface SchemaFieldEditorProps {
  schema: TemplateSchema;
  onChange: (schema: TemplateSchema) => void;
}

const NEEDS_OPTIONS: FieldType[] = ["select", "radio", "status"];

const inputClass = "h-8 text-xs";

function parseOptions(raw: string): Array<{ label: string; value: string }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, value] = line.includes("=") ? line.split("=").map((p) => p.trim()) : [line, ""];
      const finalValue = (value || label).toLowerCase().replace(/\s+/g, "_");
      return { label: label || finalValue, value: finalValue };
    });
}

function formatOptions(options?: Array<{ label: string; value: string }>): string {
  return (options ?? []).map((o) => `${o.label} = ${o.value}`).join("\n");
}

export function SchemaFieldEditor({ schema, onChange }: SchemaFieldEditorProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [newType, setNewType] = useState<FieldType>("text");

  const fields = schema.fields;

  const update = (index: number, patch: Partial<FieldDef>) => {
    const next = fields.slice();
    next[index] = { ...next[index], ...patch } as FieldDef;
    onChange({ ...schema, fields: next });
  };

  const remove = (index: number) => {
    onChange({ ...schema, fields: fields.filter((_, i) => i !== index) });
    setOpenIndex((current) => (current === index ? null : current !== null && current > index ? current - 1 : current));
  };

  const addField = () => {
    let n = fields.length + 1;
    while (fields.some((f) => f.id === `field_${n}`)) n++;
    const field: FieldDef = {
      id: `field_${n}`,
      type: newType,
      label: `Field ${n}`,
      default: newType === "checkbox" ? false : "",
      ...(NEEDS_OPTIONS.includes(newType)
        ? {
            options: [
              { label: "Option A", value: "option_a" },
              { label: "Option B", value: "option_b" },
            ],
          }
        : {}),
      ...(newType === "currency" ? { currency: "USD" } : {}),
    };
    onChange({ ...schema, fields: [...fields, field] });
    setOpenIndex(fields.length);
  };

  const ids = fields.map((f) => f.id);
  const duplicateIds = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Form fields · {fields.length}/{60}
        </p>
        <div className="flex items-center gap-1.5">
          <select
            aria-label="New field type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as FieldType)}
            className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] capitalize text-foreground"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" onClick={addField}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => {
          const open = openIndex === index;
          const invalidId = !isValidFieldId(field.id);
          const duplicated = duplicateIds.has(field.id);
          return (
            <div
              key={`${field.id}-${index}`}
              className={cn(
                "rounded-lg border bg-card transition-colors",
                invalidId || duplicated ? "border-destructive/50" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(open ? null : index)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {field.label || "(untitled)"}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    {field.id} · {field.type}
                    {field.required ? " · required" : ""}
                  </span>
                </span>
                {(invalidId || duplicated) && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                <ChevronDown
                  className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                />
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-2.5 border-t border-border px-3 py-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => update(index, { label: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Id (binding key)
                          </Label>
                          <Input
                            value={field.id}
                            onChange={(e) => update(index, { id: e.target.value })}
                            className={cn(inputClass, "font-mono", (invalidId || duplicated) && "border-destructive")}
                          />
                        </div>
                      </div>

                      {(invalidId || duplicated) && (
                        <p className="text-[10px] text-destructive">
                          {duplicated
                            ? "This id is used by another field."
                            : "Ids must start with a letter and contain only letters, numbers and underscores."}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</Label>
                          <select
                            aria-label="Field type"
                            value={field.type}
                            onChange={(e) => update(index, { type: e.target.value as FieldType })}
                            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs capitalize"
                          >
                            {FIELD_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Default</Label>
                          <Input
                            value={typeof field.default === "boolean" ? String(field.default) : (field.default ?? "")}
                            onChange={(e) => update(index, { default: e.target.value })}
                            className={inputClass}
                          />
                        </div>
                      </div>

                      {NEEDS_OPTIONS.includes(field.type) && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Options — one per line as “Label = value”
                          </Label>
                          <Textarea
                            rows={3}
                            value={formatOptions(field.options)}
                            onChange={(e) => update(index, { options: parseOptions(e.target.value) })}
                            className="font-mono text-[11px]"
                          />
                        </div>
                      )}

                      {field.type === "currency" && (
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Currency code
                          </Label>
                          <Input
                            value={field.currency ?? "USD"}
                            onChange={(e) => update(index, { currency: e.target.value.toUpperCase().slice(0, 3) })}
                            className={cn(inputClass, "font-mono")}
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max length</Label>
                          <Input
                            type="number"
                            value={field.maxLength ?? ""}
                            onChange={(e) =>
                              update(index, { maxLength: e.target.value === "" ? undefined : Number(e.target.value) })
                            }
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Min</Label>
                          <Input
                            type="number"
                            value={field.min ?? ""}
                            onChange={(e) =>
                              update(index, { min: e.target.value === "" ? undefined : Number(e.target.value) })
                            }
                            className={inputClass}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max</Label>
                          <Input
                            type="number"
                            value={field.max ?? ""}
                            onChange={(e) =>
                              update(index, { max: e.target.value === "" ? undefined : Number(e.target.value) })
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Placeholder
                        </Label>
                        <Input
                          value={field.placeholder ?? ""}
                          onChange={(e) => update(index, { placeholder: e.target.value || undefined })}
                          className={inputClass}
                        />
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={!!field.required}
                            onChange={(e) => update(index, { required: e.target.checked })}
                            className="h-3.5 w-3.5 accent-[var(--primary)]"
                          />
                          Required
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 px-2 text-[11px] text-destructive"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-3 w-3" /> Delete field
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {fields.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-[11px] text-muted-foreground">
            No fields yet. Add one to start binding layout elements.
          </p>
        )}
      </div>
    </div>
  );
}
