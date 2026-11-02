---
title: Larkspur Logistics — all content/2 blocks
schema: content/2
purpose: Every content/2 block type and every treatment the layouts draw (docs/S2-content-v2.md, docs/S2-layouts.md), with neutral sample copy for a fictional company. The seed of showcase v2, not the showcase.
---

# Larkspur Logistics

---

label: Investor update
subtitle: Routing regional freight with fewer empty miles
---

# What we cover today

<!-- kind: agenda -->

1. Where the quarter landed
2. How the routing engine works
3. Customers, pricing and the team
4. What we ask of the board

# Where the quarter landed

---

number: "01"
subtitle: Revenue, retention and the miles we no longer drive
---

# Three things carriers buy from us

```items
title: Why carriers switch
items:
  - heading: Fewer empty miles
    body: Return loads are matched before the truck leaves, so a round trip earns on both legs.
    icon: route
  - heading: Same-day settlement
    body: Drivers are paid when the delivery is signed, not thirty days later.
    icon: wallet
  - heading: One dispatch screen
    body: Loads, drivers and documents sit on one board instead of four spreadsheets.
    icon: dashboard
```

# What changed in each region

```subpoints
- heading: Nordics
  lines:
    - Two new cold-chain partners
    - Night routes up 18%
    - Oslo hub at capacity
- heading: Benelux
  lines:
    - Rotterdam port feed live
    - Average dwell time 41 min
- heading: Iberia
  lines:
    - Pilot with 60 owner-drivers
    - Spanish tax forms automated
    - Lisbon depot opens in May
```

# Four numbers from the quarter

```kpis
- value: €4.2M
  heading: Net new annual revenue
  body: Up from €3.1M in Q2, led by cold-chain carriers in the Nordics.
  trend: up
- value: "118%"
  heading: Net revenue retention
  body: Carriers add trucks to the platform faster than others leave.
- value: 23%
  heading: Fewer empty miles
  body: Measured across 1,900 trucks against their routes before onboarding.
- value: 14 d
  heading: Days to onboard a fleet
  body: Down from 31 days after the document import was rebuilt.
```

# One number the board asked about

```kpis
- value: 1.9M
  heading: Empty kilometres avoided this quarter
  body: About 1,400 tonnes of CO₂ that our carriers did not emit.
```

# How a load moves through the platform

```process
shape: cycle
items:
  - heading: Load posted
    body: A shipper posts the pickup, drop-off and time window.
    icon: upload
  - heading: Match found
    body: The engine pairs it with a truck already heading that way.
  - heading: Route planned
    body: Stops, rest breaks and tolls are set in one plan.
  - heading: Delivered
    body: The consignee signs on the driver's phone.
  - heading: Settled
    body: Payment reaches the carrier the same day.
```

# Onboarding a fleet in four steps

```steps
- title: Import
  text: Trucks and drivers come in from the carrier's existing files.
- title: Verify
  text: Licences and insurance are checked against public registers.
- title: Train
  text: Dispatchers get a one-hour session and a test route.
- title: Go live
  text: The first paid load runs within the same week.
```

# The road to 2027

```timeline
- when: Q4 2026
  heading: Iberia rollout
  body: All 60 pilot drivers move to paid plans.
- when: Q1 2027
  heading: Rail handover
  body: Long legs hand over to rail freight where it is cheaper.
- when: Q2 2027
  heading: Carbon ledger
  body: Every load carries its own verified emissions record.
- when: Q4 2027
  heading: Ten countries
  lines:
    - Poland and Czechia first
    - Then the Baltic states
```

# Revenue by quarter

```chart
type: column
categories: [Q4 25, Q1 26, Q2 26, Q3 26]
series:
  - name: Revenue (€M)
    values: [2.1, 2.6, 3.1, 4.2]
highlight: 3
text:
  title: Quarterly revenue
  yAxis: € millions
  source: Larkspur finance, unaudited
```

# Loads by region

```chart
type: bar
categories: [Nordics, Benelux, Iberia, DACH]
series:
  - name: Loads (thousands)
    values: [48, 36, 12, 29]
```

# Where a shipment's cost goes

```chart
type: pie
categories: [Fuel, Driver, Tolls, Platform fee]
series:
  - name: Share of cost
    values: [41, 38, 13, 8]
unit: "%"
```

