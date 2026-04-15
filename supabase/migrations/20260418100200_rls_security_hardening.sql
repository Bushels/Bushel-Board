-- Codex audit P1 fixes: RLS hardening for posted_prices + price_query_log
-- Addresses: operator role enforcement on writes, query log privacy leak

-- ─── 1. posted_prices: enforce operator role on writes ──────────

-- Drop the overly permissive write policy
DROP POLICY IF EXISTS "Operators manage own prices" ON public.posted_prices;

-- New write policy: must be the owner AND have an operator role
CREATE POLICY "Operators manage own prices"
  ON public.posted_prices FOR ALL
  USING (auth.uid() = operator_id)
  WITH CHECK (
    auth.uid() = operator_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('elevator', 'processor', 'crusher', 'mill', 'terminal',
                     'seed', 'fertilizer', 'chemical')
    )
  );

-- Revoke INSERT/UPDATE/DELETE from authenticated — only operators can write via the policy above,
-- and service_role bypasses RLS for system inserts.
-- Keep SELECT for farmers to read posted prices.
REVOKE INSERT, UPDATE, DELETE ON public.posted_prices FROM authenticated;

-- ─── 2. price_query_log: fix privacy leak ──────────────────────

-- Drop the USING(true) policy that overrides operator scoping
DROP POLICY IF EXISTS "Service role manages query logs" ON public.price_query_log;

-- Service role already bypasses RLS — no policy needed for it.
-- The "Operators read own query logs" policy (USING auth.uid() = operator_id)
-- remains as the only SELECT path for authenticated users.

-- Revoke direct INSERT from authenticated — only service_role inserts via chat tools
REVOKE INSERT, UPDATE, DELETE ON public.price_query_log FROM authenticated;

-- ─── 3. operator_products: tighten to operator roles only ──────

-- Drop existing policy if any
DROP POLICY IF EXISTS "Operators manage own products" ON public.operator_products;

-- Recreate with role check
CREATE POLICY "Operators manage own products"
  ON public.operator_products FOR ALL
  USING (auth.uid() = operator_id)
  WITH CHECK (
    auth.uid() = operator_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('elevator', 'processor', 'crusher', 'mill', 'terminal',
                     'seed', 'fertilizer', 'chemical')
    )
  );

COMMENT ON POLICY "Operators manage own prices" ON public.posted_prices IS
  'Operators can read/write their own prices. WITH CHECK enforces operator role via profiles join — farmers cannot insert.';

COMMENT ON POLICY "Operators manage own products" ON public.operator_products IS
  'Operators manage their own product catalog. Role-checked via profiles join.';
