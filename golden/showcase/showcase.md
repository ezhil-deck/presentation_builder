---
title: Showcase deck v2
schema: content/2
purpose: The review deck on the content/2 grammar (docs/PLAN-studio.md §3.4). It reads as the brand's own annual review of a B2B software year, with neutral sample copy and realistic, internally consistent numbers; every block type and treatment the layouts draw appears once.
---

# {brand.name}

---

label: Year in review
subtitle: "{brand.tagline}"
---

# What we cover today

<!-- kind: agenda -->

```items
- heading: Where the year landed
  body: Revenue, customers and retention in four numbers
- heading: How the platform works
  body: From the first request to a closed month
- heading: What our customers say
  body: Results, quotes and the people behind them
- heading: Plans and pricing
  body: What each plan includes and who chooses it
- heading: What comes next
  body: The roadmap for 2027 and what we ask of you
```

# Where the year landed

---

number: "01"
subtitle: Revenue, customers and the time our customers got back
---

# How a customer goes live

```process
- heading: Connect
  body: Finance and HR systems link in a single afternoon.
- heading: Configure
  body: Approval rules are set from the customer's own policy.
- heading: Pilot
  body: One team runs real requests for two weeks.
- heading: Go live
  body: Every team moves over, in 14 days on average.
```

# Every request follows the same loop

```process
shape: cycle
items:
  - heading: Request
    body: An employee raises a purchase or an expense.
  - heading: Approve
    body: The right manager signs off on their phone.
  - heading: Pay
    body: Payment goes out on the agreed date.
  - heading: Record
    body: The entry lands in the ledger with its receipt.
  - heading: Review
    body: Finance spots patterns and tightens the rules.
```

# From first call to signed contract

```process
shape: funnel
items:
  - heading: Demo requests
    body: 4,800 teams asked to see the platform this year.
  - heading: Trials
    body: 1,150 ran it on their own data for two weeks.
  - heading: Pilots
    body: 620 moved a full department over.
  - heading: New customers
    body: 430 signed an annual plan this year.
```

# Why teams go live in two weeks

```process
- heading: Import
  body: Users, cost centers and suppliers come in from files.
- heading: Map the policy
  body: Spending limits become approval rules in one session.
- heading: Go live
  body: Requests flow through the platform from day one.
```

- Templates for the 20 most common approval policies
- A named onboarding lead for every customer
- Old approvals stay searchable after the switch

# How a payment leaves the account

```process
- heading: Checked
  body: Amount and bank details are matched to the policy.
- heading: Approved
  body: Two approvers sign off on anything above $10,000.
- heading: Paid
  body: The payment runs on the agreed date.
```

- Bank details verified whenever they change
- Every step kept in the audit trail

```paragraph
text: Payments are where mistakes cost the most, so every rule a customer sets is checked before the money moves, not after the month has closed and the money is gone.
```

# Three reasons teams choose the platform

```items
items:
  - heading: A faster month-end close
    body: The close takes four days instead of nine, because every entry arrives with its receipt and approval.
    icon: speed
  - heading: Spend under control
    body: Every request is checked against the policy before money leaves the account.
    icon: shield
  - heading: One view of the business
    body: Finance, operations and leadership read the same numbers, updated every hour.
    icon: chart
```

# What the platform covers

```items
- heading: Purchase requests
  body: Raised in one form and routed to the right approver.
- heading: Expenses
  body: Receipts read from a photo and matched to the card.
- heading: Supplier invoices
  body: Captured from email and paid on the due date.
- heading: Corporate cards
  body: Limits per person, frozen in one click.
- heading: Budgets
  body: Spend tracked against plan for every team.
- heading: Audit trail
  body: Who approved what, and when, kept for seven years.
```

# Five things we learned this year

1. Customers who connect payroll in their first week stay longer
2. Approvals on a phone are signed three times faster than by email
3. Mid-market teams grow fastest once a second department joins
4. Most support questions arrive in a customer's first 30 days
5. Clear pricing shortens the sales cycle by about two weeks

# What changed in each segment

```subpoints
- heading: Small business
  lines:
    - 860 customers, up 25%
    - Self-serve sign-up launched
    - Median plan of 18 seats
- heading: Mid-market
  lines:
    - 540 customers, up 34%
    - Two departments on average
    - Payroll linked in week one
- heading: Enterprise
  lines:
    - 210 customers, up 40%
    - Single sign-on and audit exports
    - Live in three regions
```

# One number for the year

```kpis
- value: 42%
  heading: Growth in annual recurring revenue
  body: From $18.4M to $26.1M, with almost half of the new revenue coming from customers who were already with us.
```

# The year in four numbers

