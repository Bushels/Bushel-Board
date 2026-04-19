"use client";

import { useEffect, useRef, useState } from "react";
import { getEnrolledAcresClient } from "./trial-client";
import { TrialForm } from "./trial-form";
import { TrialOdometer, type TrialOdometerHandle } from "./trial-odometer";
import "./trial-desk.css";

interface Props {
  initialAcres: number;
}

export function TrialDeskSection({ initialAcres }: Props) {
  const odometerRef = useRef<TrialOdometerHandle | null>(null);
  const [hasRolledToLatest, setHasRolledToLatest] = useState(false);

  useEffect(() => {
    if (hasRolledToLatest) return;
    let cancelled = false;
    (async () => {
      const latest = await getEnrolledAcresClient();
      if (cancelled || latest === initialAcres) return;
      odometerRef.current?.rollTo(latest);
    })();
    setHasRolledToLatest(true);
    return () => {
      cancelled = true;
    };
  }, [hasRolledToLatest, initialAcres]);

  function scrollToSignup() {
    const el = document.getElementById("trial-signup");
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 40;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  return (
    <section className="trial-desk">
      <div className="td-body">
        {/* 1. HERO */}
        <div className="td-hero">
          <div className="coffee-ring" aria-hidden="true" />
          <div className="hero-copy">
            <h2 className="marker-head">
              <span className="line l1">Try our biostimulant</span>
              <span className="line l2">on one of your fields.</span>
            </h2>
            <p className="typewriter-sub">
              A lignin-derived foliar biostimulant. Run it on your own field for the 2026 season.
              <br />
              Cut synthetic nitrogen without cutting yield. Tell us how it went.
            </p>
            <div className="price-tag" aria-label="Trial price">
              <span className="price-tag-hole" />
              <span className="price-tag-lead">2026 Trial Price</span>
              <span className="price-tag-amount">
                $2.80<span className="price-tag-unit">/ac</span>
              </span>
              <span className="price-tag-note">no cap — order as much as you need</span>
            </div>
            <button
              type="button"
              onClick={scrollToSignup}
              className="stamp-cta"
              aria-label="Claim my trial spot"
            >
              <span className="stamp-inner">
                <span className="stamp-line1">Claim My</span>
                <span className="stamp-line2">Trial Spot</span>
                <span className="stamp-star">★</span>
              </span>
            </button>
          </div>

          <div id="trial-odometer-anchor">
            <TrialOdometer ref={odometerRef} initialValue={initialAcres} />
          </div>
        </div>

        {/* 2. STICKY-NOTE BENEFITS */}
        <div className="benefits">
          <h3 className="sr-only">What the biostimulant does</h3>
          <div className="notes">
            <article className="note note-kraft n1">
              <span className="tack" aria-hidden="true" />
              <div className="note-doodle" aria-hidden="true">
                <svg viewBox="0 0 80 60">
                  <path
                    d="M40 5 V25 M40 25 C 30 30, 22 38, 18 52 M40 25 C 50 30, 58 38, 62 52 M40 25 C 38 35, 34 45, 30 55 M40 25 C 42 35, 46 45, 50 55"
                    fill="none"
                    stroke="#3a3a38"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h4>
                Stronger
                <br />
                Root Systems
              </h4>
            </article>

            <article className="note note-yellow n2">
              <span className="tape-bit" aria-hidden="true" />
              <div className="note-doodle" aria-hidden="true">
                <svg viewBox="0 0 80 60">
                  <circle cx="40" cy="30" r="10" fill="none" stroke="#3a3a38" strokeWidth="1.4" />
                  <g stroke="#3a3a38" strokeWidth="1.4" strokeLinecap="round">
                    <line x1="40" y1="8" x2="40" y2="15" />
                    <line x1="40" y1="45" x2="40" y2="52" />
                    <line x1="18" y1="30" x2="25" y2="30" />
                    <line x1="55" y1="30" x2="62" y2="30" />
                    <line x1="24" y1="14" x2="29" y2="19" />
                    <line x1="51" y1="41" x2="56" y2="46" />
                    <line x1="56" y1="14" x2="51" y2="19" />
                    <line x1="29" y1="41" x2="24" y2="46" />
                  </g>
                </svg>
              </div>
              <h4>
                Better Drought
                <br />& Heat Tolerance
              </h4>
            </article>

            <article className="note note-kraft n3">
              <span className="tack teal" aria-hidden="true" />
              <div className="note-doodle" aria-hidden="true">
                <svg viewBox="0 0 80 60">
                  <g fill="none" stroke="#3a3a38" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M40 50 V28" />
                    <circle cx="40" cy="22" r="3" />
                    <circle cx="34" cy="18" r="3" />
                    <circle cx="46" cy="18" r="3" />
                    <circle cx="40" cy="12" r="3" />
                    <circle cx="30" cy="24" r="2.5" />
                    <circle cx="50" cy="24" r="2.5" />
                    <path d="M40 50 C 30 46, 28 42, 30 38" />
                    <path d="M40 50 C 50 46, 52 42, 50 38" />
                  </g>
                </svg>
              </div>
              <h4>
                Healthier Canopy,
                <br />
                Higher Yields
              </h4>
            </article>

            <article className="note note-yellow n4">
              <span className="tape-bit teal" aria-hidden="true" />
              <div className="note-doodle" aria-hidden="true">
                <svg viewBox="0 0 80 60">
                  <g fill="none" stroke="#3a3a38" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M30 12 C 22 24, 22 36, 30 40 C 38 36, 38 24, 30 12 Z" />
                    <circle cx="52" cy="20" r="2" />
                    <circle cx="58" cy="28" r="2" />
                    <circle cx="50" cy="34" r="2" />
                    <circle cx="60" cy="40" r="2" />
                    <circle cx="52" cy="46" r="2" />
                  </g>
                </svg>
              </div>
              <h4>
                Reduce
                <br />
                Fertilizer Usage
              </h4>
            </article>
          </div>

          <div className="masking-tape-aside">
            <span>FOB Calgary — delivery possible.</span>
          </div>
        </div>

        {/* 3. SIGNUP FORM */}
        <div className="signup" id="trial-signup">
          <div className="clipboard">
            <div className="clip" aria-hidden="true">
              <div className="clip-top" />
              <div className="clip-jaw" />
            </div>
            <div className="clipboard-paper">
              <div className="form-header">
                <h3 className="form-title">2026 Trial Sign-Up Sheet</h3>
                <div className="form-sub">Please print clearly.</div>
              </div>
              <TrialForm odometerRef={odometerRef} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
