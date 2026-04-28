// Direction B — Bold Predictive Terminal
// Dark mode, dense, Polymarket/Bloomberg energy.
// Mocha mousse + chlorophyll green + terracotta accents from the agtech skill,
// dropped into a near-black canvas for "trading desk" feel.

const B_BG = "#0e0d0a";
const B_BG2 = "#171511";
const B_PANEL = "#1f1c16";
const B_BORDER = "#2e2920";
const B_BORDER_HOT = "#3d362a";
const B_TEXT = "#f3ecdb";
const B_TEXT_MUTED = "#8a7f63";
const B_TEXT_DIM = "#5e5640";
const B_GREEN = "#62c64f";
const B_GREEN_DEEP = "#0a3d2e";
const B_RED = "#ee6a4a";
const B_AMBER = "#f0a830";
const B_CANOLA = "#e1a04f";
const B_TERRA = "#c65d3b";
const B_MOCHA = "#a78b6e";

function BTicker() {
  const items = [
    ["CORN K26", "4.62¾", "+1.76%", true],
    ["SOYBEAN K26", "10.24½", "−1.35%", false],
    ["WHEAT K26", "5.38¼", "+0.75%", true],
    ["CANOLA K26", "648.20", "+0.42%", true],
    ["DXY", "104.82", "−0.18%", false],
    ["CAD/USD", "0.7268", "+0.22%", true],
    ["BRENT", "82.14", "−0.55%", false],
    ["VIX", "14.62", "+2.18%", true],
  ];
  return (
    <div style={{ background: B_BG2, borderBottom: `1px solid ${B_BORDER}`, overflow: "hidden", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 11, padding: "8px 0", color: B_TEXT_MUTED, letterSpacing: "0.04em" }}>
      <div style={{ display: "flex", gap: 32, paddingLeft: 24 }}>
        {items.concat(items).map((t, i) => (
          <span key={i} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: B_TEXT_DIM }}>{t[0]}</span>
            <span style={{ color: B_TEXT, fontVariantNumeric: "tabular-nums" }}>{t[1]}</span>
            <span style={{ color: t[3] ? B_GREEN : B_RED, fontVariantNumeric: "tabular-nums" }}>{t[2]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BNav() {
  return (
    <div style={{ borderBottom: `1px solid ${B_BORDER}`, background: B_BG }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "DM Sans" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, background: B_CANOLA, color: B_BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Fraunces", fontSize: 18, fontWeight: 600 }}>B</div>
            <div style={{ fontFamily: "Fraunces", fontSize: 18, fontWeight: 500, color: B_TEXT, letterSpacing: "-0.01em" }}>Bushel Board</div>
          </div>
          <nav style={{ display: "flex", gap: 24, fontSize: 13 }}>
            <span style={{ color: B_TEXT, fontWeight: 600, paddingBottom: 4, borderBottom: `2px solid ${B_CANOLA}` }}>Stance</span>
            <span style={{ color: B_TEXT_MUTED }}>Marketplace</span>
            <span style={{ color: B_TEXT_MUTED }}>Seeding</span>
            <span style={{ color: B_TEXT_MUTED }}>Farm</span>
            <span style={{ color: B_TEXT_MUTED }}>Bushy</span>
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11, color: B_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, background: B_GREEN, borderRadius: "50%" }} />
            LIVE · 09:14 MST
          </span>
          <span style={{ padding: "5px 10px", border: `1px solid ${B_BORDER_HOT}`, color: B_TEXT, borderRadius: 1, fontSize: 11 }}>
            FRI APR 24 · WK 17
          </span>
        </div>
      </div>
    </div>
  );
}

function BSpectrum({ score, prior, height = 14 }) {
  const abs = Math.abs(score);
  const isBull = score > 0;
  const priorPos = prior !== null && prior !== undefined ? 50 + prior / 2 : null;
  // Continuous gradient bar with score marker
  return (
    <div style={{ position: "relative", height, background: `linear-gradient(90deg, ${B_RED} 0%, ${B_RED}88 25%, ${B_BORDER} 50%, ${B_GREEN}88 75%, ${B_GREEN} 100%)`, borderRadius: 0 }}>
      {/* center tick */}
      <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: B_TEXT_DIM, transform: "translateX(-50%)" }} />
      {/* score marker */}
      <div style={{
        position: "absolute", left: `${50 + score / 2}%`, top: -3, bottom: -3,
        width: 3, background: B_TEXT, transform: "translateX(-50%)",
        boxShadow: `0 0 8px ${isBull ? B_GREEN : B_RED}`
      }} />
      {/* prior marker */}
      {priorPos !== null && prior !== score && (
        <div style={{
          position: "absolute", left: `${priorPos}%`, top: 2, bottom: 2,
          width: 1, background: B_TEXT_DIM, opacity: 0.55
        }} />
      )}
    </div>
  );
}

function BTrajectoryCard({ grain, score, prior, traj, region }) {
  const days = window.BB_DATA.DAYS;
  const w = 280, h = 80;
  const yFor = (s) => h / 2 - (s / 100) * (h / 2 - 4);
  const xFor = (i) => 6 + (i / (days.length - 1)) * (w - 12);
  const pathFor = (arr) => arr.map((s, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(s)}`).join(" ");
  const last = traj[traj.length - 1];
  const isBull = last > 0;

  return (
    <div style={{ background: B_PANEL, border: `1px solid ${B_BORDER}`, padding: 16, fontFamily: "DM Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: B_TEXT, letterSpacing: "0.02em" }}>{region} · {grain}</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, fontWeight: 600, color: isBull ? B_GREEN : B_RED, fontVariantNumeric: "tabular-nums" }}>
          {last > 0 ? "+" : ""}{last}
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
        <line x1={6} x2={w - 6} y1={h / 2} y2={h / 2} stroke={B_BORDER} strokeWidth={1} strokeDasharray="2 3" />
        <path d={pathFor(traj)} fill="none" stroke={isBull ? B_GREEN : B_RED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {traj.map((s, i) => <circle key={i} cx={xFor(i)} cy={yFor(s)} r={2.4} fill={isBull ? B_GREEN : B_RED} />)}
        {/* gradient under line */}
        <defs>
          <linearGradient id={`grad-${grain}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={isBull ? B_GREEN : B_RED} stopOpacity="0.25" />
            <stop offset="100%" stopColor={isBull ? B_GREEN : B_RED} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathFor(traj)} L${xFor(traj.length - 1)},${h / 2} L${xFor(0)},${h / 2} Z`} fill={`url(#grad-${grain})`} />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_DIM, letterSpacing: "0.06em" }}>
        {days.map((d) => <span key={d}>{d.toUpperCase()}</span>)}
      </div>
    </div>
  );
}

function BHeroThesis() {
  const t = window.BB_DATA.HERO_THESIS;
  const traj = window.BB_DATA.TRAJECTORIES.Canola;

  return (
    <div style={{ position: "relative", overflow: "hidden", border: `1px solid ${B_BORDER_HOT}`, background: `linear-gradient(135deg, ${B_PANEL} 0%, ${B_BG2} 100%)` }}>
      {/* corner gradient glow */}
      <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, background: `radial-gradient(circle, ${B_GREEN}25 0%, transparent 65%)`, pointerEvents: "none" }} />

      <div style={{ position: "relative", padding: "32px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          <span style={{ display: "inline-flex", gap: 14, color: B_TEXT_MUTED }}>
            <span style={{ color: B_GREEN }}>● BULLISH</span>
            <span>HIGH CONF</span>
            <span>16 AGENTS · 4 BULL · 1 BEAR</span>
          </span>
          <span style={{ color: B_TEXT_DIM }}>STANCE/{t.region}/CANOLA · WK17</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 36, alignItems: "start" }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 6 }}>THE WEEK'S CALL</div>
            <h1 style={{ fontFamily: "Fraunces", fontSize: 72, fontWeight: 400, lineHeight: 0.95, letterSpacing: "-0.025em", color: B_TEXT, margin: 0 }}>
              <span style={{ color: B_GREEN }}>Canola</span><br />
              firms hard.
            </h1>
            <p style={{ fontFamily: "DM Sans", fontWeight: 300, fontSize: 17, lineHeight: 1.5, color: B_TEXT_MUTED, maxWidth: 560, marginTop: 22, textWrap: "pretty" }}>
              {t.summary}
            </p>
          </div>

          <div>
            {/* Big stance number */}
            <div style={{ background: B_BG, padding: "20px 24px", border: `1px solid ${B_BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_MUTED, letterSpacing: "0.14em" }}>
                <span>STANCE SCORE</span>
                <span style={{ color: B_GREEN }}>↑ +{t.delta} WoW</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 80, fontWeight: 500, color: B_GREEN, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>
                  +{t.score}
                </span>
                <span style={{ fontSize: 14, color: B_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>/100</span>
              </div>
              <div style={{ marginTop: 18 }}>
                <BSpectrum score={t.score} prior={t.prior} height={12} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_DIM, letterSpacing: "0.1em" }}>
                  <span>BEAR −100</span>
                  <span>0</span>
                  <span>BULL +100</span>
                </div>
              </div>
            </div>

            {/* Mini trajectory */}
            <div style={{ marginTop: 12, background: B_BG, padding: "14px 20px", border: `1px solid ${B_BORDER}` }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_MUTED, letterSpacing: "0.14em", marginBottom: 6 }}>WEEKLY TRAJECTORY · RESETS FRI</div>
              <svg width="100%" viewBox="0 0 320 60" style={{ display: "block" }}>
                <line x1={0} x2={320} y1={30} y2={30} stroke={B_BORDER} strokeWidth={1} strokeDasharray="2 3" />
                {(() => {
                  const arr = traj.ca;
                  const xFor = (i) => 12 + (i / (arr.length - 1)) * 296;
                  const yFor = (s) => 30 - (s / 100) * 26;
                  const d = arr.map((s, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(s)}`).join(" ");
                  return (
                    <>
                      <path d={`${d} L${xFor(arr.length - 1)},30 L${xFor(0)},30 Z`} fill={B_GREEN} fillOpacity={0.18} />
                      <path d={d} fill="none" stroke={B_GREEN} strokeWidth={2} strokeLinejoin="round" />
                      {arr.map((s, i) => <circle key={i} cx={xFor(i)} cy={yFor(s)} r={2.6} fill={B_GREEN} />)}
                    </>
                  );
                })()}
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_DIM, letterSpacing: "0.06em" }}>
                {window.BB_DATA.DAYS.map((d) => <span key={d}>{d.toUpperCase()}</span>)}
              </div>
            </div>
          </div>
        </div>

        {/* Bull/bear panes */}
        <div style={{ marginTop: 32, paddingTop: 28, borderTop: `1px solid ${B_BORDER}`, display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24 }}>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_GREEN, letterSpacing: "0.18em", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 22, height: 1.5, background: B_GREEN }} />
              BULL CASE · 4 DRIVERS
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {t.bull.map((p, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${B_GREEN}`, paddingLeft: 12 }}>
                  <div style={{ fontFamily: "DM Sans", fontSize: 13, fontWeight: 600, color: B_TEXT, marginBottom: 4, lineHeight: 1.35 }}>{p.fact}</div>
                  <div style={{ fontFamily: "DM Sans", fontSize: 11.5, color: B_TEXT_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_RED, letterSpacing: "0.18em", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 22, height: 1.5, background: B_RED }} />
              BEAR CASE · 1 DRIVER
            </div>
            {t.bear.map((p, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${B_RED}`, paddingLeft: 12 }}>
                <div style={{ fontFamily: "DM Sans", fontSize: 13, fontWeight: 600, color: B_TEXT, marginBottom: 4, lineHeight: 1.35 }}>{p.fact}</div>
                <div style={{ fontFamily: "DM Sans", fontSize: 11.5, color: B_TEXT_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BStanceGrid() {
  const all = [
    ...window.BB_DATA.GRAINS_CA.map((g) => ({ ...g, region: "CA" })),
    ...window.BB_DATA.GRAINS_US.map((g) => ({ ...g, region: "US" })),
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 02</div>
          <div style={{ fontFamily: "Fraunces", fontSize: 32, color: B_TEXT, fontWeight: 400, letterSpacing: "-0.015em" }}>Every grain, every market.</div>
        </div>
        <div style={{ display: "flex", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_MUTED }}>
          <span style={{ padding: "5px 10px", background: B_PANEL, border: `1px solid ${B_BORDER_HOT}`, color: B_TEXT, letterSpacing: "0.1em" }}>ALL</span>
          <span style={{ padding: "5px 10px", border: `1px solid ${B_BORDER}`, letterSpacing: "0.1em" }}>CA</span>
          <span style={{ padding: "5px 10px", border: `1px solid ${B_BORDER}`, letterSpacing: "0.1em" }}>US</span>
        </div>
      </div>

      {/* Header */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "60px 1.4fr 80px 2.2fr 100px 60px",
        gap: 16, padding: "10px 16px",
        fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_DIM, letterSpacing: "0.16em",
        background: B_BG2, border: `1px solid ${B_BORDER}`, borderBottom: "none"
      }}>
        <span>REGION</span><span>GRAIN</span><span style={{ textAlign: "right" }}>STANCE</span><span>BEAR ← → BULL</span><span style={{ textAlign: "right" }}>PX</span><span style={{ textAlign: "right" }}>WoW</span>
      </div>

      <div style={{ background: B_PANEL, border: `1px solid ${B_BORDER}`, borderTop: "none" }}>
        {all.map((r, i) => {
          const delta = r.score - r.prior;
          const isBull = r.score > 0;
          return (
            <div key={`${r.region}-${r.grain}`} style={{
              display: "grid",
              gridTemplateColumns: "60px 1.4fr 80px 2.2fr 100px 60px",
              gap: 16, padding: "12px 16px", alignItems: "center",
              borderTop: i === 0 ? "none" : `1px solid ${B_BORDER}`,
              fontFamily: "DM Sans"
            }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: r.region === "CA" ? B_CANOLA : B_AMBER, letterSpacing: "0.14em" }}>{r.region}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: B_TEXT }}>{r.grain}</div>
                <div style={{ fontSize: 10, color: B_TEXT_DIM, fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em", marginTop: 1 }}>
                  {r.bullCount}B · {r.bearCount}b · {r.conf.toUpperCase()}
                </div>
              </div>
              <div style={{
                fontFamily: "ui-monospace, monospace", fontSize: 18, fontWeight: 600,
                color: isBull ? B_GREEN : r.score < 0 ? B_RED : B_TEXT_MUTED,
                fontVariantNumeric: "tabular-nums", textAlign: "right"
              }}>
                {r.score > 0 ? "+" : ""}{r.score}
              </div>
              <BSpectrum score={r.score} prior={r.prior} height={10} />
              <span style={{ textAlign: "right", fontSize: 11, color: B_TEXT, fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>{r.price}</span>
              <span style={{
                textAlign: "right", fontSize: 11, fontWeight: 600,
                color: delta > 0 ? B_GREEN : delta < 0 ? B_RED : B_TEXT_DIM,
                fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums"
              }}>
                {delta > 0 ? "↑" : delta < 0 ? "↓" : "·"}{Math.abs(delta)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BChoroplethUS() {
  const states = window.BB_DATA.SEEDING_US;
  const byCode = Object.fromEntries(states.map((s) => [s.code, s]));
  const fillFor = (pct) => {
    if (pct == null) return "#1a1812";
    if (pct >= 60) return "#62c64f";
    if (pct >= 45) return "#3d9c2c";
    if (pct >= 30) return "#2c6f1f";
    if (pct >= 15) return "#1f4a17";
    return "#1a2a14";
  };
  return (
    <div>
      <svg viewBox="0 0 880 500" style={{ width: "100%", display: "block", fontFamily: "ui-monospace, monospace" }}>
        {Object.entries(window.US_STATES).map(([code, d]) => {
          const focus = byCode[code];
          const fill = focus ? fillFor(focus.pct) : "#15130e";
          return <path key={code} d={d} fill={fill} stroke={B_BG} strokeWidth={1} />;
        })}
        {Object.entries(window.US_LABELS).map(([code, [x, y]]) => {
          const s = byCode[code];
          if (!s) return null;
          return (
            <g key={code}>
              <text x={x} y={y - 2} fontSize={10} fontWeight={700} textAnchor="middle" fill={B_TEXT}>{code}</text>
              <text x={x} y={y + 9} fontSize={9} fontWeight={500} textAnchor="middle" fill={B_TEXT} style={{ fontVariantNumeric: "tabular-nums" }} opacity={0.8}>{s.pct}%</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 0, marginTop: 12, fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_DIM, letterSpacing: "0.1em" }}>
        {[
          ["0–15", "#1a2a14"],
          ["15–30", "#1f4a17"],
          ["30–45", "#2c6f1f"],
          ["45–60", "#3d9c2c"],
          ["60+", "#62c64f"],
        ].map(([label, col]) => (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 6, background: col }} />
            <div>{label}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BSeedingCanada() {
  const provinces = window.BB_DATA.SEEDING_CA;
  return (
    <div>
      {provinces.map((p, i) => (
        <div key={p.code} style={{
          padding: "14px 0", borderTop: i === 0 ? "none" : `1px solid ${B_BORDER}`, fontFamily: "DM Sans"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: B_TEXT }}>{p.name} <span style={{ color: B_TEXT_DIM, marginLeft: 6, fontSize: 10, fontFamily: "ui-monospace, monospace" }}>{p.code}</span></span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 18, fontWeight: 600, color: B_GREEN, fontVariantNumeric: "tabular-nums" }}>{p.pct}%</span>
          </div>
          <div style={{ position: "relative", height: 8, background: B_BG, border: `1px solid ${B_BORDER}` }}>
            <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${p.pct}%`, background: `linear-gradient(90deg, ${B_GREEN_DEEP} 0%, ${B_GREEN} 100%)` }} />
            <div style={{ position: "absolute", left: `${p.fiveYr}%`, top: -3, bottom: -3, width: 1.5, background: B_TEXT, opacity: 0.55 }} title={`5yr avg ${p.fiveYr}%`} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_DIM, letterSpacing: "0.06em" }}>
            <span>PRIOR {p.prior}%</span>
            <span>5YR AVG {p.fiveYr}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BKalshiCard({ k }) {
  const cropColor = k.crop === "CORN" ? B_CANOLA : B_GREEN;
  return (
    <div style={{ padding: "20px 22px", background: B_PANEL, border: `1px solid ${B_BORDER}`, fontFamily: "DM Sans", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.14em" }}>
        <span style={{ color: cropColor, fontWeight: 700 }}>{k.crop} · KALSHI</span>
        <span style={{ color: B_TEXT_DIM }}>CLOSES {k.expires.toUpperCase()}</span>
      </div>
      <div style={{ fontFamily: "Fraunces", fontSize: 18, lineHeight: 1.3, color: B_TEXT, marginBottom: 16, minHeight: 46, textWrap: "pretty" }}>
        {k.title}
      </div>

      {/* Big YES/NO buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ background: B_GREEN_DEEP, border: `1px solid ${B_GREEN}66`, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_GREEN, letterSpacing: "0.18em", fontWeight: 700 }}>YES</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 600, color: B_TEXT, fontVariantNumeric: "tabular-nums" }}>{k.yesPct}¢</span>
        </div>
        <div style={{ background: "#3a1a14", border: `1px solid ${B_RED}55`, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_RED, letterSpacing: "0.18em", fontWeight: 700 }}>NO</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 22, fontWeight: 600, color: B_TEXT, fontVariantNumeric: "tabular-nums" }}>{k.noPct}¢</span>
        </div>
      </div>

      {/* Probability bar */}
      <div style={{ display: "flex", height: 4, marginBottom: 12, background: B_BG }}>
        <div style={{ width: `${k.yesPct}%`, background: B_GREEN }} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_DIM, letterSpacing: "0.08em" }}>
        <span>VOL {k.volume}</span>
        <span style={{ color: k.move.startsWith("+") ? B_GREEN : B_RED }}>
          {k.move.startsWith("+") ? "↑" : "↓"} {k.move.replace(/^[+-]/, "")} WOW
        </span>
      </div>
    </div>
  );
}

function BSpotStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: `1px solid ${B_BORDER}` }}>
      {window.BB_DATA.SPOT.map((s, i) => (
        <div key={s.sym} style={{
          padding: "20px 24px", background: B_PANEL,
          borderRight: i < 2 ? `1px solid ${B_BORDER}` : "none", fontFamily: "DM Sans"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_MUTED, letterSpacing: "0.16em" }}>
            <span>{s.sym.toUpperCase()} · K26</span>
            <span style={{ color: s.up ? B_GREEN : B_RED }}>{s.pct}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 36, fontWeight: 600, color: B_TEXT, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>${s.px}</span>
            <span style={{ fontSize: 11, color: B_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>{s.unit}</span>
          </div>
          <div style={{
            fontSize: 11, marginTop: 6, fontVariantNumeric: "tabular-nums", fontFamily: "ui-monospace, monospace",
            color: s.up ? B_GREEN : B_RED, fontWeight: 600
          }}>
            {s.chg}
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectionBDesktop() {
  return (
    <div style={{ background: B_BG, color: B_TEXT, fontFamily: "DM Sans", minHeight: 1900 }}>
      <BNav />
      <BTicker />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 64px" }}>
        {/* Section heading */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 01 · THE WEEK'S CALL</div>
        </div>
        <BHeroThesis />

        {/* Trajectory grid */}
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <BTrajectoryCard grain="Canola" traj={window.BB_DATA.TRAJECTORIES.Canola.ca} region="CA" />
          <BTrajectoryCard grain="Corn" traj={window.BB_DATA.TRAJECTORIES.Corn.us} region="US" />
          <BTrajectoryCard grain="Soybeans" traj={window.BB_DATA.TRAJECTORIES.Soybeans.us} region="US" />
          <BTrajectoryCard grain="Spring Wheat" traj={window.BB_DATA.TRAJECTORIES["Spring Wheat"].ca} region="CA" />
        </div>

        {/* Stance grid */}
        <div style={{ marginTop: 56 }}>
          <BStanceGrid />
        </div>

        {/* Seeding */}
        <div style={{ marginTop: 64 }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 03</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ fontFamily: "Fraunces", fontSize: 32, fontWeight: 400, color: B_TEXT, margin: 0, letterSpacing: "-0.015em" }}>Seeding pace.</h2>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_DIM, letterSpacing: "0.12em" }}>USDA NASS · STATSCAN · WK ENDING APR 21</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
            <div style={{ background: B_PANEL, border: `1px solid ${B_BORDER}`, padding: 24 }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_MUTED, letterSpacing: "0.14em", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                <span>🇺🇸 CORN — % PLANTED</span>
                <span style={{ color: B_GREEN }}>+8 PTS WOW · LEADING 5YR AVG</span>
              </div>
              <BChoroplethUS />
            </div>
            <div style={{ background: B_PANEL, border: `1px solid ${B_BORDER}`, padding: 24 }}>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_MUTED, letterSpacing: "0.14em", marginBottom: 12 }}>
                🇨🇦 PRAIRIES — % SEEDED
              </div>
              <BSeedingCanada />
            </div>
          </div>
        </div>

        {/* Marketplace */}
        <div style={{ marginTop: 64 }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 04</div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ fontFamily: "Fraunces", fontSize: 32, fontWeight: 400, color: B_TEXT, margin: 0, letterSpacing: "-0.015em" }}>Marketplace.</h2>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_DIM, letterSpacing: "0.12em" }}>● LIVE · KALSHI · CBOT</span>
          </div>
          <p style={{ fontFamily: "DM Sans", fontWeight: 300, fontSize: 15, color: B_TEXT_MUTED, margin: "0 0 20px", maxWidth: 620 }}>
            What the crowd is paying for, in cents on the dollar. Spot futures below.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            {window.BB_DATA.KALSHI.map((k, i) => <BKalshiCard key={i} k={k} />)}
          </div>
          <BSpotStrip />
        </div>

        <div style={{ marginTop: 56, paddingTop: 20, borderTop: `1px solid ${B_BORDER}`, display: "flex", justifyContent: "space-between", fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_TEXT_DIM, letterSpacing: "0.1em" }}>
          <span>BUSHEL BOARD · PREDICTIVE MARKETPLACE</span>
          <span>STANCE/RESET · FRI 04:00 MST · 16 AGENTS · UPDATED 09:14</span>
        </div>
      </div>
    </div>
  );
}

function DirectionBMobile() {
  const t = window.BB_DATA.HERO_THESIS;
  return (
    <div style={{ background: B_BG, color: B_TEXT, fontFamily: "DM Sans", width: 390, minHeight: 1500 }}>
      {/* Mobile nav */}
      <div style={{ borderBottom: `1px solid ${B_BORDER}`, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, background: B_CANOLA, color: B_BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Fraunces", fontSize: 14, fontWeight: 600 }}>B</div>
          <div style={{ fontFamily: "Fraunces", fontSize: 15, fontWeight: 500 }}>Bushel Board</div>
        </div>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_GREEN, letterSpacing: "0.1em" }}>● LIVE</div>
      </div>

      <BTicker />

      <div style={{ padding: "22px 18px" }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 6 }}>THE WEEK'S CALL · WK17</div>
        <h1 style={{ fontFamily: "Fraunces", fontSize: 40, fontWeight: 400, lineHeight: 0.95, letterSpacing: "-0.025em", margin: 0 }}>
          <span style={{ color: B_GREEN }}>Canola</span> firms hard.
        </h1>

        <div style={{ marginTop: 18, background: B_PANEL, padding: 16, border: `1px solid ${B_BORDER}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_TEXT_MUTED, letterSpacing: "0.14em" }}>STANCE SCORE</span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: B_GREEN, fontWeight: 600 }}>↑ +{t.delta} WOW</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 12 }}>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 56, fontWeight: 500, color: B_GREEN, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" }}>+{t.score}</span>
            <span style={{ fontSize: 11, color: B_TEXT_DIM, fontFamily: "ui-monospace, monospace" }}>/100</span>
          </div>
          <BSpectrum score={t.score} prior={t.prior} height={10} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontFamily: "ui-monospace, monospace", fontSize: 8, color: B_TEXT_DIM, letterSpacing: "0.1em" }}>
            <span>BEAR</span><span>0</span><span>BULL</span>
          </div>
        </div>

        <p style={{ fontFamily: "DM Sans", fontWeight: 300, fontSize: 14.5, lineHeight: 1.55, color: B_TEXT_MUTED, marginTop: 16, textWrap: "pretty" }}>
          {t.summary}
        </p>

        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${B_BORDER}` }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_GREEN, letterSpacing: "0.18em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 16, height: 1.5, background: B_GREEN }} />BULL · 4
          </div>
          {t.bull.slice(0, 3).map((p, i) => (
            <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${B_GREEN}`, marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>{p.fact}</div>
              <div style={{ fontSize: 11, color: B_TEXT_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${B_BORDER}` }}>
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_RED, letterSpacing: "0.18em", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 16, height: 1.5, background: B_RED }} />BEAR · 1
          </div>
          {t.bear.map((p, i) => (
            <div key={i} style={{ paddingLeft: 10, borderLeft: `2px solid ${B_RED}` }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>{p.fact}</div>
              <div style={{ fontSize: 11, color: B_TEXT_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Compact stance grid */}
      <div style={{ borderTop: `1px solid ${B_BORDER}`, padding: "20px 18px" }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 02</div>
        <div style={{ fontFamily: "Fraunces", fontSize: 22, fontWeight: 400, marginBottom: 12 }}>Every grain.</div>
        <div style={{ background: B_PANEL, border: `1px solid ${B_BORDER}` }}>
          {[...window.BB_DATA.GRAINS_CA, ...window.BB_DATA.GRAINS_US.slice(0, 3)].map((r, i) => {
            const delta = r.score - r.prior;
            return (
              <div key={r.grain} style={{
                display: "grid", gridTemplateColumns: "1fr 50px 70px", gap: 10, alignItems: "center",
                padding: "10px 12px", borderTop: i === 0 ? "none" : `1px solid ${B_BORDER}`
              }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.grain}</span>
                <span style={{
                  fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 600,
                  color: r.score > 0 ? B_GREEN : r.score < 0 ? B_RED : B_TEXT_MUTED,
                  textAlign: "right", fontVariantNumeric: "tabular-nums"
                }}>{r.score > 0 ? "+" : ""}{r.score}</span>
                <BSpectrum score={r.score} prior={r.prior} height={8} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Seeding */}
      <div style={{ borderTop: `1px solid ${B_BORDER}`, padding: "20px 18px" }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 03</div>
        <div style={{ fontFamily: "Fraunces", fontSize: 22, fontWeight: 400, marginBottom: 12 }}>Seeding pace.</div>
        <div style={{ background: B_PANEL, border: `1px solid ${B_BORDER}`, padding: 14 }}>
          <BChoroplethUS />
        </div>
      </div>

      {/* Marketplace */}
      <div style={{ borderTop: `1px solid ${B_BORDER}`, padding: "20px 18px" }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 9, color: B_CANOLA, letterSpacing: "0.18em", marginBottom: 4 }}>SECTION 04</div>
        <div style={{ fontFamily: "Fraunces", fontSize: 22, fontWeight: 400, marginBottom: 12 }}>Marketplace.</div>
        <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
          {window.BB_DATA.KALSHI.slice(0, 2).map((k, i) => <BKalshiCard key={i} k={k} />)}
        </div>
        <BSpotStrip />
      </div>
    </div>
  );
}

window.DirectionBDesktop = DirectionBDesktop;
window.DirectionBMobile = DirectionBMobile;
