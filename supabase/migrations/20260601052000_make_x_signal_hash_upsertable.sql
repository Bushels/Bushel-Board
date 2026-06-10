drop index if exists public.idx_x_market_signals_signal_hash;

create unique index if not exists idx_x_market_signals_signal_hash
  on public.x_market_signals(signal_hash);

comment on index public.idx_x_market_signals_signal_hash is
  'Unique signal_hash index without a partial predicate so PostgREST upsert on signal_hash can target it.';
