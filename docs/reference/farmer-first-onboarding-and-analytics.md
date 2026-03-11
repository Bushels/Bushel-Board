# Farmer-First Onboarding And Analytics

Date: 2026-03-11

## Goal

Bushel Board has to win over farmers who are actively looking for a reason not to trust software. The product therefore needs to:

1. Get a farmer to the part of the app that is about their farm first.
2. Explain exactly what they gain by entering data.
3. Never imply personalization or unlocked access before it actually exists.
4. Let the farmer verify subjective claims, especially X/Twitter content.

## Farmer-First Flow

### Entry

- Signed-in farmers should land on `My Farm`, not `Overview`.
- Signed-in observers should continue to land on `Overview`.
- The landing page hero should sell immediate weekly value, not abstract aspiration.

### Unlock ladder

- Step 1: Add one crop and acres.
  Value unlocked: grain page access and a farm-specific dashboard shell.
- Step 2: Add remaining tonnes / contracted tonnes.
  Value unlocked: more specific AI framing and pacing context.
- Step 3: Log deliveries.
  Value unlocked: delivery pace, percentile comparisons, sharper weekly summaries.
- Step 4: Rate X signals.
  Value unlocked: feed ranking improves for the farmer and the broader farmer cohort.

## Empty State Pattern

Every empty state should answer two questions:

1. What should I do next?
2. Why is it worth doing?

### Required empty states

- No crop plans:
  "Add your first crop to unlock your weekly brief."
- Crop plan exists but no deliveries:
  "Log your first delivery to sharpen your weekly brief."
- No unlocked grain access:
  Route to `My Farm`, not to a locked grain page.
- No X signals:
  Explain the weekly cadence and when signals should appear again.

## Navigation Direction

- Use a floating glassmorphism shell for the main nav.
- Use the actual Bushel Board lockup only once in the header. Do not pair the full lockup SVG with an extra text wordmark beside it.
- Keep active states obvious and tactile, with soft shadows and pill selection.
- Make grain access honest:
  unlocked grains jump straight in, locked grains explain the setup path.
- Mobile nav should contain the onboarding value prop, not just links.

## X Feed Trust Rules

- The overview and grain-preview X surfaces should look like post cards, not a ticker ribbon.
- Every X card should offer an outbound "Open post" action.
- Store canonical `post_url` during ingestion when available.
- If canonical URL is missing, fall back to an X search URL built from author + summary.
- Keep the copy explicit that farmer feedback re-ranks the feed over time.

## Product Analytics Plan

Status: event strategy documented; collector not yet implemented in this pass.

### What to measure first

- `signup_started`
- `signup_completed`
- `login_completed`
- `my_farm_viewed`
- `empty_state_seen`
- `crop_plan_created`
- `grain_unlock_started`
- `grain_unlocked`
- `delivery_logged`
- `signal_opened`
- `signal_voted`
- `grain_page_viewed`

### Key funnel

Track this funnel first:

1. Signup completed
2. First `My Farm` view
3. First crop plan created
4. First grain unlocked
5. First delivery logged
6. Week-2 return

### Event properties

Keep properties coarse and privacy-safe:

- `role`
- `route`
- `grain`
- `crop_year`
- `grain_week`
- `device_type`
- `has_crop_plans`
- `has_deliveries`
- `empty_state_type`

Do not send:

- farm name
- postal code
- exact delivery notes
- free-text user inputs
- precise location

### Recommended implementation

- Create a first-party event collector in the app backend or Supabase.
- Store normalized event rows with optional user id and session id.
- Track onboarding, unlock, and feed actions before adding broad pageview noise.
- Review the data weekly against the first-value funnel, not vanity metrics.