# Share of loads by contract type

```chart
type: stacked%
categories: [Q1 26, Q2 26, Q3 26]
series:
  - name: Spot
    values: [620, 580, 540]
  - name: Contract
    values: [380, 520, 760]
```

# From quote to signed contract

```chart
type: funnel
categories: [Quotes sent, Trials, Pilots, Contracts]
series:
  - name: Carriers
    values: [420, 160, 70, 38]
```

# Plans side by side

```table
title: What each plan includes
header: [Feature, Starter, Fleet, Network]
rows:
  - [Load matching, true, true, true]
  - [Same-day settlement, false, true, true]
  - [Rail handover, false, false, true]
  - [Trucks included, "10", "100", Unlimited]
highlightColumn: 2
rowHeader: true
```

# What carriers say

```quotes
- text: We used to drive back empty three days a week. Now the return leg pays for the diesel.
  name: Ingrid Solberg
  role: Owner, Solberg Transport
- text: Settlement on the same day changed how we hire. Drivers stay because they are paid on time.
  name: Tomás Ferreira
  role: Operations lead, Ferreira Cargas
- text: The dispatch board replaced four spreadsheets and two phone calls per load.
  name: Anke de Vries
  role: Dispatcher, Delta Koeriers
```

# The team behind the platform

```people
title: Leadership
subtitle: Twelve years of freight and software between them
items:
  - name: Maren Holt
    role: Chief Executive
    bio: Ran dispatch for a 400-truck fleet before founding Larkspur.
  - name: Daniel Okafor
    role: Chief Technology Officer
    bio: Built route optimisation for two European parcel networks.
  - name: Lucía Navarro
    role: Head of Carriers
    bio: Grew the Iberian pilot from six drivers to sixty.
  - name: Jonas Weber
    role: Finance Director
    bio: Previously led settlement at a payments company.
```

# Trusted by shippers and carriers

```logos
title: Customers
rows:
  - [Nordkyst Seafood, Brightwater Dairy, Halvard Timber]
  - [Ostra Retail, Porto Verde, Kessler Bau]
```

# Before and after Larkspur

## Before

- Trucks return empty on most long routes
- Drivers wait thirty days for payment
- Dispatch runs on spreadsheets and phone calls

## After

- Return loads are matched before departure
- Settlement on the day of delivery
- One board for loads, drivers and documents

# Pricing

```compare
tiers: true
columns:
  - header: Starter
    price: €290
    per: per month
    features: [Up to 10 trucks, Load matching, Email support]
  - header: Fleet
    label: Most chosen
    price: €1,900
    per: per month
    features: [Up to 100 trucks, Same-day settlement, Phone support]
  - header: Network
    price: Custom
    features: [Unlimited trucks, Rail handover, Dedicated manager]
```

# Why empty miles matter

---

label: The problem
---

```paragraph
text: A quarter of all truck kilometres in Europe are driven empty. Every empty return leg burns fuel, wears tyres and pays the driver for a trip that earns nothing. Matching a return load before the truck leaves is the single cheapest way for a small carrier to raise its margin.
```

# A driver's day with Larkspur

![Brand imagery sample]({brand.imagery.samples[1]})
Maren's carriers start the day with the full route on their phone: pickups, the return load and the rest stop, planned before the engine starts.

# On the road

```image
treatment: collage
items:
  - src: "{brand.imagery.samples[0]}"
    alt: Brand imagery sample
    caption: Oslo hub at night
  - src: "{brand.imagery.samples[1]}"
    alt: Brand imagery sample
    caption: Loading in Rotterdam
```

# A word from a shipper

> We cut our freight bill by a fifth without changing a single carrier.
> — Henrik Lund, Head of Logistics, Nordkyst Seafood

# From quote to signed contract

```process
shape: funnel
items:
  - heading: Quotes sent
    body: 420 carriers priced a lane with us this quarter.
  - heading: Trials
    body: 160 ran a free week on their own routes.
  - heading: Pilots
    body: 70 moved a full depot onto the board.
  - heading: Contracts
    body: 38 signed a yearly plan.
```

# What a carrier needs before it grows