```kpis
- value: $26.1M
  heading: Annual recurring revenue
  trend: up
- value: "1,610"
  heading: Customers at year end
  trend: up
- value: 118%
  heading: Net revenue retention
- value: 14 days
  heading: Median time to go live
  trend: down
```

# What our customers got back

```kpis
- value: 4 days
  heading: To close the month
  body: Down from nine days for the median customer after six months on the platform.
  image: "{brand.imagery.samples[0]}"
- value: 6 h
  heading: Saved per finance person each week
  body: Time no longer spent chasing receipts and approvals by email.
  image: "{brand.imagery.samples[1]}"
- value: 99.98%
  heading: Platform uptime
  body: Across the whole year, with no incident longer than eleven minutes.
  image: "{brand.imagery.samples[2]}"
```

# Revenue grew every quarter

```chart
type: column
categories: [Q1, Q2, Q3, Q4]
series:
  - name: Revenue ($M)
    values: [5.1, 5.6, 6.0, 6.5]
highlight: 3
text:
  title: Recognized revenue by quarter, 2026
  yAxis: $ millions
  source: Finance, fourth quarter unaudited
```

# Customers by segment

```chart
type: bar
categories: [Small business, Mid-market, Enterprise]
series:
  - name: Customers
    values: [860, 540, 210]
text:
  title: Customers at year end
  source: Billing system, December 31
```

# Customers go live faster

```chart
type: line
categories: [Jan, Mar, May, Jul, Sep, Nov]
series:
  - name: Median days to go live
    values: [31, 27, 22, 19, 16, 14]
text:
  title: Median days from contract to go-live
  xAxis: Month signed
  yAxis: Days
  source: Onboarding records
```

# Revenue by region

```chart
type: donut
categories: [North America, Europe, Asia Pacific]
series:
  - name: Share of revenue
    values: [54, 31, 15]
unit: "%"
text:
  title: Share of 2026 revenue
```

# Where the new revenue came from

```chart
type: stacked
categories: [Q1, Q2, Q3, Q4]
series:
  - name: New customers
    values: [0.9, 1.0, 1.2, 1.3]
  - name: Expansion
    values: [0.8, 1.0, 1.1, 1.4]
text:
  title: New annual recurring revenue by quarter
  yAxis: $ millions
```

```kpis
- value: $4.4M
  heading: From new customers
- value: $4.3M
  heading: From existing customers
- value: 5.4%
  heading: Gross revenue churn
  trend: down
```

# Support kept pace with growth

```chart
type: area
categories: [Q1, Q2, Q3, Q4]
series:
  - name: Minutes
    values: [42, 35, 28, 21]
text:
  title: Median first response, minutes
  source: Support desk
```

```kpis
- value: 94%
  heading: Satisfied with support
- value: 21 min
  heading: First response in Q4
  trend: down
```

```paragraph
text: We doubled the support team in Europe and moved the most common questions into the product, so most customers now find the answer before they need to ask.
```

# What each plan includes

```table
title: Plans at a glance
header: [Feature, Starter, Growth, Enterprise]
rows:
  - [Approval workflows, true, true, true]
  - [Expense capture, true, true, true]
  - [Supplier invoices, false, true, true]
  - [Single sign-on and audit exports, false, false, true]
  - [Support, {type: rating, value: 2}, {type: rating, value: 4}, {type: rating, value: 5}]
highlightColumn: 2
rowHeader: true
```

# Month-end, before and after

```compare
columns:
  - header: Spreadsheets and email
    label: Before
    image: "{brand.imagery.samples[0]}"
    items:
      - heading: Receipts attached at the source
        body: Finance spends the first week of each month collecting paperwork.
        check: false
      - heading: Approvals on the phone
        check: false
      - heading: Close in four days
        check: false
  - header: One platform for every request
    label: After
    image: "{brand.imagery.samples[1]}"
    items:
      - heading: Receipts attached at the source
        body: Every expense arrives with its receipt and its approval.
        check: true
      - heading: Approvals on the phone
        check: true
      - heading: Close in four days
        check: true
```

# Plans and pricing

```compare
tiers: true
columns:
  - header: Starter
    price: $12
    per: per user, per month
    features: [Up to 25 users, Approval workflows, Email support]
  - header: Growth
    label: Most chosen
    price: $29
    per: per user, per month
    features: [Up to 250 users, Supplier invoices, Phone support]
  - header: Enterprise
    price: Custom
    per: annual contract
    features: [Unlimited users, Single sign-on and audit exports, A named account team]
```

# What customers told us

```quotes
- text: We closed the year in four days for the first time. Nobody on my team chased a single receipt in December.
  name: Siti Rahmawati
  role: Head of Finance, retail group
- text: Approvals used to sit in inboxes for a week. Now managers sign off on their phones before lunch.
  name: Omar Haddad
  role: Operations Director, logistics firm
- text: Setup took one afternoon. The audit export alone saved us two weeks with our auditors this spring.
  name: Mei Lin
  role: IT Lead, healthcare provider
```

