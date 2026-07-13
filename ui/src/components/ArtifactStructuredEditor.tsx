import type { JsonValue } from "@/openCanvasTypes";
import { structuredArtifactCollection, type StructuredArtifactKind as CollectionKind, type StructuredArtifactRecord as JsonRecord } from "@/lib/artifactStructuredEditing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function replaceRows(value: JsonValue, key: string | null, rows: JsonRecord[]): JsonValue {
  return key === null ? rows : { ...(value as JsonRecord), [key]: rows };
}

function editableFields(rows: JsonRecord[], kind: CollectionKind): string[] {
  const preferred = kind === "comparison"
    ? ["name", "title", "label", "option", "alternative", "summary", "evidence", "risk", "recommendation"]
    : ["title", "name", "label", "step", "when", "date", "description", "detail", "status", "outcome"];
  const fields = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
    .filter((key) => rows.some((row) => row[key] === null || typeof row[key] !== "object"));
  return [...preferred.filter((key) => fields.includes(key)), ...fields.filter((key) => !preferred.includes(key))].slice(0, 8);
}

function inputValue(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function nextScalar(previous: JsonValue | undefined, value: string): JsonValue {
  if (typeof previous === "number" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (typeof previous === "boolean" && /^(?:true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === "true";
  return value;
}

export function ArtifactStructuredEditor({ content, contentType, onChange }: {
  content: JsonValue;
  contentType: string;
  onChange: (content: JsonValue) => void;
}) {
  const model = structuredArtifactCollection(content, contentType);
  if (!model) return null;
  const { kind } = model;

  const fields = editableFields(model.rows, kind);
  const titleKey = kind === "comparison" ? "name" : "title";
  const updateRow = (index: number, field: string, value: string) => {
    const rows = model.rows.map((row, rowIndex) => rowIndex === index
      ? { ...row, [field]: nextScalar(row[field], value) }
      : row);
    onChange(replaceRows(content, model.key, rows));
  };
  const removeRow = (index: number) => onChange(replaceRows(content, model.key, model.rows.filter((_, rowIndex) => rowIndex !== index)));
  const addRow = () => onChange(replaceRows(content, model.key, [
    ...model.rows,
    fields.reduce<JsonRecord>((row, field) => ({ ...row, [field]: "" }), { [titleKey]: "" }),
  ]));

  return (
    <section className="artifact-structured-editor" aria-label={kind === "comparison" ? "Edit alternatives" : "Edit journey"}>
      <div className="artifact-structured-editor-list">
        {model.rows.map((row, index) => (
          <fieldset key={index}>
            <legend>{kind === "comparison" ? `Alternative ${index + 1}` : `Step ${index + 1}`}</legend>
            {fields.length ? fields.map((field) => (
              <label key={field}>{field.replace(/[_-]+/g, " ")}
                <Input value={inputValue(row[field])} onChange={(event) => updateRow(index, field, event.target.value)} />
              </label>
            )) : (
              <label>{kind === "comparison" ? "Name" : "Title"}
                <Input value={inputValue(row[titleKey])} onChange={(event) => updateRow(index, titleKey, event.target.value)} />
              </label>
            )}
            <Button type="button" variant="outline" className="artifact-structured-remove" onClick={() => removeRow(index)}>
              Remove {kind === "comparison" ? "alternative" : "step"}
            </Button>
          </fieldset>
        ))}
      </div>
      <Button type="button" variant="outline" className="artifact-structured-add" onClick={addRow}>
        Add {kind === "comparison" ? "alternative" : "step"}
      </Button>
      <p>Nested or unusual fields stay intact. Use Source when you need to change them.</p>
    </section>
  );
}
