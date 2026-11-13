---
title: Audio POC Protocol
description: Provider-neutral synthetic brief contract and one-person audio proof record
---

## Purpose and Scope

This protocol defines three synthetic advertiser inputs and a bounded, one-person
proof of concept (POC). The participant evaluates three outputs. The provisional
self-evaluation screen requires all three outputs to have a correct brand and
call-to-action (CTA) transcription and a "usable with minor edits" self-rating.

This is unblinded self-evaluation, not independent-listener or
production-professional evidence. The original panel of five independent
listeners and three production professionals is deferred future validation. It
is not a current POC gate. The live GitHub issue remains unchanged.

This protocol defines blank result rows only. Rows remain Pending until actual
outputs and supporting evidence exist. Creating the protocol and fixtures does
not produce audio, prove rights, measure duration or cost, or establish a POC
result.

Use the [local rendering guide](rendering.md) to create instrumental or paired
Azure vocal outputs and their evidence manifests. Instrumental-only renders
and tone-based automated tests do not satisfy the live vocal proof.

## Synthetic Brief Contract

Each brief has a stable, unique `brief_id` using the `brief-NNN` form. The
generation-facing adapter returns only the fields in this contract:

```json
{
  "brief_id": "brief-001",
  "name": "",
  "offer": "",
  "location": "",
  "contact_details": {
    "email": "",
    "phone": ""
  },
  "tone": "",
  "approved_claims": []
}
```

The adapter contract is provider-neutral. A fixture source or a later connector
can supply the same normalized fields. It does not prescribe a runtime, provider,
or connector implementation.

Keep the expected-answer file evaluator-only. It uses the matching `brief_id`
and contains `expected_brand`, `expected_cta`, and any `accepted_cta_variants`
defined before evaluation. Do not include those answer fields in the
generation-facing adapter response or expose them before transcription.

Synthetic email addresses must use `example.com` or `example.org`. Synthetic
phone numbers must use NANPA's fictitious `202-555-0100` through `202-555-0199`
range. Do not use real advertiser or personal contact details.

## Evaluation Procedure

1. Assign each generated output a unique `output_id` and record its `brief_id`.
2. Before consulting the expected-answer file, transcribe the brand and CTA
   heard in the output.
3. Compare the transcription with the expected brand and CTA. Ignore only
   letter case and surrounding whitespace. Accept a CTA alternative only when
   it is listed in `accepted_cta_variants` before evaluation. Both brand and CTA
   must match.
4. Rate the output's usability. The self-evaluation measure passes only when
   the participant selects "usable with minor edits."
5. Record the rights, duration, and metered-cost evidence for that output.
   Report fixed gateway and hosting charges separately from the metered-only
   threshold.

Label the results as unblinded self-evaluation. Do not describe them as
independent listener or production-professional results.

## Output Evaluation Record

Create one row per output. The initial rows below are Pending and intentionally
contain no observations.

| Output ID | Brief ID | Brand transcription | CTA transcription | Self-rating | Duration (seconds) | Metered cost (USD) | Rights evidence references | Status |
|-----------|----------|---------------------|------------------|-------------|--------------------|--------------------|----------------------------|--------|
| output-001 | brief-001 | | | | | | | Pending |
| output-002 | brief-002 | | | | | | | Pending |
| output-003 | brief-003 | | | | | | | Pending |

### Component Rights Evidence

Record one row for every audio component used by an output.

| Output ID | Component | Asset or source | License or usage terms | Commercial-use basis | Evidence reference | Date checked |
|-----------|-----------|-----------------|------------------------|----------------------|--------------------|--------------|
| | | | | | | |

### Metered Usage Evidence

Record each metered component attributable to a render. Capture the provider or
resource, quantity and unit, unit rate and currency, evidence source and date,
and render-attempt attribution. State any excluded or unavailable meter
explicitly; do not treat it as zero. The per-output metered total is the sum of
the recorded metered charges attributable to that render.

| Output ID | Attempt ID | Provider or resource | Quantity and unit | Unit rate and currency | Metered charge | Evidence source and date |
|-----------|------------|-----------------------|-------------------|------------------------|----------------|--------------------------|
| | | | | | | |

Report fixed gateway and hosting charges separately. If an allocated fixed-cost
amount is shown, state its volume assumption. Fixed charges are not included in
the POC's metered-cost threshold.

## Pass, Fail, and Pending

Use the following output status rules:

* **Fail** when available evidence shows any required criterion failed.
* **Pending** when no known criterion has failed but required evidence is
  missing.
* **Pass** only when transcription, self-rating, rights, duration, and metered
  cost evidence all show that the output meets its criteria.

The transcription passes only when both brand and CTA match under the
normalization rules above. The self-rating passes only at "usable with minor
edits." Every audio component must have documented commercial-use rights. A
measured render must take less than five minutes. Metered per-render consumption
must be below $0.50. Fixed gateway or hosting charges are reported separately
and do not enter this threshold.

The overall POC status is Fail if any of the three outputs fails. Otherwise it
is Pending if any output remains pending. It is Pass only when all three
outputs pass every applicable criterion. The provisional self-evaluation
screen also requires all three outputs to pass both the transcription and
self-rating measures.

## Deferred Full-Panel Validation

The original full-panel criteria are not gates for this one-person POC. Keep
them only as deferred future validation: five independent listeners provide 15
transcriptions, with at least 12 correct brand-and-CTA results; three
production professionals provide nine usability ratings, with at least seven
rated "usable with minor edits." Seven of nine is approximately 77.8%, not 70%.
