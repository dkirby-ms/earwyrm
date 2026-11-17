import { useState, type FormEvent } from 'react'

interface BriefEditorProps {
  readonly disabled: boolean
  readonly onAdd: (details: unknown) => Promise<void>
  /** File parsing and API errors use the workspace's existing notification boundary. */
  readonly onUpload: (file: File) => Promise<void>
}

/** Enter custom facts or upload the same JSON contract; the server decides readiness and identity. */
export default function BriefEditor({ disabled, onAdd, onUpload }: BriefEditorProps) {
  const [draft, setDraft] = useState({
    name: '', offer: '', location: '', email: '', phone: '', tone: '', claims: '', cta: '',
  })

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void onAdd({
      name: draft.name,
      offer: draft.offer,
      location: draft.location,
      contact_details: { email: draft.email, phone: draft.phone },
      tone: draft.tone,
      approved_claims: draft.claims.split('\n').map(line => line.trim()).filter(Boolean),
      cta: draft.cta,
    })
  }

  return (
    <section aria-labelledby="editor-heading">
      <h3 id="editor-heading">Enter or upload a brief</h3>
      <p className="muted">
        Use single-line English facts. Spell out numbers and symbols in the brand and call to action.
        Validation checks input readiness, not advertising claims or broadcast approval.
      </p>
      <label className="upload-label">
        Upload brief JSON
        <input
          type="file"
          accept=".json,application/json"
          disabled={disabled}
          onChange={event => {
            const file = event.currentTarget.files?.[0]
            if (file) void onUpload(file)
            event.currentTarget.value = ''
          }}
        />
      </label>
      <form className="brief-editor" onSubmit={submit}>
        {([
          ['name', 'Brand name'], ['offer', 'Offer'], ['location', 'Location'],
          ['tone', 'Tone'], ['email', 'Contact email'], ['phone', 'Contact phone'],
          ['cta', 'Call to action'],
        ] as const).map(([field, label]) => (
          <label key={field}>
            {label}
            <input
              type="text"
              maxLength={400}
              required
              disabled={disabled}
              value={draft[field]}
              onChange={event => {
                const value = event.currentTarget.value
                setDraft(current => ({ ...current, [field]: value }))
              }}
            />
          </label>
        ))}
        <label className="full-width">
          Approved claims (one per line)
          <textarea
            required
            maxLength={8019}
            disabled={disabled}
            value={draft.claims}
            onChange={event => {
              const claims = event.currentTarget.value
              setDraft(current => ({ ...current, claims }))
            }}
          />
        </label>
        <p className="muted full-width">
          Up to twenty claims. Brand, offer and call to action must fit a four-hundred-character audio script.
          A loaded custom brief is immutable; enter a new brief to revise its facts.
        </p>
        <button className="button button-primary" type="submit" disabled={disabled}>
          Validate and load brief
        </button>
      </form>
    </section>
  )
}