```process
shape: pyramid
items:
  - heading: Growth
    body: New lanes and more trucks on the board.
  - heading: Margin
    body: Return loads on most long routes.
  - heading: Cash flow
    body: Drivers paid on the day of delivery.
  - heading: Compliance
    body: Licences, insurance and tax forms in order.
```

# The platform in layers

```process
shape: stack
items:
  - heading: Dispatch board
    body: Loads, drivers and documents on one screen.
  - heading: Routing engine
    body: Matches return loads before departure.
  - heading: Settlement
    body: Pays carriers the day a delivery is signed.
  - heading: Data feeds
    body: Port, rail and toll systems in one stream.
```

# One board, every partner

```process
shape: hub
items:
  - heading: Dispatch board
    body: Where every load is planned.
  - heading: Shippers
    body: Post loads and track them live.
  - heading: Carriers
    body: Accept loads that fit their routes.
  - heading: Drivers
    body: Get the route and sign on the phone.
  - heading: Ports and rail
    body: Feed arrival times into the plan.
```

# How a carrier grows with us

```process
shape: ladder
items:
  - heading: First load
    body: One lane, one truck, paid the same day.
  - heading: Regular lanes
    body: Weekly loads on two or three routes.
  - heading: Full fleet
    body: Every truck planned on the board.
  - heading: Partner
    body: Rail handover and shared depots.
```

# Where each region stands

```process
shape: quadrant
items:
  - heading: Nordics
    body: High volume, high margin.
  - heading: Benelux
    body: High volume, thin margin.
  - heading: Iberia
    body: Low volume, growing fast.
  - heading: DACH
    body: Low volume, waiting on rail.
```

# Where our customers overlap

```process
shape: venn
items:
  - heading: Shippers
    body: Post loads and pay per lane.
  - heading: Both
    body: Food groups that run their own trucks.
  - heading: Carriers
    body: Run trucks and pay per seat.
```

# How the team is organised

```process
shape: tree
items:
  - heading: Operations
    body: One plan for every load.
  - heading: Dispatch
    body: Plans the loads each day.
  - heading: Carrier success
    body: Onboards and trains fleets.
  - heading: Settlement
    body: Pays drivers on delivery.
```

# Three feeds, one plan

```process
shape: converge
items:
  - heading: Shipper orders
    body: Pickups, drop-offs, time windows.
  - heading: Truck positions
    body: Live from every phone on the road.
  - heading: Port and rail times
    body: Arrivals from the terminal systems.
  - heading: The day's plan
    body: Every truck routed with a return load.
```

# One delivery, three records

```process
shape: diverge
items:
  - heading: Signed delivery
    body: The consignee signs on the driver's phone.
  - heading: Payment
    body: The carrier is paid the same day.
  - heading: Emissions record
    body: The load's CO₂ is logged and verified.
  - heading: Invoice
    body: The shipper gets one invoice per week.
```

# How a load moves, and why it matters

```process
items:
  - heading: Posted
    body: A shipper posts the pickup and drop-off.
  - heading: Matched
    body: The engine finds a truck heading that way.
  - heading: Delivered
    body: The consignee signs on the driver's phone.
```

- Matching happens before the truck leaves
- Drivers never wait for paperwork
- Shippers see every stop live

# What carriers check first

- Return loads on the routes they drive today
- How fast drivers are paid
- What the board costs per truck

```process
shape: cycle
items:
  - heading: Plan
    body: The day's routes with return loads.
  - heading: Drive
    body: Stops and rest breaks on the phone.
  - heading: Deliver
    body: Signed on the driver's phone.
  - heading: Settle
    body: Paid the same day.
```

# Revenue and what drove it

```chart
type: column
categories: [Q4 25, Q1 26, Q2 26, Q3 26]
series:
  - name: Revenue (€M)
    values: [2.1, 2.6, 3.1, 4.2]
highlight: 3
```

```kpis
- value: €4.2M
  heading: Revenue in Q3
  trend: up
- value: "118%"
  heading: Net revenue retention
  trend: up
- value: 14 d
  heading: Days to onboard a fleet
  trend: down
```

# Two kinds of customer

```items
title: Shippers
items:
  - heading: Post a load
    body: Pickup, drop-off and time window in one form.
  - heading: Track it live
    body: Every stop shows on the map as it happens.
```

