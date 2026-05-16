# Premium Memory Write Policy Contract v1

Defines durable-memory acceptance rules for premium farmer chat.

## Memory classes
- `stable_fact`: long-lived factual profile data.
- `preference`: durable behavior/choice preference.
- `volatile_signal`: short-lived conversational signal (must not be written to durable memory).

## Candidate fields
- `key` (string)
- `value` (string)
- `memory_class` (`stable_fact | preference | volatile_signal`)
- `confidence_score` (number, 0..1)
- `extracted_at` (ISO-8601 with timezone)

## Active-memory comparison fields
- `key` (string)
- `value` (string)
- `memory_class` (`stable_fact | preference | volatile_signal`)
- `confidence_score` (number, 0..1)
- `updated_at` (ISO-8601 with timezone)

## Decision outcomes
- `accept`
- `reject`

## Reject rules (required)
1. Low confidence:
   - `stable_fact` must be >= 0.80
   - `preference` must be >= 0.65
2. Stale candidate:
   - `stable_fact` older than 120 days from evaluation time.
   - `preference` older than 180 days from evaluation time.
3. Contradictory candidate:
   - same `key`, different normalized value, and an existing active memory has both:
     - confidence >= candidate confidence + 0.10
     - updated_at >= candidate extracted_at
4. Volatile class:
   - `volatile_signal` must always be rejected for durable memory writes.

## Notes
- Value normalization for contradiction checks: trim + lowercase.
- Rejection reason must be returned for auditability.
- Policy is deterministic for identical input payloads.
