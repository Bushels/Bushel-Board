// Direction A — Editorial / Quiet Confidence
// Typographic, generous whitespace, Fraunces display + DM Sans body
// Wheat/canola palette stays close to current brand

const A_PRAIRIE = "#437a22";
const A_AMBER = "#b8702a";
const A_INK = "#2a261e";
const A_WHEAT_50 = "#f5f3ee";
const A_WHEAT_100 = "#ebe7dc";
const A_WHEAT_200 = "#d7cfba";
const A_WHEAT_400 = "#af9f76";
const A_WHEAT_700 = "#5d5132";
const A_CANOLA = "#c17f24";
const A_INK_MUTED = "#7c6c43";

function ASignalBar({ score, prior, height = 10, showPrior = true }) {
  const abs = Math.abs(score);
  const isBull = score > 0;
  const isBear = score < 0;
  const priorPos = prior !== null && prior !== undefined ? 50 + prior / 2 : null;
  return (
    <div style={{ position: "relative", height, background: A_WHEAT_100, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: A_WHEAT_200, transform: "translateX(-50%)", zIndex: 1 }} />
      {isBull && (
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: `${abs / 2}%`, background: A_PRAIRIE }} />
      )}
      {isBear && (
        <div style={{ position: "absolute", right: "50%", top: 0, bottom: 0, width: `${abs / 2}%`, background: A_AMBER }} />
      )}
      {showPrior && priorPos !== null && prior !== score && (
        <div style={{ position: "absolute", left: `${priorPos}%`, top: -2, bottom: -2, width: 2, background: A_INK, borderRadius: 1, zIndex: 2 }} title={`Prior: ${prior}`} />
      )}
    </div>
  );
}

function ATrajectory({ ca, us, w = 280, h = 90 }) {
  const days = window.BB_DATA.DAYS;
  const yFor = (s) => h / 2 - (s / 100) * (h / 2 - 6);
  const xFor = (i) => 36 + (i / (days.length - 1)) * (w - 56);
  const pathFor = (arr) => arr.map((s, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(s)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }}>
      {/* Zero baseline */}
      <line x1={36} x2={w - 20} y1={h / 2} y2={h / 2} stroke={A_WHEAT_200} strokeWidth={1} />
      {/* Y labels */}
      <text x={4} y={10} fontSize={9} fill={A_PRAIRIE} fontFamily="DM Sans" fontWeight={600}>+100</text>
      <text x={4} y={h / 2 + 3} fontSize={9} fill={A_INK_MUTED} fontFamily="DM Sans">0</text>
      <text x={4} y={h - 2} fontSize={9} fill={A_AMBER} fontFamily="DM Sans" fontWeight={600}>−100</text>
      {/* Friday reset markers */}
      {days.map((d, i) => (
        <g key={d}>
          <line x1={xFor(i)} x2={xFor(i)} y1={h / 2 - 2} y2={h / 2 + 2} stroke={A_WHEAT_400} />
          <text x={xFor(i)} y={h - 2} fontSize={9} textAnchor="middle" fill={A_INK_MUTED} fontFamily="DM Sans">{d}</text>
        </g>
      ))}
      {/* Lines */}
      {ca && (
        <>
          <path d={pathFor(ca)} fill="none" stroke={A_PRAIRIE} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          {ca.map((s, i) => <circle key={i} cx={xFor(i)} cy={yFor(s)} r={2.5} fill={A_PRAIRIE} />)}
        </>
      )}
      {us && (
        <>
          <path d={pathFor(us)} fill="none" stroke={A_AMBER} strokeWidth={1.6} strokeDasharray="3 3" strokeLinejoin="round" strokeLinecap="round" />
          {us.map((s, i) => <circle key={i} cx={xFor(i)} cy={yFor(s)} r={2.5} fill={A_AMBER} />)}
        </>
      )}
    </svg>
  );
}