```items
title: Carriers
items:
  - heading: Fill the return leg
    body: Loads on the way home, matched before departure.
  - heading: Get paid the same day
    body: Settlement when the consignee signs.
```

# Why we start with empty miles

```paragraph
text: A quarter of all truck kilometres in Europe are driven empty. For a small carrier the return leg decides whether a route makes money, so that is where the platform starts.
```

- Fuel is the largest cost of a route
- Empty legs still pay the driver
- A matched return load costs nothing extra

# Plans and who they are for

```table
header: [Plan, Trucks, Price]
rows:
  - [Starter, Up to 10, €290 a month]
  - [Fleet, Up to 100, "€1,900 a month"]
  - [Network, Unlimited, Custom]
```

```paragraph
text: Most carriers start on Starter for one depot and move to Fleet within two quarters, when every truck is on the board.
```

# A day on the board

![Brand imagery sample]({brand.imagery.samples[0]})

```items
items:
  - heading: 06:00
    body: The day's routes reach every driver's phone.
  - heading: 11:30
    body: A return load is matched for the afternoon.
  - heading: 17:00
    body: Deliveries are signed and settled.
```

# What the board does for a dispatcher

```points
- Plans every route with its return load
- Shows each truck's position live
- Sends the route to the driver's phone
- Collects signatures at each stop
- Checks licences against public registers
- Fills in tax forms for each border
- Settles payment on the day of delivery
- Logs the emissions of every load
```

# Where the margin went this year

```chart
type: waterfall
categories: [2025 margin, Return loads, Settlement fees, Fuel, Tolls, 2026 margin]
series:
  - name: Margin change (€M)
    values: [3.2, 1.4, 0.6, -0.9, -0.3, 4]
text:
  title: Operating margin, 2025 to 2026
  yAxis: € millions
  source: Larkspur finance, unaudited
```

# How carriers rate the board

```chart
type: radar
categories: [Routing, Settlement, Support, Price, Documents, Mobile app]
series:
  - name: Fleet plan
    values: [9, 8, 7, 6, 8, 7]
  - name: Starter plan
    values: [7, 8, 6, 9, 5, 6]
text:
  title: Carrier survey, score out of 10
  source: 412 carriers surveyed in September
```

# How full our trucks run

```chart
type: gauge
categories: [Loaded kilometres, Scale]
series:
  - name: Loaded share
    values: [77, 100]
unit: "%"
text:
  title: Share of kilometres driven loaded
  source: Telematics from 1,900 trucks, Q3 2026
```

# Loads per week by region

```chart
type: line
categories: [W1, W2, W3, W4, W5, W6]
series:
  - name: nordics
    values: [3.1, 3.4, 3.3, 3.9, 4.2, 4.4]
  - name: iberia
    values: [0.8, 0.9, 1.1, 1.2, 1.6, 1.9]
text:
  title: Weekly loads, thousands
  xAxis: Week of the quarter
  yAxis: Loads (thousands)
  legend: [Nordics, Iberia]
  source: Dispatch board export
```

# What each plan gives a 40-truck carrier

```table
title: Plans at a glance
subtitle: Price, support and status for a carrier with 40 trucks
header: [Plan, Trucks, Price a month, Support, Status]
rows:
  - [{type: heading, text: Starter}, {type: number, value: 10}, {type: number, text: "€290"}, {type: rating, value: 3}, {type: chip, text: Self-serve}]
  - [{type: heading, text: Fleet}, {type: number, value: 100}, {type: number, text: "€1,900"}, {type: rating, value: 4}, {type: chip, text: Most chosen}]
  - [{type: heading, text: Network}, {type: text, text: Unlimited}, {type: text, text: Custom}, {type: rating, value: 5}, {type: chip, text: Enterprise}]
```

# Depots on the board

