# InFin — Income Protection for India's Gig Workers

> **Parametric income insurance for Swiggy & Zomato delivery partners.**
> Automated payouts. Zero paperwork. No manual claims.

---

## Table of Contents

- [Abstract](#abstract)
- [Problem](#problem)
- [How It Works](#how-it-works)
- [Engine 1 — Policy Pay (Premium Calculation)](#engine-1--policy-pay)
- [Engine 2 — Policy Claim (4-Gate Validation)](#engine-2--policy-claim)
  - [Gate 1 — Disruption Validity Score (DVS)](#gate-1--disruption-validity-score-dvs)
  - [Gate 2 — Zone Peer Comparison Score (ZPCS)](#gate-2--zone-peer-comparison-score-zpcs)
  - [Gate 3 — Activation Eligibility Check (AEC)](#gate-3--activation-eligibility-check-aec)
  - [Gate 4 — Worker Authenticity Score (WAS)](#gate-4--worker-authenticity-score-was)
- [Ward Affinity System](#ward-affinity-system)
- [Smart Payout Logic](#smart-payout-logic)
- [Anti-Gaming Rules](#anti-gaming-rules)
- [Loyalty Bonus — Chit Fund Model](#loyalty-bonus--chit-fund-model)
- [Security Architecture](#security-architecture)
- [End-to-End Claim Flow](#end-to-end-claim-flow)
- [Policy Document](#policy-document)
- [Database Schema](#database-schema)
- [Tech Stack](#tech-stack)
- [Product Screens](#product-screens)
- [Getting Started](#getting-started)

---

## Abstract

InFin is a parametric income protection ecosystem designed for India’s gig economy, providing an automated safety net for delivery partners against hyper-local disruptions like floods, heatwaves, and strikes. To ensure long-term sustainability and worker trust, InFin operates on a Hybrid Insurance-Chit Fund Model: workers who maintain a 24-week claim-free streak recover up to most of their premiums, turning protection into a low-risk savings habit.

The system is powered by two proprietary engines:

Engine 1 (Policy Pay): Uses a time-series ML model to forecast earnings, applying a Sigmoid-scaled premium formula that dynamically adjusts risk while strictly capping weekly costs at ₹100 to ensure affordability for low-income earners.

Engine 2 (Policy Claim): A 4-Gate validation pipeline that has evolved from broad city-level monitoring to hyper-local Ward-Based Analysis.

### Core Innovations
- Ward Affinity & Compensation Logic: The system identifies a worker's "Prime Ward" through historical data. If a disruption occurs, InFin calculates if the worker could have reasonably compensated for lost earnings by moving to an adjacent, unaffected "Best Ward." Payouts are triggered only when regional disruption makes such compensation impossible.

- Gate 4: Anti-Spoofing via Cell Tower Triangulation: To combat GPS spoofing, InFin introduces a hardware-level validation layer. The system pulls Cell Tower IDs and signal strength via the Android API, performs an OpenCellID lookup, and cross-checks this physical network location against the user’s claimed Ward coordinates.

- Smart Payouts & Anti-Gaming: Includes a Smart Payout Logic that guarantees an income floor and Anti-Gaming Rules (e.g., 6-hour refractory periods) to prevent "on-demand" policy purchases during active disasters.

![WhatsApp Image 2026-04-04 at 22 01 43](https://github.com/user-attachments/assets/5bfef926-8282-4294-bffa-a8c0000415cc)


## Problem

| Pain Point | Reality |
|---|---|
| **Who it's for** | Swiggy / Zomato delivery partners in Indian cities |
| **Daily earnings** | ₹700 – ₹1,100/day |
| **Risk** | Income drops to zero during floods, bandhs, heatwaves, and riots |
| **Why existing insurance fails** | Expensive, tiered, one-size-fits-all, requires paperwork the worker can't afford to do |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        INFIN SYSTEM                         │
│                                                             │
│  ┌──────────────┐              ┌────────────────────────┐   │
│  │  ENGINE 1    │              │       ENGINE 2         │   │
│  │  Policy Pay  │              │     Policy Claim       │   │
│  │              │              │                        │   │
│  │  ML Earnings │              │  Gate 1 → DVS          │   │
│  │  Forecast    │              │  Gate 2 → ZPCS         │   │
│  │      ↓       │              │  Gate 3 → AEC          │   │
│  │  Sigmoid     │              │  Gate 4 → WAS          │   │
│  │  Premium     │              │      ↓                 │   │
│  │  Calc (≤₹100)│              │  Smart Payout          │   │
│  │      ↓       │              │  via UPI               │   │
│  │  Weekly UPI  │              │                        │   │
│  │  Debit       │              │                        │   │
│  └──────────────┘              └────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Engine 1 — Policy Pay

### Expected Earnings Forecast (ML-Based)

Each worker's weekly premium is computed individually from their verified platform earnings and their zone's historical disruption rate. Instead of a static average, InFin predicts each worker's expected daily earnings using a **time-series forecasting model**.

Gig worker income is highly variable:
- Weekends have higher demand
- Weather disruptions reduce earnings
- Seasonal patterns affect delivery volume (monsoon, festivals)

### Model Approach

We use **Exponential Smoothing** trained on a rolling 4-week window:

| Input Signal | Purpose |
|---|---|
| Last 4 weeks of earnings history | Captures recent behaviour |
| Day-of-week patterns | Weekday vs weekend correction |
| Delivery volume trends | Platform-level demand signals |
| Seasonal effects | Monsoon, festival adjustments |

**Output:** `expected_daily_earnings` — ML-predicted value for the next day.

> **Why 4 weeks?** Best balance between recency (captures current behaviour) and stability (reduces noise from one-off events).

---

The full premium formula applies the sigmoid to the **risk-adjusted raw premium** (not directly to EDE), ensuring the S-curve operates in a consistent, bounded domain:

```
raw_premium = EDE × disruption_probability × conflict_ratio × 1.15 / 0.65

weekly_premium = ROUND(
  100 / (1 + e^(-k × (raw_premium - midpoint)))
)
```

```
conflict_ratio = workers_paid_past_4_weeks / workers_who_claimed
```

> **Intuition:** Represents claim pressure in the system. When more workers claim than contribute, the ratio rises — increasing premiums to maintain pool solvency. A healthy system has `conflict_ratio` close to 1.

### Example — Rajan, Chennai

```
EDE               = ₹872
disruption_prob   = 0.0615
conflict_ratio    = 0.70
k                 = 0.005
midpoint          = ₹50 (applied to raw_premium space — not EDE)

raw_premium = ROUND(872 × 0.0615 × 0.70 × 1.15 / 0.65)
            = ₹58

weekly_premium = ROUND(100 / (1 + e^(-0.005 × (58 - 50))))
              = ₹54/week
```

---

## Engine 2 — Policy Claim

### 4-Gate Claim Validation

All claims are fully automated. The worker does nothing. The system runs daily, detects disruptions, and processes payouts end-to-end.

```
┌──────────────────────────────────────────────────────────┐
│               4-GATE VALIDATION PIPELINE                 │
│                                                          │
│  External APIs detect disruption                         │
│          │                                               │
│          ▼                                               │
│  ┌───────────────┐                                       │
│  │    GATE 1     │  DVS ≥ 0.70?                         │
│  │      DVS      │  "Was the disruption real?"           │
│  └──────┬────────┘                                       │
│    PASS │  FAIL → Rejected                               │
│         ▼                                                │
│  ┌───────────────┐                                       │
│  │    GATE 2     │  ZPCS ≥ 0.35?                        │
│  │     ZPCS      │  "Was it zone-wide?"                  │
│  └──────┬────────┘                                       │
│    PASS │  FAIL → Rejected                               │
│         ▼                                                │
│  ┌───────────────┐                                       │
│  │    GATE 3     │  AEC = TRUE?                         │
│  │      AEC      │  "Was the event covered?"             │
│  └──────┬────────┘                                       │
│    PASS │  FAIL → Rejected                               │
│         ▼                                                │
│  ┌───────────────┐                                       │
│  │    GATE 4     │  WAS = Approved / Flagged?            │
│  │      WAS      │  "Is the worker genuine?"             │
│  └──────┬────────┘                                       │
│    PASS │  BLOCKED → Audit                               │
│         ▼                                                │
│  Disruption parameter returns to normal                  │
│          │                                               │
│          ▼                                               │
│  Payout calculated → UPI transfer → WhatsApp notify      │
└──────────────────────────────────────────────────────────┘
```

---

### Gate 1 — Disruption Validity Score (DVS)

**Question:** Did a real external disruption actually occur?

This gate evaluates **only external data sources** — weather APIs, AQI APIs, IMD alerts. No worker data is considered at this stage.

#### DVS Formula

```
DVS = (source_agreement_score × 0.60)
    + (threshold_breach_score × 0.40)
```

#### Source Agreement Score (60%)

| Sources Confirming | Score |
|---|---|
| Both sources confirm | 1.00 |
| Only one source confirms | 0.50 |
| Neither confirms | 0.00 |
| Single-source trigger (e.g. AQI via CPCB only) | 1.00 if API confirms |

#### Threshold Breach Score (40%)

Predefined thresholds per disruption type:

| Trigger | Threshold |
|---|---|
| Rainfall | ≥ 35 mm |
| AQI | ≥ 300 (Hazardous, CPCB scale) |
| Heat Index | ≥ 42°C |

```
threshold_breach_score = min(1.00, ((actual_value − threshold_value) / threshold_value) × 2)
```

| Trigger | Threshold | Actual | Breach Score | Interpretation |
|---|---|---|---|---|
| Rainfall | 35 mm | 37 mm | 0.114 | Borderline |
| Rainfall | 35 mm | 52 mm | 0.971 | Strong disruption |
| Rainfall | 35 mm | 80 mm | 1.00 | Extreme event |

**Pass condition:** `DVS ≥ 0.70`

---

### Gate 2 — Zone Peer Comparison Score (ZPCS)

**Question:** Was the disruption zone-wide — or just one person's claim?

ZPCS compares all delivery workers in the same pincode during the disruption window. If the event was real, most workers in the zone will show reduced activity.

```
ZPCS = (workers_with_≥40%_activity_drop) / (total_active_workers_in_zone)
```

**Pass condition:** `ZPCS ≥ 0.35` (≥ 35% of zone peers show ≥ 40% delivery drop)

> **Threshold Justification:** The 0.35 threshold was selected to balance two failure modes: setting it too high causes false negatives (legitimate claims from moderate disruptions get rejected); setting it too low causes false positives (fraudulent claims pass in partially-affected zones). During pilot, this will be tuned using observed disruption-activity correlation data. Until then, 35% represents a conservative but worker-fair baseline.

> **Key distinction from Gate 4:** ZPCS validates the *event* — it doesn't look at individual behaviour. Gate 4 validates the *individual worker*.

---

### Gate 3 — Activation Eligibility Check (AEC)

**Question:** Was this event actually covered under the policy?

A hard boolean check covering:

| Check | Condition |
|---|---|
| Policy timing | Was the policy purchased **before** the event was publicly announced? |
| Refractory window | Is the worker outside the 6-hour window for spontaneous events? |
| Known-event window | Is the event outside the 72-hour exclusion window at subscription? |

**Pass condition:** `AEC = TRUE`

---

### Gate 4 — Worker Authenticity Score (WAS)

**Question:** Is this worker genuinely present and behaving authentically?

Gate 4 is an **ML-driven anti-spoofing layer** that models each worker as a time-series of behavioural signals. Even if one signal is spoofed, the system remains reliable because signals are drawn from **independent, uncorrelated data sources**.

```
WAS = f(mobility_pattern, peer_consistency, network_behavior, platform_activity)
```

#### Detection Layers

```
┌─────────────────────────────────────────────────────────┐
│                  WAS COMPUTATION                        │
│                                                         │
│  ┌─────────────────────────┐   Weight                  │
│  │  Mobility Pattern       │   35%  ← Ward Affinity    │
│  │  (Ward time vs history) │        feeds here         │
│  └─────────────────────────┘                           │
│  ┌─────────────────────────┐   Weight                  │
│  │  Peer Consistency       │   25%  ← Cluster match    │
│  │  (vs zone workers)      │        vs zone peers      │
│  └─────────────────────────┘                           │
│  ┌─────────────────────────┐   Weight                  │
│  │  Network Behavior       │   20%  ← Cell tower       │
│  │  (Cell tower signals)   │        fingerprint        │
│  └─────────────────────────┘                           │
│  ┌─────────────────────────┐   Weight                  │
│  │  Platform Activity      │   20%  ← Gig platform     │
│  │  (Order patterns)       │        API logs           │
│  └─────────────────────────┘                           │
│                    │                                    │
│                    ▼                                    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  🟢 Approved → Instant payout                   │   │
│  │  🟡 Flagged  → Delayed, re-evaluated            │   │
│  │  🔴 Blocked  → Audit, no payout                 │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Layer 1 — Mobility Pattern Analysis (35%)**
Powered by the Ward Affinity System (see below). Compares the worker's current ward_time distribution against their historical zone fingerprint. Genuine workers are creatures of habit — fraudsters appear in high-risk zones only when disruptions hit.

**Layer 2 — Peer Consistency Modeling (25%)**
Clusters all workers in the claimed zone by ward_time profile. Genuine workers in the same area show similar distributions. Coordinated fraud (multiple accounts faking the same zone) shows unnaturally uniform profiles that diverge from the organic cluster.

**Layer 3 — Network Behavior Modeling (20%)**
GPS can be spoofed — cell towers cannot easily be faked. Models cell tower transitions and signal variance. Real-world signals are noisy and irregular. Spoofed environments show artificially clean, stable tower connections.

**Layer 4 — Platform Activity Modeling (20%)**
Builds baseline profiles from historical delivery data: order acceptance rate, completion times, activity density. Detects unnatural inactivity (fraudster waiting for payout) or unchanged activity levels (contradicts disruption claim).

**Why this works:**

| Signal | Can a fraudster fake it? |
|---|---|
| GPS coordinates | ✅ Yes (GPS spoofing apps exist) |
| Ward time history (weeks of data) | ❌ Requires long-term commitment before any event |
| Cell tower fingerprint | ❌ Phone is physically elsewhere |
| Peer ward distribution | ❌ Requires knowing all other workers' data |
| Platform order logs | ❌ Controlled by Swiggy/Zomato, not the worker |

**WAS Score Decision Boundaries:**

| WAS Score | Label | Action |
|---|---|---|
| ≥ 0.75 | 🟢 Approved | Instant payout triggered |
| 0.50 – 0.74 | 🟡 Flagged | Payout delayed, re-evaluated with additional signals |
| < 0.50 | 🔴 Blocked | Claim sent to human audit queue, no payout |

> Score boundaries calibrated to minimise both false positives (blocking genuine workers) and false negatives (approving fraudulent claims). To be refined using pilot cohort data.

---

## Ward Affinity System

### Overview

To power Gate 4's Mobility Pattern layer, InFin implements a **lightweight time-based location affinity system**. Instead of continuous GPS tracking (computationally expensive and privacy-invasive), the system uses **event-driven, low-frequency sampling with on-device aggregation**.

### Objective

> Estimate a worker's true operating zone by measuring: *"How much time the worker spends in each ward during active delivery periods."*

### Design Principles

- Avoid continuous real-time tracking
- Minimise server load via on-device computation
- Prevent gaming through time-based normalisation
- Maintain scalability for thousands of concurrent users

### System Architecture

```
┌──────────────────────────────────────────────────────────┐
│               WARD AFFINITY PIPELINE                     │
│                                                          │
│  Order Accepted                                          │
│       │                                                  │
│       ▼                                                  │
│  GPS Sample (every 30–60s)                               │
│       │                                                  │
│       ▼                                                  │
│  (lat, lon) → ward_id                                    │
│  [Geohash / GeoJSON polygon lookup]                      │
│       │                                                  │
│       ▼                                                  │
│  On-Device Aggregation                                   │
│  ┌────────────────────────────┐                          │
│  │  if current_ward           │                          │
│  │    == last_ward:           │                          │
│  │    ward_time[ward] += Δt   │                          │
│  │  else:                     │                          │
│  │    last_ward = current_ward│                          │
│  └────────────────────────────┘                          │
│       │                                                  │
│       ▼  (every 5–10 min OR end of order)                │
│  Compressed Transmission to Server                       │
│  {                                                       │
│    "worker_id": "uuid",                                  │
│    "ward_time": {                                        │
│      "ward_Adyar": 1200,                                 │
│      "ward_Mylapore": 800,                               │
│      "ward_Velachery": 300                               │
│    }                                                     │
│  }                                                       │
│       │                                                  │
│  Order Completed → Tracking stops                        │
└──────────────────────────────────────────────────────────┘
```

**Key optimisation:** Raw GPS coordinates never leave the device. Only compressed ward_time summaries are transmitted — protecting privacy while enabling fraud detection.

| Parameter | Value |
|---|---|
| Sampling interval | 30–60 seconds |
| Transmission frequency | Every 5–10 minutes or end of order |
| Tracking scope | Active orders only |
| Data sent to server | ward_time aggregates (not raw GPS) |

---

## Smart Payout Logic

Payout is not all-or-nothing. It compensates for what the worker **would have earned** minus what they **actually earned**, while guaranteeing a minimum income floor.

```
disrupted_expected = (disruption_hours / total_working_hours) × EDE
floor              = 0.5 × disrupted_expected
```

| Scenario | Payout Formula |
|---|---|
| Worker didn't work | `floor` |
| Worked but earned below floor | `(floor − actual_earned) + (0.1 × floor)` |
| Worked and earned at or above floor | ₹0 (already protected) |

### Example

```
EDE                  = ₹800
Disruption duration  = 6 hours
Total working hours  = 8 hours

disrupted_expected   = (6 / 8) × 800 = ₹600
floor                = 0.5 × 600     = ₹300
```

| Scenario | Calculation | Total Income |
|---|---|---|
| Worker stays home | Payout = ₹300 | ₹300 |
| Worker earns ₹100 | Payout = (300−100) + (0.1×300) = ₹230 | ₹330 |
| Worker earns ₹350 | Payout = ₹0 | ₹350 |

> **Effort is rewarded** — a worker who tries always earns more than one who stays home.

---

## Anti-Gaming Rules

| Event Type | Exclusion Rule |
|---|---|
| **Bandh / Strike** | Policy bought after public announcement of the bandh is excluded for that event |
| **Cyclone** | Policy bought after IMD Orange Alert issuance is excluded for that cyclone |
| **Flood** | ML model predicts affected zones; policies bought after flood risk is confirmed are excluded for those pincodes and dates |
| **Spontaneous Events** (riots, Section 144, road closures) | 6-hour refractory period — must be a policyholder at least 6 hours before event onset |
| **Known-event window** | If the disruption was already in the alert snapshot at subscription time and current time is within 72 hours of subscription, the claim is excluded |

---

## Loyalty Bonus — Chit Fund Model

Workers who pay continuously for **24 weeks (6 months)** never truly "lose" their premiums.

| Scenario | Premium Return |
|---|---|
| No claims filed during full term | **80–90%** returned |
| Claims made during term | **10–20%** returned, scaled by claim frequency |

**Streak reset conditions:**
- Missed weekly payment → counter resets to zero
- Any payout received during the term → counter resets to zero

Only an unbroken 24-week streak qualifies. A 48-hour grace period applies after the policy term ends (for settlement processing only — not for coverage extension).

Settlement is triggered automatically and paid via UPI.

---

## Data Integration Strategy

InFin acknowledges that platform earnings data (Swiggy/Zomato order logs, worker earnings) is not publicly available via open APIs. The following graduated integration strategy is planned:

| Phase | Approach |
|---|---|
| **Pilot Phase** | Worker self-uploads (screenshots, PDFs) of weekly earnings summaries from partner apps |
| **Growth Phase** | Formal data-sharing agreements with gig platforms (precedent: NBFC partnerships with Ola/Uber) |
| **Scale Phase** | Real-time API integration via platform partner programme |

**Proxy signals if direct APIs are unavailable:**
- IMD / OpenWeatherMap for disruption detection (already public)
- CPCB AQI API (public)
- Cell tower activity density (via telecom partner MoU)
- Worker-declared earnings cross-validated against zone peer activity

> Absence of direct platform API access delays accuracy — it does not block the system. The gate architecture is designed to function on proxy signals until richer data becomes available.

---

## Risk Pool Model

Premiums collected from active workers are pooled at the zone level to fund automated payouts.

| Pool Mechanism | Details |
|---|---|
| **Collection** | Weekly premiums pooled in a zone-segregated escrow |
| **Diversification** | Risk spread across workers in different wards within each city zone |
| **Reserve Buffer** | 15% of each premium retained as a contingency reserve (the 1.15 loading factor in the formula) |
| **Reinsurance** | Reinsurance layer planned at scale to protect against catastrophic multi-city events (e.g., national floods) |
| **Return Flow** | Undrawn reserves after 24-week chit cycle returned to eligible workers as Loyalty Bonus |

---

## Edge Cases & System Failures

InFin is designed to degrade gracefully, not catastrophically:

| Scenario | System Behaviour |
|---|---|
| **Low worker density in a ward** | ZPCS falls back to city-level peer comparison when fewer than 10 workers are active in the ward |
| **Weather API failure or timeout** | DVS evaluation deferred — event is not rejected; claim held in `pending` state until API recovers |
| **Worker has no earnings history** | EMA falls back to city-median earnings for the platform; clearly disclosed in premium breakdown |
| **Multiple simultaneous disruptions** | Each active event evaluated independently; highest-impact event used for payout calculation |
| **UPI payout failure** | Auto-retry 3× over 24 hours; worker notified via WhatsApp; manual intervention triggered at third failure |
| **Fraudster with long history** | Ward Affinity uses minimum 14-day window — requires consistent historical presence before any coverage |

---

## Unit Economics (Pilot Estimates)

Based on a cohort of gig delivery workers in Chennai and Bengaluru:

| Metric | Estimate |
|---|---|
| Average weekly premium | ₹55 – ₹65 |
| Average claim probability per week | ~6% |
| Expected payout per approved claim | ₹250 – ₹350 |
| Expected claims per 100 worker-weeks | ~6 events |
| Expected payout cost per 100 worker-weeks | ~₹1,800 |
| Expected premium income per 100 worker-weeks | ~₹6,000 |
| Expected gross margin | ~70% (before reinsurance and operations) |
| Effective cost to worker per protected ₹ of income | ₹0.07 – ₹0.10 |

> *These estimates are based on IMD historical disruption frequency data for major delivery cities and published gig worker earnings reports. Actual figures will be refined during pilot.*

---

## Security Architecture

### 1. Data Security

**Encryption**
- All data in transit: TLS 1.3
- All data at rest: AES-256 (Supabase)
- UPI payment data: never stored — only transaction references retained
- Location data: ward_time aggregates only — raw GPS never reaches InFin servers

**Access Control**
- Role-based access control (RBAC) — workers see only their own data
- Supabase Row Level Security (RLS) — access enforced at the database query level, not just the application layer
- Short-expiry JWT tokens on all API calls

**Data Minimisation**
- Raw GPS coordinates computed and discarded on-device
- Platform activity data used only for WAS scoring — not retained long-term
- Ward_time aggregates anonymised before server storage

---

### 2. Financial Security

**Premium Collection**
- Razorpay processes all payment data — InFin never handles raw card credentials
- PCI-DSS compliance inherited from Razorpay
- Weekly auto-debit with explicit worker consent at onboarding

**Payout Security**
- UPI payouts sent only to the verified UPI ID linked at onboarding
- UPI ID changes require OTP re-verification + 72-hour hold before activation
- All payout amounts are formula-driven — no manual override without dual-approval audit log

**Audit Trail**
- Every gate score, pass/fail decision, and payout calculation is immutably logged
- Admin overrides require dual approval and are permanently recorded
- Workers can request a full audit log of their claims at any time via support@infin.com

---

### 3. Identity and Onboarding Security

- Phone OTP verification at signup — no anonymous accounts
- Gig Platform account linking verified against live platform records — cannot fake being a Swiggy/Zomato partner
- Lightweight verification: phone number + platform ID, aligned with current sandbox assumptions for low-ticket parametric products (no full KYC required at this tier)
- **One phone number = one policy** — prevents duplicate account creation

---

### 4. Anti-Fraud Architecture (System-Level)

| Mechanism | What It Prevents |
|---|---|
| Rate limiting on all API endpoints | Bulk spoofing / automated fraud attempts |
| Zone-level claim volume anomaly detection | Sudden 10x claim spikes flagged before any payout |
| Blacklist propagation | Blocked worker's phone, UPI ID, and platform ID all blacklisted simultaneously |
| Velocity checks | One claim per disruption event per worker — regardless of account count |
| WAS (Gate 4) | Individual GPS spoofing, synthetic location, coordinated account fraud |

---

### 5. Transparency and Worker Trust

- **WhatsApp notifications at every gate** — workers know exactly what happened and why, without asking
- **Plain-language gate results** — not "DVS failed" but "We couldn't confirm heavy rain in your area from our weather sources"
- **Self-service audit** — workers can view their own gate scores via the app at any time
- **No black-box decisions** — every rejection has a logged, human-readable reason
- **Grievance escalation** — InFin Grievance Officer → IRDAI Insurance Ombudsman

---

### 6. Infrastructure Security

- Supabase on AWS — inherits AWS SOC 2 compliance
- Supabase Edge Functions in isolated V8 environments — no shared state between workers
- Disruption detection runs on scheduled jobs — no single point of failure
- 24-hour database backups with point-in-time recovery

---

### 7. Regulatory Compliance

- Designed in alignment with IRDAI Regulatory Sandbox Framework (Ref. IRDAI/HLT/REG/CIR/0025/2019)
- Weekly premium model aligned with IRDAI microinsurance guidelines
- Data handling compliant with DPDP Act 2023
- Standard exclusions (war, pandemic, terrorism, nuclear events) documented in the formal policy wording

---

## End-to-End Claim Flow

```
External API detects disruption (weather / IMD / AQI)
                    │
                    ▼
        ┌──────────────────────┐
        │  Gate 1: DVS ≥ 0.70  │ ──FAIL──► Rejected + WhatsApp notify
        └──────────┬───────────┘
                   │ PASS
                   ▼
        ┌──────────────────────┐
        │  Gate 2: ZPCS ≥ 0.35 │ ──FAIL──► Rejected + WhatsApp notify
        └──────────┬───────────┘
                   │ PASS
                   ▼
        ┌──────────────────────┐
        │  Gate 3: AEC = TRUE  │ ──FAIL──► Rejected + WhatsApp notify
        └──────────┬───────────┘
                   │ PASS
                   ▼
        ┌──────────────────────┐
        │  Gate 4: WAS score   │ ──🔴──► Blocked → Audit
        └──────────┬───────────┘
          🟢 PASS  │  🟡 Flagged → Delayed, re-evaluated
                   ▼
        Disruption parameter returns to normal
                   │
                   ▼
        Payout formula computed
                   │
                   ▼
        UPI transfer to worker
                   │
                   ▼
        WhatsApp confirmation sent
```

All steps are fully automated. The worker receives a payout without ever opening the InFin app.

---

## Policy Document

The full standard policy wording (Policy Form No. INFIN-IPP-2026-01) is available in this repository:

📄 **[InFin Standard Policy Wording — INFIN-IPP-2026-01](https://github.com/KasiramSayee/Infin/blob/phase-3/InFin_Policy_Document.docx)**

The policy covers:
- Definitions and scope of coverage
- Qualifying disruption event types and thresholds
- Absolute exclusions (war, pandemic, terrorism, nuclear, health, vehicle)
- Anti-gaming and temporal exclusions
- Fraud and misrepresentation exclusions
- 4-Gate claim validation process
- Benefit calculation formulas
- Chit Fund Loyalty Bonus terms
- Policyholder obligations
- Data privacy (DPDP Act 2023)
- Dispute resolution and grievance mechanism
- Governing law (IRDAI, Chennai jurisdiction)

---

## Database Schema

Built on **Supabase (Postgres + Auth + Realtime)**.

### `workers`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `phone` | text | OTP-verified |
| `platform` | text | Swiggy / Zomato / Amazon etc. |
| `city` | text | |
| `pincode` | text | Insured Zone key |
| `expected_daily_earnings` | numeric | Updated weekly via ML model |
| `disruption_probability` | numeric | Rolling 1-year window |

### `policies`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `worker_id` | uuid (FK → workers) | |
| `weekly_premium` | numeric | Sigmoid-scaled, ≤ ₹100 |
| `status` | text | active / expired / cancelled |
| `plan_duration_months` | int | 3 or 6 |
| `subscribed_at` | timestamptz | |
| `next_due_date` | timestamptz | |

### `ward_affinity`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `worker_id` | uuid (FK → workers) | |
| `ward_id` | text | Mapped from (lat, lon) |
| `total_time_seconds` | int | Cumulative active delivery time |
| `session_date` | date | |
| `updated_at` | timestamptz | |

### `zone_disruption_events`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `pincode` | text | |
| `event_type` | text | flood / cyclone / bandh / heat / aqi |
| `actual_value` | numeric | |
| `threshold_value` | numeric | |
| `dvs_score` | numeric | |
| `dvs_passed` | boolean | |
| `is_announced` | boolean | |
| `is_spontaneous` | boolean | |

### `peer_activity_snapshots`
| Column | Type | Notes |
|---|---|---|
| `event_id` | uuid (FK) | |
| `worker_id` | uuid (FK) | |
| `deliveries_during_trigger` | int | |
| `avg_deliveries_same_window` | numeric | |
| `activity_reduction` | numeric | % drop |
| `is_affected` | boolean | ≥ 40% drop |

### `claims`
| Column | Type | Notes |
|---|---|---|
| `policy_id` | uuid (FK) | |
| `event_id` | uuid (FK) | |
| `dvs_passed` | boolean | |
| `zpcs_passed` | boolean | |
| `aec_passed` | boolean | |
| `was_status` | text | approved / flagged / blocked |
| `was_score` | numeric | |
| `floor_amount` | numeric | |
| `actual_earned` | numeric | |
| `final_payout` | numeric | |
| `status` | text | pending / approved / paid |
| `paid_at` | timestamptz | |

### `loyalty_settlements`
| Column | Type | Notes |
|---|---|---|
| `policy_id` | uuid (FK) | |
| `total_premiums_paid` | numeric | |
| `had_claims` | boolean | |
| `return_percentage` | numeric | |
| `return_amount` | numeric | |
| `settled_at` | timestamptz | |

---

## Use Case Diagram

```mermaid
graph LR
    subgraph Primary_Actor [Primary Actor]
        Worker((Gig Worker))
    end

    subgraph InFin_System [InFin: Income Protection System]
        UC1(Link Platform & Forecast Earnings)
        UC2(Subscribe to Policy via UPI/Razorpay)
        UC3(Monitor Real-time Risk Dashboard)
        UC4(Track Loyalty Bonus & Chit-fund)
        UC5(Execute 4-Gate Claim Validation)
        UC6(Receive Automated Payouts)
        UC7(Get WhatsApp Notifications)
    end

    subgraph Secondary_Actors [Secondary Actors / Systems]
        Plat[Delivery Platforms\nSwiggy / Zomato]
        Data[External Data\nWeather / IMD / AQI]
        Pay[Financial APIs\nUPI / Razorpay]
        Comms[Messaging\nTwilio / WATI]
    end

    Worker --- UC1
    Worker --- UC2
    Worker --- UC3
    Worker --- UC4
    Worker --- UC6
    Worker --- UC7

    UC1 --- Plat
    UC5 --- Data
    UC2 --- Pay
    UC6 --- Pay
    UC7 --- Comms

    style InFin_System fill:#fdfdfd,stroke:#333,stroke-width:2px,stroke-dasharray: 5 5
    style Primary_Actor fill:none,stroke:none
    style Secondary_Actors fill:none,stroke:none
    style UC5 fill:#fff4dd,stroke:#d4a017,font-weight:bold
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js (App Router) |
| **Database** | Supabase (Postgres + Auth + Realtime) |
| **Backend Logic** | Supabase Edge Functions |
| **UI** | Tailwind CSS + shadcn/ui |
| **Payments** | Razorpay (premium collection), UPI (payouts) |
| **Notifications** | WhatsApp via Twilio / WATI |
| **Weather & AQI** | OpenWeatherMap / CPCB AQI APIs |
| **Flood Prediction** | Custom ML model (zone + date level) |
| **Disaster Alerts** | IMD Alert APIs |
| **Ward Mapping** | Geohashing / GeoJSON polygon lookup |
| **Fraud Detection** | Custom WAS ensemble model |
| **Premium Model** | Exponential Smoothing + Sigmoid scaling |

---

## Product Screens

### Worker Dashboard
Active policy card, sigmoid-computed weekly premium, weekly cap remaining, live zone disruption alert banner (Supabase Realtime), and recent claims feed showing gate-by-gate pass/fail results.

### Claim Detail Modal
DVS gauge breakdown, ZPCS peer count visualisation, AEC pass/fail with plain-language reason, WAS score with layer-by-layer breakdown, and step-by-step payout math.

### Policy Subscription (3 Steps)
1. Phone OTP verification
2. Platform account link + earnings fetch
3. Plan selection (3 or 6 months) with loyalty return preview → UPI payment confirm

### Loyalty Tracker
Progress bar, total premiums paid, live return projection for zero-claim vs claim scenarios, countdown to settlement date.

### Admin / Ops Panel
All disruption events with gate scores, claims pipeline (pending → approved → paid), zone heatmap by pincode, WAS flagged claims queue, manual override with dual-approval audit log.

### UI Screenshots

<img width="1906" height="903" alt="Worker Dashboard" src="https://github.com/user-attachments/assets/f0459168-e26d-44de-9e82-f4d4cc2aa11e" />
<img width="684" height="800" alt="Policy Subscription" src="https://github.com/user-attachments/assets/8656b666-a701-424a-afd4-3e50536af6e2" />
<img width="1010" height="806" alt="Claim Detail" src="https://github.com/user-attachments/assets/ace85e81-0bc7-429c-9927-d791329c1c81" />
<img width="1063" height="797" alt="Loyalty Tracker" src="https://github.com/user-attachments/assets/dbeec07e-b904-4569-959e-370a6801e339" />
<img width="1330" height="816" alt="Admin Panel" src="https://github.com/user-attachments/assets/3fc49d6f-ee20-4f85-8c54-df40154064e0" />
<img width="1085" height="806" alt="Zone Heatmap" src="https://github.com/user-attachments/assets/bde1c201-186b-4aa7-a4c4-f855a00c24c2" />

---

## Support & Assistance

InFin provides a dedicated support channel for all worker queries. While the platform is fully automated, human support is always available.

| Channel | Contact |
|---|---|
| **Email** | support@infin.com |
| **Phone** | 1111-4444-3333 (9 AM – 9 PM IST, 7 days) |
| **Grievance Escalation** | support@infin.com → IRDAI Insurance Ombudsman |

Support covers: policy subscription, premium queries, claim validation results, loyalty bonus settlement, and account/technical issues.

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/KasiramSayee/Infin.git
cd infin

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in:
#   VITE_RAZORPAY_KEY_ID
#   RAZORPAY_KEY_ID
#   RAZORPAY_KEY_SECRET
#   TWILIO_ACCOUNT_SID
#   TWILIO_AUTH_TOKEN

# Run database migrations
npx supabase db push

# Start development server
npm run dev
```


---

## What InFin Actually Is

InFin is not simply an insurance system.

> **InFin is a trust infrastructure for uncertain income systems.**

It combines four disciplines into a single, automated pipeline:

| Discipline | InFin Component |
|---|---|
| **Parametric Insurance** | Trigger-based payouts from external data; no claims filed by workers |
| **Behavioural Modeling** | Ward Affinity System + WAS build a historical fingerprint of each worker |
| **Distributed Fraud Detection** | Multi-layer, multi-signal gate architecture prevents any single point of spoofing |
| **Incentive Design** | Chit Fund Loyalty Bonus aligns worker behaviour with long-term platform health |

The result is a system where **honesty is the optimal strategy** — for workers, for the platform, and for the risk pool.

---

*InFin — Protecting the income of India's gig workers.*
*Policy Form INFIN-IPP-2026-01 | Designed in alignment with IRDAI Sandbox Framework*