function AHeroThesis() {
  const t = window.BB_DATA.HERO_THESIS;
  const traj = window.BB_DATA.TRAJECTORIES.Canola;

  return (
    <div style={{ background: "#fff", border: `1px solid ${A_WHEAT_200}`, padding: "40px 44px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, fontFamily: "DM Sans" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600 }}>
          The week's strongest move · Friday Apr 24
        </span>
        <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: A_PRAIRIE, fontWeight: 600 }}>
          ● High confidence
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "end", marginBottom: 28 }}>
        <h1 style={{ fontFamily: "Fraunces", fontWeight: 400, fontSize: 84, letterSpacing: "-0.025em", lineHeight: 0.95, color: A_INK, margin: 0 }}>
          Canola firms <em style={{ color: A_PRAIRIE, fontStyle: "italic" }}>bullish</em>.
        </h1>
        <div style={{ textAlign: "right", fontFamily: "DM Sans" }}>
          <div style={{ fontSize: 11, color: A_INK_MUTED, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Stance</div>
          <div style={{ fontFamily: "Fraunces", fontSize: 56, color: A_PRAIRIE, fontWeight: 500, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>+{t.score}</div>
          <div style={{ fontSize: 11, color: A_PRAIRIE, fontWeight: 600, marginTop: 4 }}>↑ +{t.delta} this week</div>
        </div>
      </div>

      <p style={{ fontFamily: "Fraunces", fontWeight: 300, fontSize: 22, lineHeight: 1.5, color: A_WHEAT_700, maxWidth: 760, margin: "0 0 36px", textWrap: "pretty" }}>
        {t.summary}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, paddingTop: 28, borderTop: `1px solid ${A_WHEAT_200}` }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontFamily: "DM Sans" }}>
            <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_PRAIRIE, fontWeight: 700 }}>Bull case · {t.bull.length}</span>
          </div>
          {t.bull.map((p, i) => (
            <div key={i} style={{ paddingTop: i === 0 ? 0 : 14, paddingBottom: 14, borderTop: i === 0 ? "none" : `1px solid ${A_WHEAT_100}` }}>
              <div style={{ fontFamily: "DM Sans", fontSize: 14, fontWeight: 500, color: A_INK, marginBottom: 4, lineHeight: 1.4 }}>{p.fact}</div>
              <div style={{ fontFamily: "DM Sans", fontSize: 12.5, color: A_INK_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
            </div>
          ))}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontFamily: "DM Sans" }}>
            <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_AMBER, fontWeight: 700 }}>Bear case · {t.bear.length}</span>
          </div>
          {t.bear.map((p, i) => (
            <div key={i} style={{ paddingBottom: 14 }}>
              <div style={{ fontFamily: "DM Sans", fontSize: 14, fontWeight: 500, color: A_INK, marginBottom: 4, lineHeight: 1.4 }}>{p.fact}</div>
              <div style={{ fontFamily: "DM Sans", fontSize: 12.5, color: A_INK_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${A_WHEAT_200}`, display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "center" }}>
        <div style={{ fontFamily: "DM Sans" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600, marginBottom: 6 }}>This week's trajectory</div>
          <div style={{ fontSize: 13, color: A_WHEAT_700 }}>Stance is reset every Friday. Lines drift Mon–Thu as data lands.</div>
        </div>
        <ATrajectory ca={traj.ca} us={null} w={320} h={80} />
      </div>
    </div>
  );
}

function AStanceTable({ rows, region }) {
  const flag = region === "CA" ? "🇨🇦" : "🇺🇸";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20, paddingBottom: 12, borderBottom: `1px solid ${A_WHEAT_200}` }}>
        <span style={{ fontFamily: "Fraunces", fontSize: 22, fontWeight: 500, color: A_INK }}>{flag} {region === "CA" ? "Canadian grains" : "US markets"}</span>
        <span style={{ fontFamily: "DM Sans", fontSize: 11, color: A_INK_MUTED, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {region === "CA" ? "CGC · Wk 17" : "USDA · MY 2026"}
        </span>
      </div>
      <div>
        {rows.map((r, i) => (
          <div key={r.grain} style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 60px 2fr 80px 60px",
            alignItems: "center",
            gap: 16,
            padding: "14px 0",
            borderTop: i === 0 ? "none" : `1px solid ${A_WHEAT_100}`,
            fontFamily: "DM Sans"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: A_INK }}>{r.grain}</div>
              <div style={{ fontSize: 11, color: A_INK_MUTED, marginTop: 2 }}>
                {r.bullCount} bull · {r.bearCount} bear
              </div>
            </div>
            <div style={{
              fontFamily: "Fraunces", fontSize: 22, fontWeight: 500,
              color: r.score > 0 ? A_PRAIRIE : r.score < 0 ? A_AMBER : A_INK_MUTED,
              fontVariantNumeric: "tabular-nums",
              textAlign: "right"
            }}>
              {r.score > 0 ? "+" : ""}{r.score}
            </div>
            <ASignalBar score={r.score} prior={r.prior} height={8} />
            <div style={{ textAlign: "right", fontSize: 12, color: A_INK_MUTED, fontVariantNumeric: "tabular-nums" }}>{r.price}</div>
            <div style={{
              textAlign: "right", fontSize: 11, fontWeight: 600,
              color: r.score - r.prior > 0 ? A_PRAIRIE : r.score - r.prior < 0 ? A_AMBER : A_INK_MUTED,
              fontVariantNumeric: "tabular-nums"
            }}>
              {r.score - r.prior > 0 ? "↑" : r.score - r.prior < 0 ? "↓" : "·"} {Math.abs(r.score - r.prior)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AChoroplethUS() {
  const states = window.BB_DATA.SEEDING_US;
  const byCode = Object.fromEntries(states.map((s) => [s.code, s]));
  // 5-step wheat/prairie ramp
  const fillFor = (pct) => {
    if (pct == null) return "#f5f3ee";
    if (pct >= 60) return "#2c5d18";
    if (pct >= 45) return "#437a22";
    if (pct >= 30) return "#7ba34a";
    if (pct >= 15) return "#c2d68a";
    return "#ebe7dc";
  };
  return (
    <div>
      <svg viewBox="0 0 880 500" style={{ width: "100%", display: "block", fontFamily: "DM Sans" }}>
        {Object.entries(window.US_STATES).map(([code, d]) => {
          const focus = byCode[code];
          const fill = focus ? fillFor(focus.pct) : "#f5f3ee";
          const stroke = focus ? "#fff" : "#e9e3d4";
          return <path key={code} d={d} fill={fill} stroke={stroke} strokeWidth={focus ? 1.5 : 0.8} />;
        })}
        {Object.entries(window.US_LABELS).map(([code, [x, y]]) => {
          const s = byCode[code];
          if (!s) return null;
          const dark = s.pct >= 45;
          return (
            <g key={code}>
              <text x={x} y={y - 2} fontSize={10} fontWeight={700} textAnchor="middle" fill={dark ? "#fff" : A_INK}>{code}</text>
              <text x={x} y={y + 9} fontSize={9} fontWeight={500} textAnchor="middle" fill={dark ? "#fff" : A_INK_MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>{s.pct}%</text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 0, marginTop: 12, fontFamily: "DM Sans", fontSize: 10, color: A_INK_MUTED }}>
        {[
          ["0–15%", "#ebe7dc"],
          ["15–30%", "#c2d68a"],
          ["30–45%", "#7ba34a"],
          ["45–60%", "#437a22"],
          ["60%+", "#2c5d18"],
        ].map(([label, col]) => (
          <div key={label} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ height: 6, background: col }} />
            <div style={{ letterSpacing: "0.05em" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ASeedingCanada() {
  const provinces = window.BB_DATA.SEEDING_CA;
  return (
    <div>
      <div style={{ fontFamily: "DM Sans", fontSize: 12, color: A_INK_MUTED, marginBottom: 16, lineHeight: 1.5 }}>
        Seeding just beginning across the prairies. Manitoba leads — Saskatchewan & Alberta still cool.
      </div>
      {provinces.map((p, i) => (
        <div key={p.code} style={{
          display: "grid", gridTemplateColumns: "32px 1fr 50px",
          alignItems: "center", gap: 14, padding: "12px 0",
          borderTop: i === 0 ? "none" : `1px solid ${A_WHEAT_100}`, fontFamily: "DM Sans"
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: A_WHEAT_700, letterSpacing: "0.08em" }}>{p.code}</div>
          <div>
            <div style={{ fontSize: 13, color: A_INK, marginBottom: 6 }}>{p.name}</div>
            <div style={{ position: "relative", height: 6, background: A_WHEAT_100, borderRadius: 1 }}>
              <div style={{ position: "absolute", inset: "0 auto 0 0", width: `${p.pct}%`, background: A_PRAIRIE, borderRadius: 1 }} />
              <div style={{ position: "absolute", left: `${p.fiveYr}%`, top: -3, bottom: -3, width: 1.5, background: A_INK }} title={`5yr avg ${p.fiveYr}%`} />
            </div>
          </div>
          <div style={{ textAlign: "right", fontFamily: "Fraunces", fontSize: 18, fontWeight: 500, color: A_INK, fontVariantNumeric: "tabular-nums" }}>
            {p.pct}<span style={{ fontSize: 11, color: A_INK_MUTED, marginLeft: 1 }}>%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function AKalshiCard({ k }) {
  const cropColor = k.crop === "CORN" ? "#c17f24" : "#5d8c2f";
  return (
    <div style={{ padding: "20px 22px", background: "#fff", border: `1px solid ${A_WHEAT_200}`, fontFamily: "DM Sans" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.18em", color: cropColor, fontWeight: 700 }}>{k.crop}</span>
        <span style={{ fontSize: 10, color: A_INK_MUTED }}>via Kalshi</span>
      </div>
      <div style={{ fontFamily: "Fraunces", fontSize: 17, lineHeight: 1.3, color: A_INK, marginBottom: 14, minHeight: 44, textWrap: "pretty" }}>
        {k.title}
      </div>
      <div style={{ display: "flex", height: 36, marginBottom: 10, fontWeight: 600, fontSize: 13 }}>
        <div style={{ flex: k.yesPct, background: A_PRAIRIE, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
          YES {k.yesPct}¢
        </div>
        <div style={{ flex: k.noPct, background: A_WHEAT_100, color: A_WHEAT_700, display: "flex", alignItems: "center", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
          NO {k.noPct}¢
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: A_INK_MUTED }}>
        <span>Vol {k.volume}</span>
        <span style={{ color: k.move.startsWith("+") ? A_PRAIRIE : A_AMBER, fontWeight: 600 }}>
          {k.move.startsWith("+") ? "↑" : "↓"} {k.move.replace(/^[+-]/, "")} this week
        </span>
        <span>Closes {k.expires}</span>
      </div>
    </div>
  );
}

function ASpotStrip() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: `1px solid ${A_WHEAT_200}`, background: "#fff" }}>
      {window.BB_DATA.SPOT.map((s, i) => (
        <div key={s.sym} style={{
          padding: "20px 24px", borderRight: i < 2 ? `1px solid ${A_WHEAT_100}` : "none", fontFamily: "DM Sans"
        }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600, marginBottom: 6 }}>{s.sym}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: "Fraunces", fontSize: 32, fontWeight: 500, color: A_INK, fontVariantNumeric: "tabular-nums" }}>${s.px}</span>
            <span style={{ fontSize: 11, color: A_INK_MUTED }}>{s.unit}</span>
          </div>
          <div style={{
            fontSize: 12, marginTop: 4, fontVariantNumeric: "tabular-nums",
            color: s.up ? A_PRAIRIE : A_AMBER, fontWeight: 600
          }}>
            {s.chg} ({s.pct})
          </div>
        </div>
      ))}
    </div>
  );
}

function ANav() {
  return (
    <div style={{ borderBottom: `1px solid ${A_WHEAT_200}`, background: A_WHEAT_50 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "DM Sans" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="assets/wheat-mark.svg" style={{ width: 28, height: 28 }} alt="" />
          <div>
            <div style={{ fontFamily: "Fraunces", fontSize: 19, fontWeight: 500, color: A_INK, lineHeight: 1 }}>Bushel Board</div>
            <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, marginTop: 2 }}>Predictive Marketplace</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 28, fontSize: 13, color: A_WHEAT_700 }}>
          <span style={{ color: A_INK, fontWeight: 600, borderBottom: `2px solid ${A_CANOLA}`, paddingBottom: 4 }}>Overview</span>
          <span>Marketplace</span>
          <span>Seeding</span>
          <span>My Farm</span>
          <span>Bushy</span>
        </nav>
        <div style={{ fontSize: 11, color: A_INK_MUTED, fontFamily: "DM Sans" }}>Friday · Apr 24, 2026</div>
      </div>
    </div>
  );
}

function DirectionADesktop() {
  return (
    <div style={{ background: A_WHEAT_50, color: A_INK, fontFamily: "DM Sans", minHeight: 1800 }}>
      <ANav />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 32px 64px" }}>
        {/* Hero */}
        <div style={{ marginBottom: 16, fontFamily: "DM Sans" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600 }}>This week's stance</div>
          <h2 style={{ fontFamily: "Fraunces", fontSize: 28, fontWeight: 400, color: A_INK, margin: "4px 0 24px", letterSpacing: "-0.01em" }}>
            What our 16 ag-trained agents are saying.
          </h2>
        </div>
        <AHeroThesis />

        {/* All grains tables */}
        <div style={{ marginTop: 64, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}>
          <AStanceTable rows={window.BB_DATA.GRAINS_CA} region="CA" />
          <AStanceTable rows={window.BB_DATA.GRAINS_US} region="US" />
        </div>

        {/* Seeding */}
        <div style={{ marginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
            <h2 style={{ fontFamily: "Fraunces", fontSize: 36, fontWeight: 400, color: A_INK, margin: 0, letterSpacing: "-0.015em" }}>
              Seeding progress
            </h2>
            <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600 }}>USDA NASS · Wk ending Apr 21</span>
          </div>
          <p style={{ fontFamily: "Fraunces", fontWeight: 300, fontSize: 18, color: A_WHEAT_700, margin: "0 0 32px", maxWidth: 720 }}>
            Corn-belt is running a week ahead of the 5-year average. Northern plains and prairies still emerging.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 40, alignItems: "start" }}>
            <div style={{ background: "#fff", border: `1px solid ${A_WHEAT_200}`, padding: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600, marginBottom: 14 }}>🇺🇸 Corn — % planted</div>
              <AChoroplethUS />
            </div>
            <div style={{ background: "#fff", border: `1px solid ${A_WHEAT_200}`, padding: 24 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600, marginBottom: 14 }}>🇨🇦 Prairies — % seeded</div>
              <ASeedingCanada />
            </div>
          </div>
        </div>

        {/* Marketplace */}
        <div style={{ marginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
            <h2 style={{ fontFamily: "Fraunces", fontSize: 36, fontWeight: 400, color: A_INK, margin: 0, letterSpacing: "-0.015em" }}>
              Marketplace
            </h2>
            <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600 }}>Live · Kalshi + CBOT</span>
          </div>
          <p style={{ fontFamily: "Fraunces", fontWeight: 300, fontSize: 18, color: A_WHEAT_700, margin: "0 0 24px", maxWidth: 720 }}>
            Where the crowd is putting money. Prediction contracts on top, spot futures below.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {window.BB_DATA.KALSHI.map((k, i) => <AKalshiCard key={i} k={k} />)}
          </div>
          <ASpotStrip />
        </div>

        <div style={{ marginTop: 80, paddingTop: 24, borderTop: `1px solid ${A_WHEAT_200}`, display: "flex", justifyContent: "space-between", fontFamily: "DM Sans", fontSize: 11, color: A_INK_MUTED }}>
          <span>Bushel Board · Predictive Marketplace for prairie & corn-belt grain</span>
          <span>Stance reset Friday 4am MST · 16 AI agents · Updated 9:14 AM</span>
        </div>
      </div>
    </div>
  );
}

function DirectionAMobile() {
  const t = window.BB_DATA.HERO_THESIS;
  return (
    <div style={{ background: A_WHEAT_50, color: A_INK, fontFamily: "DM Sans", minHeight: 1400, width: 390 }}>
      {/* Mobile nav */}
      <div style={{ borderBottom: `1px solid ${A_WHEAT_200}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="assets/wheat-mark.svg" style={{ width: 24, height: 24 }} alt="" />
          <div style={{ fontFamily: "Fraunces", fontSize: 16, fontWeight: 500 }}>Bushel Board</div>
        </div>
        <div style={{ fontSize: 18, color: A_WHEAT_700 }}>≡</div>
      </div>

      <div style={{ padding: "24px 20px" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: A_INK_MUTED, fontWeight: 600, marginBottom: 4 }}>This week · Friday Apr 24</div>
        <h1 style={{ fontFamily: "Fraunces", fontSize: 38, fontWeight: 400, lineHeight: 1, letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          Canola firms <em style={{ color: A_PRAIRIE }}>bullish</em>.
        </h1>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "12px 0 16px" }}>
          <span style={{ fontFamily: "Fraunces", fontSize: 38, color: A_PRAIRIE, fontVariantNumeric: "tabular-nums" }}>+{t.score}</span>
          <span style={{ fontSize: 12, color: A_PRAIRIE, fontWeight: 600 }}>↑ +{t.delta} WoW</span>
        </div>
        <ASignalBar score={t.score} prior={t.prior} height={10} />
        <p style={{ fontFamily: "Fraunces", fontWeight: 300, fontSize: 16, lineHeight: 1.5, color: A_WHEAT_700, marginTop: 16, textWrap: "pretty" }}>
          {t.summary}
        </p>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${A_WHEAT_200}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: A_PRAIRIE, fontWeight: 700, marginBottom: 12 }}>Bull case · 4</div>
          {t.bull.slice(0, 3).map((p, i) => (
            <div key={i} style={{ paddingTop: i === 0 ? 0 : 12, paddingBottom: 12, borderTop: i === 0 ? "none" : `1px solid ${A_WHEAT_100}` }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{p.fact}</div>
              <div style={{ fontSize: 12, color: A_INK_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, paddingTop: 16, borderTop: `1px solid ${A_WHEAT_200}` }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: A_AMBER, fontWeight: 700, marginBottom: 12 }}>Bear case · 1</div>
          {t.bear.map((p, i) => (
            <div key={i}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{p.fact}</div>
              <div style={{ fontSize: 12, color: A_INK_MUTED, lineHeight: 1.5 }}>{p.reasoning}</div>
            </div>
          ))}
        </div>
      </div>

      {/* All grains compact list */}
      <div style={{ background: "#fff", borderTop: `1px solid ${A_WHEAT_200}`, padding: "20px" }}>
        <div style={{ fontFamily: "Fraunces", fontSize: 20, fontWeight: 500, marginBottom: 4 }}>🇨🇦 All grains</div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: A_INK_MUTED, marginBottom: 14, textTransform: "uppercase" }}>CGC · Wk 17</div>
        {window.BB_DATA.GRAINS_CA.map((r, i) => (
          <div key={r.grain} style={{
            display: "grid", gridTemplateColumns: "1fr 36px 90px", alignItems: "center", gap: 12,
            padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${A_WHEAT_100}`
          }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{r.grain}</div>
            <div style={{
              fontFamily: "Fraunces", fontSize: 18, fontVariantNumeric: "tabular-nums",
              color: r.score > 0 ? A_PRAIRIE : r.score < 0 ? A_AMBER : A_INK_MUTED, textAlign: "right"
            }}>{r.score > 0 ? "+" : ""}{r.score}</div>
            <ASignalBar score={r.score} prior={r.prior} height={6} showPrior={false} />
          </div>
        ))}
      </div>

      {/* Seeding mini */}
      <div style={{ borderTop: `1px solid ${A_WHEAT_200}`, padding: "24px 20px" }}>
        <div style={{ fontFamily: "Fraunces", fontSize: 22, fontWeight: 500, marginBottom: 4 }}>Seeding</div>
        <div style={{ fontSize: 10, letterSpacing: "0.14em", color: A_INK_MUTED, marginBottom: 14, textTransform: "uppercase" }}>USDA · Wk ending Apr 21</div>
        <div style={{ background: "#fff", border: `1px solid ${A_WHEAT_200}`, padding: 12 }}>
          <AChoroplethUS />
        </div>
      </div>

      {/* Marketplace */}
      <div style={{ borderTop: `1px solid ${A_WHEAT_200}`, padding: "24px 20px" }}>
        <div style={{ fontFamily: "Fraunces", fontSize: 22, fontWeight: 500, marginBottom: 14 }}>Marketplace</div>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          {window.BB_DATA.KALSHI.slice(0, 2).map((k, i) => <AKalshiCard key={i} k={k} />)}
        </div>
        <ASpotStrip />
      </div>
    </div>
  );
}

window.DirectionADesktop = DirectionADesktop;
window.DirectionAMobile = DirectionAMobile;