```table
header: [Depot, Site, Anchor shipper, Trucks]
rows:
  - [Oslo, {type: image, src: "{brand.imagery.samples[0]}", alt: Oslo depot}, {type: logo, src: "{brand.imagery.samples[1]}", alt: Nordkyst Seafood}, {type: number, value: 120}]
  - [Rotterdam, {type: image, src: "{brand.imagery.samples[1]}", alt: Rotterdam depot}, {type: logo, src: "{brand.imagery.samples[0]}", alt: Brightwater Dairy}, {type: number, value: 85}]
  - [Lisbon, {type: image, src: "{brand.imagery.samples[0]}", alt: Lisbon depot}, {type: logo, src: "{brand.imagery.samples[1]}", alt: Porto Verde}, {type: number, value: 40}]
highlightColumn: 3
rowHeader: true
```

# Dispatch before and after the board

```compare
columns:
  - header: Spreadsheets and phone calls
    label: Before
    image: "{brand.imagery.samples[0]}"
    items:
      - heading: Return loads matched before departure
        check: false
      - heading: Drivers paid on the day of delivery
        check: false
      - heading: One screen for loads and documents
        body: Four spreadsheets and two calls per load.
        check: false
  - header: One board for every load
    label: After
    image: "{brand.imagery.samples[1]}"
    items:
      - heading: Return loads matched before departure
        check: true
      - heading: Drivers paid on the day of delivery
        check: true
      - heading: One screen for loads and documents
        body: Loads, drivers and documents in one place.
        check: true
```

# The route on the driver's phone

```image
treatment: device
items:
  - src: "{brand.imagery.samples[1]}"
    alt: Brand imagery sample
    caption: The day's route with its return load
```

Every stop, rest break and return load sits on one screen, so the driver never calls dispatch to ask where to go next.

# Night routes out of Oslo

---

label: Nordics
background: "{brand.imagery.samples[0]}"
subtitle: Cold-chain loads leave after 22:00, when the ring roads are empty
---

# Three depots, one board

```image
items:
  - src: "{brand.imagery.samples[0]}"
    alt: Brand imagery sample
    caption: Oslo
  - src: "{brand.imagery.samples[1]}"
    alt: Brand imagery sample
    caption: Rotterdam
  - src: "{brand.imagery.samples[0]}"
    alt: Brand imagery sample
    caption: Lisbon
```

# A carrier on the first year

```quotes
- text: In the first year we added eleven trucks and never once drove back from Bergen empty. The board found the load before we had finished unloading.
  name: Sigrid Haugen
  role: Founder, Haugen Kjøl
  photo: "{brand.imagery.samples[1]}"
  label: Customer story
```

# Certified and audited

```logos
title: Certifications
items:
  - src: "{brand.imagery.samples[0]}"
    heading: ISO 27001
    body: Information security audited every year by an accredited body.
  - src: "{brand.imagery.samples[1]}"
    heading: TAPA TSR
    body: Security requirements for trucks carrying high-value freight.
  - src: "{brand.imagery.samples[0]}"
    heading: SQAS
    body: Safety and quality assessment for chemical transport.
```

# The rollout plan, quarter by quarter

```timeline
- when: Q1 2027
  heading: Start building
  body: The rail handover goes into a closed pilot.
  icon: start-building
  lines: [Two terminals, Forty carriers]
- when: Q2 2027
  heading: First paid lanes
  body: Rail legs are sold on the board.
  icon: get-to-market-faster
  lines: [Oslo to Trondheim, Rotterdam to Duisburg]
- when: Q3 2027
  heading: New revenue
  body: Carbon records are billed per load.
  icon: grow-new-lines-of-revenue
- when: Q4 2027
  heading: Support at scale
  body: A carrier desk in every country.
  icon: support-plans
```

# The market we can reach

```kpis
nested: true
items:
  - value: €38B
    heading: European road freight
    body: Every load moved by truck across the EU and Norway each year.
  - value: €6.1B
    heading: Small carriers
    body: Fleets of 5 to 200 trucks, the carriers the board is built for.
  - value: €420M
    heading: Our five markets by 2028
    body: Nordics, Benelux, Iberia, DACH and Poland at a 7 % share.
```

# A dispatcher's morning, before and after

---

label: Operations
subtitle: Three tasks that used to take the first two hours of every shift
---

- Matching return loads to trucks already on the road
- Checking every driver's licence and insurance
- Sending each route to the driver's phone

# Ride along on a route review

---

kind: cta
cta: Book a route review
---

We will map one of your weekly routes and show the return loads we would have matched.
