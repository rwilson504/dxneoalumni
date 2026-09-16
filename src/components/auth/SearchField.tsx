export default function SearchField({
  value,
  onChange,
  label,
  resultCount,
  totalCount,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="search-field">
      <label>
        <span className="sr-only">{label}</span>
        <input type="search" value={value} placeholder={label}
          onChange={(event) => onChange(event.target.value)} />
      </label>
      <span className="search-field__count" aria-live="polite">
        {resultCount} of {totalCount}
      </span>
    </div>
  );
}