# A customer's first year

```quotes
- text: In the first year we moved four departments onto the platform and cut the close from ten days to four. Our auditors now ask for the export instead of the binders.
  name: Kenji Watanabe
  role: Financial Controller, manufacturer
  photo: "{brand.imagery.samples[3]}"
  label: Customer story
```

# The team behind the platform

```people
- name: Priya Raman
  role: Chief Executive Officer
  bio: Led finance operations at two software companies before founding ours.
- name: Daniel Okafor
  role: Chief Technology Officer
  bio: Built payment systems used by thousands of businesses on three continents.
- name: Lucía Herrera
  role: VP, Customer Success
  bio: Grew the onboarding team from four people to forty and halved the time to go live.
- name: Tomasz Nowak
  role: Chief Financial Officer
  bio: Runs our own finance on the platform and closes the books in three days.
```

# How the year unfolded

```timeline
- when: Q1 2026
  heading: Self-serve sign-up
  body: Small teams can start a trial without talking to sales.
- when: Q2 2026
  heading: Mobile approvals
  body: Managers approve requests from a phone notification.
- when: Q3 2026
  heading: Supplier invoices
  body: Invoices are read from email and paid on their due date.
- when: Q4 2026
  heading: European data center
  body: Customer data can stay inside the European Union.
```

# The road to 2027

```timeline
- when: Jan 2027
  heading: Budget planning
  lines: [Plans for every team, Alerts on overspend]
- when: Mar 2027
  heading: Card controls
  lines: [Limits per merchant, Freeze in one tap]
- when: May 2027
  heading: Payroll sync
  lines: [Two-way sync, Five payroll systems]
- when: Jul 2027
  heading: Asia Pacific
  lines: [Singapore region, Local currencies]
- when: Sep 2027
  heading: Cash forecasting
  lines: [Thirteen-week forecast, Monthly scenarios]
- when: Nov 2027
  heading: Partner network
  lines: [Accounting firms, Shared client view]
```

# Trusted across six industries

```logos
title: Our customers by industry
rows:
  - [Retail, Logistics, Healthcare]
  - [Manufacturing, Financial services, Hospitality]
```

# Certified and audited

```logos
title: Certifications
items:
  - heading: ISO 27001
    body: Information security audited every year by an accredited body.
  - heading: SOC 2 Type II
    body: Security and availability controls tested over twelve months.
  - heading: GDPR
    body: Data processing agreements and EU data residency for every customer.
```

# Built for the people who close the books

---

label: Our customers
background: "{brand.imagery.samples[0]}"
subtitle: Finance and operations teams in 1,610 companies run their month on the platform
---

# A year with our customers

```image
items:
  - src: "{brand.imagery.samples[0]}"
    alt: Brand imagery sample
    caption: Onboarding day
  - src: "{brand.imagery.samples[1]}"
    alt: Brand imagery sample
    caption: Month-end review
  - src: "{brand.imagery.samples[2]}"
    alt: Brand imagery sample
    caption: Customer summit
  - src: "{brand.imagery.samples[3]}"
    alt: Brand imagery sample
    caption: Support team
```

# Why we start with approvals

```paragraph
text: Every payment, purchase and expense passes through an approval first. When that step is fast and checked against the policy, everything after it gets easier, from paying suppliers on time to closing the month in days instead of weeks.
```

```process
- heading: Approve
  body: Requests checked against the policy as they arrive.
- heading: Pay
  body: Suppliers and employees paid on the agreed date.
- heading: Close
  body: The ledger is ready when the month ends.
```

# Where each segment stands

```process
shape: quadrant
items:
  - heading: Enterprise
    body: Fewest customers, largest contracts.
  - heading: Mid-market
    body: Fastest growth once a second team joins.
  - heading: Small business
    body: Most customers, mostly self-serve.
  - heading: Partners
    body: Accounting firms that bring their clients.
```

# Where finance and operations meet

```process
shape: venn
items:
  - heading: Finance
    body: Owns the policy, the ledger and the close.
  - heading: Shared ground
    body: Approvals, budgets and supplier payments.
  - heading: Operations
    body: Raises requests and runs the suppliers.
```

# Sources for this review

```items
- heading: Finance records
  body: Revenue and recurring revenue from the ledger; the fourth quarter is unaudited.
- heading: Customer survey
  body: 412 customers answered in October, a response rate of 26%.
- heading: Onboarding records
  body: Days to go live for the 430 customers who joined this year.
- heading: Status page
  body: Uptime and incident minutes logged by our monitoring system.
```

# Thank you

---

label: "{brand.name}"
subtitle: Questions, next steps and the plan for 2027
cta: Book a planning session
---
