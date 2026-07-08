
    const { useState, useEffect, useMemo, useRef } = React;

    /* =================================================================
       GAMIFICATION — ranks, XP, badges, sound, profile persistence
       ================================================================= */
    const RANKS = [
      { xp: 0,    name: "Cadet",              icon: "▮" },
      { xp: 200,  name: "Flight Trainee",     icon: "▮▮" },
      { xp: 450,  name: "Pilot",              icon: "▮▮▮" },
      { xp: 800,  name: "Mission Specialist", icon: "◆" },
      { xp: 1150, name: "Commander",          icon: "◆◆" },
      { xp: 1500, name: "Flight Director",    icon: "★" }
    ];
    const MODULE_BADGES = {
      1: { icon: "🚀", name: "Rocket Scientist" },
      2: { icon: "🛰️", name: "Orbit Achiever" },
      3: { icon: "🧭", name: "Orbit Architect" },
      4: { icon: "⚙️", name: "Spectrum Specialist" },
      5: { icon: "💼", name: "Space Tycoon" }
    };
    function rankFor(xp) {
      let idx = 0;
      RANKS.forEach((r, i) => { if (xp >= r.xp) idx = i; });
      return { ...RANKS[idx], index: idx, next: RANKS[idx + 1] || null };
    }

    const PROFILE_KEY = "orbitAcademyProfile.v1";
    function loadProfile() {
      try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (raw) return { xp: 0, badges: [], muted: false, ...JSON.parse(raw) };
      } catch (e) {}
      return { xp: 0, badges: [], muted: false };
    }
    function saveProfile(p) {
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch (e) {}
    }

    /* Tiny WebAudio synth — no audio files needed */
    const sfx = (() => {
      let ctx = null;
      const SEQ = {
        correct:  [[660, 0, 0.10, "triangle"], [880, 0.09, 0.16, "triangle"]],
        wrong:    [[170, 0, 0.22, "sawtooth"], [120, 0.1, 0.2, "sawtooth"]],
        click:    [[520, 0, 0.05, "triangle"]],
        levelup:  [[523, 0, 0.1, "triangle"], [659, 0.1, 0.1, "triangle"], [784, 0.2, 0.1, "triangle"], [1047, 0.3, 0.28, "triangle"]],
        complete: [[392, 0, 0.14, "triangle"], [523, 0.12, 0.14, "triangle"], [659, 0.24, 0.14, "triangle"], [784, 0.36, 0.34, "triangle"]],
        badge:    [[880, 0, 0.09, "sine"], [1174, 0.09, 0.2, "sine"]]
      };
      function play(name) {
        try {
          ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
          if (ctx.state === "suspended") ctx.resume();
          const now = ctx.currentTime;
          (SEQ[name] || []).forEach(([f, off, dur, type]) => {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type; o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, now + off);
            g.gain.exponentialRampToValueAtTime(0.14, now + off + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, now + off + dur);
            o.connect(g); g.connect(ctx.destination);
            o.start(now + off); o.stop(now + off + dur + 0.05);
          });
        } catch (e) {}
      }
      return { play };
    })();

    /* WebGL + three.js availability (3D scenes fall back to SVG/CSS without it) */
    const HAS_WEBGL = (() => {
      try {
        if (!window.THREE) return false;
        const c = document.createElement("canvas");
        return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
      } catch (e) { return false; }
    })();

    /* =================================================================
       CONTENT — all five modules, lessons and quizzes, inline.
       ================================================================= */
    const MODULES = [
      /* -------------------- MODULE 1 -------------------- */
      {
        id: 1, accent: "#4AF0E0",
        title: "How Rockets Work",
        subtitle: "The basics: why a rocket is not a very fast plane.",
        lessons: [
          {
            tab: "Why rockets are special",
            blocks: [
              { type: "p", text: `A car burns petrol using oxygen pulled from the air around it. A jet plane does the same — it scoops in air, mixes it with fuel, and burns it. Both completely depend on the atmosphere. A rocket has to work where there is no atmosphere at all: space.` },
              { type: "term", term: "Oxidiser", plain: `Think of a campfire. The wood is the fuel, but it only burns because there's air (oxygen) around it. In space there is no air — so a rocket must bring its own "air" along.`, def: `An <b>oxidiser</b> is the substance a rocket carries to supply the oxygen its fuel needs to burn. No oxidiser, no fire.` },
              { type: "p", text: `This is the single biggest difference between a rocket and a jet engine. A jet engine breathes the air around it. A rocket cannot — so it must carry both the fuel and the oxygen needed to burn that fuel.` },
              { type: "insight", text: `A rocket carries everything it needs to make fire: the fuel AND the oxygen. That's why it keeps thrusting in the vacuum of space, where a jet engine would simply choke.` }
            ]
          },
          {
            tab: "Propellant: fuel + oxidiser",
            blocks: [
              { type: "term", term: "Propellant", plain: `Back to the campfire: you need wood AND air to make a fire. A rocket's "wood + air" combo has a name.`, def: `<b>Propellant</b> is the combination of FUEL (the part that burns) and OXIDISER (the part that makes it burn). Together they are what the engine consumes to make thrust.` },
              { type: "p", text: `On Isar Aerospace's Spectrum rocket, the two ingredients are kept extremely cold so they stay liquid and pack tightly into the tanks:` },
              { type: "specs", items: [
                { k: "Fuel", v: "Liquid propane, chilled to –42 °C" },
                { k: "Oxidiser", v: "Liquid oxygen (LOX), chilled to –183 °C" }
              ]},
              { type: "p", text: `The fuel and oxidiser sit in separate tanks and only meet inside the engine, at the moment of combustion. Keeping them apart until the last second is what keeps the rocket safe on the launch pad.` },
              { type: "insight", text: `About 90% of a rocket's weight at launch is propellant. A rocket is essentially a giant flying fuel tank with an engine on the bottom and a tiny payload on top.` }
            ]
          },
          {
            tab: "Thrust & anatomy",
            blocks: [
              { type: "h", text: "Making thrust" },
              { type: "p", text: `Inside the engine, fuel and oxidiser combust at around 3,000 °C. That violently hot gas is forced out of the nozzle at over 3,000 metres per second. As the gas shoots downward, the rocket is pushed upward.` },
              { type: "analogy", text: `Blow up a balloon and let go without tying it. The air rushes out of the neck one way, and the balloon flies off the other way. A rocket is the same idea — it throws mass (hot gas) out the back and gets pushed forward in return.` },
              { type: "term", term: "Thrust — Newton's Third Law", plain: `For every push there's an equal push back the other way — like stepping off a skateboard sends the board rolling backwards.`, def: `<b>Thrust</b> is the forward force created when the engine throws exhaust gas backwards. Newton's Third Law: every action has an equal and opposite reaction.` },
              { type: "h", text: "Anatomy of a rocket (tap each part)" },
              { type: "rocketDiagram" }
            ]
          }
        ],
        quiz: [
          { q: "Why can't a jet engine work in space?", options: ["It gets too cold to ignite", "There is no air to breathe for combustion", "Gravity is too strong", "The fuel freezes solid"], answer: 1, explain: "A jet engine scoops in air to get oxygen. In the vacuum of space there's no air, so it has nothing to burn its fuel with." },
          { q: "What is 'propellant'?", options: ["Just the fuel a rocket burns", "The combination of fuel and oxidiser", "The exhaust gas leaving the nozzle", "The nose cone protecting the satellite"], answer: 1, explain: "Propellant = FUEL (what burns) + OXIDISER (what makes it burn). A rocket must carry both." },
          { q: "On the Spectrum rocket, what is used as the oxidiser?", options: ["Liquid propane", "Liquid hydrogen", "Liquid oxygen (LOX)", "Compressed air"], answer: 2, explain: "Spectrum's oxidiser is liquid oxygen (LOX), chilled to –183 °C. The fuel is liquid propane at –42 °C." },
          { q: "Which principle explains how a rocket produces thrust?", options: ["Newton's Third Law", "The law of gravity", "Bernoulli's principle", "Conservation of mass"], answer: 0, explain: "The engine throws hot gas backwards; Newton's Third Law means an equal and opposite force pushes the rocket forward — just like an untied balloon." },
          { q: "Roughly what fraction of a rocket's weight at launch is propellant?", options: ["About 30%", "About 50%", "About 70%", "About 90%"], answer: 3, explain: "Around 90% of launch weight is propellant. The rocket is basically a giant fuel tank with a small payload on top." }
        ]
      },

      /* -------------------- MODULE 2 -------------------- */
      {
        id: 2, accent: "#FF7A45",
        title: "Getting to Orbit",
        subtitle: "Orbit isn't about height — it's about going sideways fast.",
        lessons: [
          {
            tab: "What orbit really means",
            blocks: [
              { type: "p", text: `Most people think being in orbit just means being very high up. It doesn't. The International Space Station orbits at only 400 km — if you could drive straight up, you'd be there in about four hours. Height is the easy part.` },
              { type: "term", term: "Orbital velocity", plain: `Imagine throwing a ball. Throw it harder and it lands further away. Throw it impossibly hard and the ground curves away beneath it as fast as it falls — so it never lands. That's an orbit.`, def: `<b>Orbital velocity</b> is how fast you must travel sideways to fall around the Earth instead of into it. For low orbit that's about 7.8 km/s — roughly 28,000 km/h.` },
              { type: "analogy", text: `Newton's cannon: picture a cannon on a very tall mountain. Fire weakly and the ball lands nearby. Fire hard enough and the ball falls toward Earth at exactly the rate the planet curves away — so it keeps "falling" forever, circling the globe. That's all an orbit is: perpetual falling, missing the ground.` },
              { type: "insight", text: `Getting to orbit is mostly about speed, not altitude. The hard, expensive job of a rocket is reaching 7.8 km/s sideways — not simply getting high.` }
            ]
          },
          {
            tab: "The launch sequence",
            blocks: [
              { type: "p", text: `A climb to orbit takes only about nine minutes, but a lot happens in a tightly choreographed order. Press Next to fly the launch step by step:` },
              { type: "launchAnim" },
              { type: "timeline", items: [
                { t: "T+0", v: "Ignition and lift-off. The first stage's engines fire and the rocket leaves the pad." },
                { t: "T+10s", v: "Gravity turn begins — the rocket tilts slightly so gravity gradually curves its path toward horizontal." },
                { t: "T+75s", v: "Max-Q: the moment of peak aerodynamic stress, where speed and air thickness combine for the roughest ride." },
                { t: "T+3min", v: "Stage separation — the empty first stage drops away and the second stage takes over." },
                { t: "T+4min", v: "Fairing jettison — the nose cone is no longer needed and is discarded to shed weight." },
                { t: "T+9min", v: "Orbit insertion — the rocket reaches orbital velocity and the satellite deploys." }
              ]},
              { type: "term", term: "Gravity turn", plain: `Like leaning into a corner on a bicycle — a small tilt lets a force you already have do the steering for you.`, def: `A <b>gravity turn</b> is a gentle early tilt that lets gravity itself curve the rocket's path from vertical toward horizontal — steering "for free" instead of fighting it with fuel.` },
              { type: "term", term: "Max-Q", plain: `Like sticking your hand out of a car window: push harder on the pedal and the wind shoves back harder. There's a worst moment before you punch through.`, def: `<b>Max-Q</b> is the point of maximum dynamic pressure — where rising speed and still-thick air combine to put the greatest aerodynamic load on the rocket.` }
            ]
          },
          {
            tab: "Delta-v & why staging works",
            blocks: [
              { type: "term", term: "Delta-v (Δv)", plain: `Think of it as your budget of "speed change" — like a fuel gauge, but measured in how much faster (or slower) you can still make yourself go.`, def: `<b>Delta-v</b> is the total change in velocity a rocket can achieve. Reaching low orbit needs roughly 9.4 km/s: about 7.8 km/s of orbital speed plus ~1.6 km/s lost to gravity drag and pushing through the atmosphere.` },
              { type: "p", text: `Here's the cruel maths: the rocket equation is logarithmic. Doubling your fuel does NOT double your speed. To go a little faster you need a lot more fuel — and that extra fuel is itself heavy and must also be carried.` },
              { type: "p", text: `A single-stage rocket trying to reach orbit would need to be about 95% fuel, leaving almost nothing for the structure, engines, or payload. It simply doesn't work.` },
              { type: "analogy", text: `Packing a suitcase for a long trip: once you've used up and emptied half of it, why keep dragging the empty half around? Staging means throwing away the empty part of the rocket the moment it's done, so you no longer waste energy lifting dead weight.` },
              { type: "h", text: "See it for yourself" },
              { type: "p", text: `Here's where a rocket's launch mass actually goes — and what staging does about it. Press Play to burn through both stages:` },
              { type: "deltaVViz" },
              { type: "insight", text: `Staging is the trick that makes orbit possible. By dropping empty tanks and engines along the way, the rocket keeps getting lighter exactly when it needs to accelerate hardest.` }
            ]
          }
        ],
        quiz: [
          { q: "What does being 'in orbit' actually require?", options: ["Simply being very high above the ground", "Travelling sideways fast enough to fall around the Earth", "Escaping Earth's gravity completely", "Floating where there is no gravity"], answer: 1, explain: "Orbit is about sideways speed (~7.8 km/s), not height. You fall continuously but move so fast the ground curves away beneath you." },
          { q: "Roughly how high does the International Space Station orbit?", options: ["40 km", "400 km", "4,000 km", "40,000 km"], answer: 1, explain: "Only about 400 km — close enough that you could 'drive' there in around four hours. The hard part is the sideways speed, not the altitude." },
          { q: "What happens during the 'gravity turn'?", options: ["The engines shut down briefly to save fuel", "The rocket tilts so gravity curves its path toward horizontal", "The rocket spins to stay stable", "The fairing is jettisoned"], answer: 1, explain: "A small early tilt lets gravity steer the rocket from vertical toward horizontal — getting orbital direction 'for free' rather than burning fuel to do it." },
          { q: "About how much total delta-v is needed to reach low Earth orbit?", options: ["~3 km/s", "~5 km/s", "~9.4 km/s", "~20 km/s"], answer: 2, explain: "Roughly 9.4 km/s: about 7.8 km/s of orbital speed plus ~1.6 km/s lost to gravity and atmospheric drag." },
          { q: "Why does staging make reaching orbit possible?", options: ["It lets the rocket carry more passengers", "It drops empty tanks so the rocket stops lifting dead weight", "It makes the rocket more aerodynamic", "It allows the engines to breathe air"], answer: 1, explain: "Because the rocket equation is logarithmic, a single-stage rocket would need ~95% fuel. Dropping spent stages sheds dead weight exactly when more speed is needed." }
        ]
      },

      /* -------------------- MODULE 3 -------------------- */
      {
        id: 3, accent: "#F5C842",
        title: "Types of Orbit",
        subtitle: "Where satellites live, and why altitude is a choice.",
        lessons: [
          {
            tab: "LEO & MEO",
            blocks: [
              { type: "p", text: `Satellites don't all fly at the same height. Tap an orbit below to slow it down and see what lives there:` },
              { type: "orbitViz" },
              { type: "term", term: "LEO — Low Earth Orbit", plain: `The busy "ground floor" of space — close, quick, and crowded.`, def: `<b>LEO</b> sits between roughly 200 and 2,000 km up. A satellite there completes an orbit in about 90 minutes, travelling at ~7.8 km/s.` },
              { type: "specs", items: [
                { k: "Altitude", v: "200–2,000 km" },
                { k: "Orbit time", v: "~90 minutes" },
                { k: "Speed", v: "~7.8 km/s" },
                { k: "Who lives here", v: "Over 90% of all satellites — Starlink, the ISS, Earth-observation craft" }
              ]},
              { type: "p", text: `Because it's close, LEO offers low signal delay and cheaper access — which is why the great majority of satellites operate there.` },
              { type: "term", term: "MEO — Medium Earth Orbit", plain: `The "middle floors" — higher up, with a wider view of the planet.`, def: `<b>MEO</b> spans roughly 2,000 to 36,000 km. Its most famous residents are the GPS satellites, which sit at about 20,200 km.` }
            ]
          },
          {
            tab: "Sun-Synchronous Orbit",
            blocks: [
              { type: "term", term: "SSO — Sun-Synchronous Orbit", plain: `Imagine photographing your garden at exactly 10:30 every morning. Same sun angle, same shadows — so you can fairly compare today's photo with last month's.`, def: `An <b>SSO</b> is tuned so the satellite passes over every location at the SAME local solar time on each visit, giving consistent lighting.` },
              { type: "specs", items: [
                { k: "Altitude", v: "600–800 km" },
                { k: "Inclination", v: "~97° (nearly over the poles)" },
                { k: "Key trait", v: "Same local solar time on every pass" }
              ]},
              { type: "p", text: `That consistent lighting is exactly what Earth-observation satellites need: it lets analysts compare images of the same place over days, months and years without the sun angle changing the picture.` },
              { type: "insight", text: `SSO is one of the fastest-growing slices of the market, expanding around 14% a year — driven by demand for Earth imaging, climate monitoring and agriculture.` }
            ]
          },
          {
            tab: "GEO & launch sites",
            blocks: [
              { type: "term", term: "GEO — Geostationary Orbit", plain: `Hover over one spot on Earth so a dish on the ground can point at you once and never move again.`, def: `<b>GEO</b> is a precise altitude of 35,786 km. At that distance a satellite circles Earth in exactly one day, so it matches the planet's rotation and appears to hang motionless in the sky.` },
              { type: "specs", items: [
                { k: "Altitude", v: "35,786 km (exact)" },
                { k: "Appears", v: "Stationary from the ground" },
                { k: "Used for", v: "TV broadcast, weather satellites" },
                { k: "Coverage", v: "Just three GEO satellites can cover the whole planet" }
              ]},
              { type: "warning", text: `GEO's great height has a cost: signals take about 240 milliseconds to make the round trip. That delay is fine for TV, but makes GEO a poor choice for responsive internet.` },
              { type: "h", text: "Why Andøya, Norway (69°N) is ideal for SSO" },
              { type: "p", text: `Reaching an SSO needs an inclination of about 97–98° — a near-polar path. Launching from Andøya in northern Norway, at 69° latitude, means the rocket naturally heads into that inclination over the empty Norwegian Sea. No costly steering corrections are needed, and the path avoids populated areas.` }
            ]
          }
        ],
        quiz: [
          { q: "Where do over 90% of satellites operate?", options: ["GEO", "MEO", "LEO", "SSO"], answer: 2, explain: "Low Earth Orbit (200–2,000 km) is home to the vast majority of satellites, including Starlink and the ISS — it's close, cheap to reach, and low-latency." },
          { q: "What makes a Sun-Synchronous Orbit special?", options: ["It never moves relative to the ground", "It passes each location at the same local solar time", "It is the highest possible orbit", "It requires no fuel to maintain"], answer: 1, explain: "An SSO crosses each spot at the same local solar time, giving consistent lighting — essential for comparing Earth-observation images over time." },
          { q: "Why does a GEO satellite appear to stay still in the sky?", options: ["It is too far away to see moving", "It orbits once per day, matching Earth's rotation", "It uses thrusters to hover", "It is not actually orbiting"], answer: 1, explain: "At 35,786 km a satellite takes exactly one day to circle Earth, matching the planet's spin — so from the ground it looks stationary." },
          { q: "GPS satellites operate in which orbit?", options: ["LEO", "MEO (~20,200 km)", "GEO", "SSO"], answer: 1, explain: "GPS satellites sit in Medium Earth Orbit at about 20,200 km." },
          { q: "Why is Andøya, Norway (69°N) well suited to SSO launches?", options: ["It is the warmest launch site in Europe", "Its high latitude naturally gives the ~97° inclination an SSO needs", "It is the closest site to the equator", "It allows launches directly into GEO"], answer: 1, explain: "From 69° latitude the rocket heads naturally into the ~97–98° near-polar inclination over the empty Norwegian Sea — no expensive trajectory corrections required." }
        ]
      },

      /* -------------------- MODULE 4 -------------------- */
      {
        id: 4, accent: "#52E07C",
        title: "Isar Aerospace & Spectrum",
        subtitle: "A German startup, its rocket, and a very public first flight.",
        lessons: [
          {
            tab: "The company",
            blocks: [
              { type: "p", text: `Isar Aerospace was founded in March 2018 in Munich by three students from the Technical University of Munich (TUM): Daniel Metzler (CEO), Josef Fleischmann (CTO) and Markus Brandl. They met building rocket engines together in WARR, the university's student rocketry group.` },
              { type: "h", text: "Funding" },
              { type: "p", text: `Isar has raised over €600M across Series A–C rounds and beyond. Notable backers include the NATO Innovation Fund — its first-ever investment in a launch provider — and an Eldridge convertible bond. The company has been reported at around a €2B valuation.` },
              { type: "h", text: "Vertical integration" },
              { type: "p", text: `Isar builds roughly 80% of the rocket in-house — including the engines, avionics and software. This eliminates supplier markups and lets the team iterate quickly.` },
              { type: "insight", text: `SpaceX pioneered this vertically-integrated approach, cutting costs by around 90% versus old-school rocket makers who bolt together parts from many suppliers.` }
            ]
          },
          {
            tab: "Spectrum specs",
            blocks: [
              { type: "specs", items: [
                { k: "Height", v: "28 m tall" },
                { k: "Diameter", v: "2 m" },
                { k: "Stages", v: "Two" },
                { k: "First-stage engines", v: "9 × Aquila (675 kN total thrust)" },
                { k: "Propellant", v: "Liquid oxygen + liquid propane" },
                { k: "Payload to LEO", v: "Up to 1,000 kg (from Kourou)" },
                { k: "Payload to SSO", v: "Up to 700 kg (from Andøya)" },
                { k: "Structure", v: "Carbon composite" },
                { k: "Target price", v: "€10,000 / kg" }
              ]},
              { type: "term", term: "Why propane, not kerosene?", plain: `If you're packing a small bag, you choose the food that gives the most energy for its size.`, def: `Among carbon-based fuels, propane has the highest energy density per unit volume — keeping the vehicle compact. It also burns cleaner and is far easier to handle than hydrogen.` }
            ]
          },
          {
            tab: "The flights",
            blocks: [
              { type: "h", text: "First launch — 30 March 2025" },
              { type: "p", text: `Spectrum had a clean lift-off, with all nine engines firing simultaneously, and the pitch-over manoeuvre began normally. Then at T+25s a vent valve — used during ground fuelling to control tank pressure — unexpectedly opened, causing a loss of attitude control. The Flight Termination System (FTS) shut down all engines at T+30s, and the rocket fell into the Norwegian Sea. The launch pad was undamaged.` },
              { type: "analogy", text: `CEO Daniel Metzler: "We had a clean liftoff, 30 seconds of flight, and even got to validate our Flight Termination System." For a maiden flight, surviving lift-off and proving the safety systems work is genuinely valuable data.` },
              { type: "h", text: `Second flight — "Onward and Upward" (2026)` },
              { type: "p", text: `The second mission carries six university payloads and targets a Sun-Synchronous Orbit. It was scrubbed on 21 January over a valve issue, then on 25 March reached T-3 seconds before a fishing vessel inside the safety zone forced an abort.` }
            ]
          }
        ],
        quiz: [
          { q: "Where and when was Isar Aerospace founded?", options: ["Berlin, 2010", "Munich, March 2018", "Hamburg, 2021", "Bremen, 2015"], answer: 1, explain: "Isar was founded in Munich in March 2018 by three TUM students who had met in the WARR student rocketry group." },
          { q: "How many engines does Spectrum's first stage have?", options: ["1", "3", "9", "27"], answer: 2, explain: "Nine Aquila engines power the first stage, producing 675 kN of total thrust." },
          { q: "Why does Spectrum use liquid propane rather than kerosene?", options: ["It is cheaper than any other fuel", "It has the highest energy density per volume of carbon fuels, keeping the rocket compact", "It is the only fuel that works with LOX", "It does not need an oxidiser"], answer: 1, explain: "Propane offers the highest energy density per unit volume among carbon fuels (compact vehicle), burns cleaner, and is easier to handle than hydrogen." },
          { q: "What ended Spectrum's first flight in March 2025?", options: ["An engine exploded at lift-off", "A vent valve opened at T+25s, causing loss of attitude control", "It ran out of fuel", "A fishing vessel entered the safety zone"], answer: 1, explain: "A vent valve (used for ground-fuelling pressure control) unexpectedly opened at T+25s; the Flight Termination System shut the engines at T+30s and the rocket fell into the sea. The pad was undamaged." },
          { q: "What does 'vertical integration' mean for Isar?", options: ["Building the rocket to launch straight up", "Building ~80% of the rocket in-house to cut costs and iterate fast", "Only making satellites, not rockets", "Outsourcing every component to suppliers"], answer: 1, explain: "Isar builds about 80% of the rocket itself — engines, avionics, software — eliminating supplier markups and enabling rapid iteration, much as SpaceX did." }
        ]
      },

      /* -------------------- MODULE 5 -------------------- */
      {
        id: 5, accent: "#4AF0E0",
        title: "The Business of Rockets",
        subtitle: "Why building the rocket is only half the battle.",
        lessons: [
          {
            tab: "Market & customers",
            blocks: [
              { type: "h", text: "The market" },
              { type: "specs", items: [
                { k: "Small-sat market", v: "$9.4B (2024)" },
                { k: "Forecast launches", v: "18,500 smallsats over 2024–2033" },
                { k: "SSO growth", v: "~14% per year" }
              ]},
              { type: "h", text: "What customers actually care about (in order)" },
              { type: "list", items: [
                "1. Reliability — will my satellite actually reach orbit?",
                "2. Schedule certainty — will it launch when promised?",
                "3. Exact orbit — does it go precisely where my satellite needs to be?",
                "4. Price — how much per kilogram?",
                "5. Responsiveness — how easy is the provider to work with?"
              ]},
              { type: "insight", text: `Notice that price is only fourth on the list. For a customer with an expensive satellite, a cheap launch that loses the payload is the most expensive launch of all.` }
            ]
          },
          {
            tab: "The economics",
            blocks: [
              { type: "h", text: "Insurance reality" },
              { type: "p", text: `Insurers price risk on track record. A brand-new, unproven rocket can mean a premium of 15–25% of the satellite's value. A proven workhorse like Falcon 9 might be just 1–4%.` },
              { type: "analogy", text: `On a $50M satellite, that gap alone can reach about $10.5M in extra insurance — before you've paid a cent for the launch itself. A "cheaper" unproven rocket can end up costing far more once insurance is added.` },
              { type: "h", text: "Rideshare vs dedicated" },
              { type: "specs", items: [
                { k: "Rideshare (e.g. SpaceX)", v: "~$5,500/kg — but you accept their orbit and their schedule" },
                { k: "Dedicated (e.g. Spectrum)", v: "~€10,000/kg — but your exact orbit, your schedule, your mission rules" }
              ]},
              { type: "insight", text: `Rideshare is the cheap bus that goes where it's going; a dedicated launch is the taxi that takes you exactly where and when you want. Many customers will pay more for control.` }
            ]
          },
          {
            tab: "Competitors & the valley of death",
            blocks: [
              { type: "h", text: "Who's who" },
              { type: "parts", items: [
                { k: "Rocket Lab", v: "Thriving — 79 Electron launches, 94.9% success (100% in 2025), now developing the medium-lift Neutron." },
                { k: "Firefly", v: "Growing — IPO'd at $10B in 2025, with 163% revenue growth." },
                { k: "RFA (Augsburg)", v: "Pre-flight — a fellow German competitor not yet to orbit." },
                { k: "Virgin Orbit", v: "Bankrupt in 2023 — a failed UK launch plus an inability to raise more funding." },
                { k: "Astra", v: "Collapsed — 5 of 7 launches failed; the stock fell 95%." },
                { k: "Orbex", v: "Collapsed Feb 2026 — never launched despite raising £90M. A stark warning." }
              ]},
              { type: "warning", text: `The "valley of death" pattern: raise funding → hit development delays → first flight fails → investors get nervous → can't raise the next round → the company dies.` },
              { type: "insight", text: `Survivors share three things: deep pockets, fast iteration, and government anchor customers who provide steady early revenue while the rocket proves itself.` }
            ]
          }
        ],
        quiz: [
          { q: "What do launch customers care about MOST?", options: ["The lowest possible price", "Reliability — will my satellite reach orbit?", "How famous the rocket company is", "The colour of the rocket"], answer: 1, explain: "Reliability tops the list, ahead of schedule, exact orbit, price and responsiveness. A cheap launch that loses the payload is the most expensive one of all." },
          { q: "Insurance for a brand-new, unproven rocket is roughly what share of the satellite's value?", options: ["1–4%", "5–8%", "15–25%", "50–60%"], answer: 2, explain: "An unproven rocket can carry a 15–25% premium, versus just 1–4% for a proven workhorse like Falcon 9 — a huge hidden cost." },
          { q: "What's the key difference between rideshare and a dedicated launch?", options: ["Rideshare is always more reliable", "Rideshare is cheaper but you accept their orbit and schedule; dedicated gives you your exact orbit and schedule", "Dedicated launches are always cheaper per kg", "There is no real difference"], answer: 1, explain: "Rideshare (~$5,500/kg) is the cheap bus on a fixed route; a dedicated launch (~€10,000/kg) is the taxi that takes you exactly where and when you want." },
          { q: "Which competitor is clearly thriving, with a 100% success rate in 2025?", options: ["Astra", "Virgin Orbit", "Orbex", "Rocket Lab"], answer: 3, explain: "Rocket Lab has flown 79 Electron launches at 94.9% success (100% in 2025) and is building the medium-lift Neutron. Astra, Virgin Orbit and Orbex all collapsed." },
          { q: "What is the rocket industry's 'valley of death'?", options: ["A dangerous launch trajectory", "The deadly cycle of delays and a failed first flight scaring off investors so the company can't raise more money", "A region where rockets crash", "The cold storage area for propellant"], answer: 1, explain: "Raise funding → delays → first flight fails → nervous investors → can't raise the next round → collapse. Survivors need deep pockets, fast iteration and government anchor customers." }
        ]
      }
    ];

    const PASS = 0.8; // 80% to unlock the next module

    /* =================================================================
       Persistence
       ================================================================= */
    const STORAGE_KEY = "orbitAcademyProgress.v1";
    function loadProgress() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {}; // { [id]: { completed: bool, best: number } }
    }
    function saveProgress(p) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) {}
    }
    function isUnlocked(id, progress) {
      if (id === 1) return true;
      const prev = progress[id - 1];
      return !!(prev && prev.completed);
    }

    /* =================================================================
       Star field
       ================================================================= */
    function StarField() {
      const stars = useMemo(() =>
        Array.from({ length: 110 }, () => ({
          top: Math.random() * 100,
          left: Math.random() * 100,
          size: Math.random() * 2 + 1,
          dur: (2 + Math.random() * 3).toFixed(2) + "s",
          delay: (Math.random() * 4).toFixed(2) + "s"
        })), []);
      return (
        <div className="starfield" aria-hidden="true">
          {stars.map((s, i) => (
            <span key={i} className="star" style={{
              top: s.top + "%", left: s.left + "%",
              width: s.size + "px", height: s.size + "px",
              "--dur": s.dur, animationDelay: s.delay
            }} />
          ))}
        </div>
      );
    }

    /* =================================================================
       3D SPACE SCENE — real-time WebGL background (three.js)
       Earth with procedural texture + atmosphere glow, star particles,
       satellites on inclined orbits, subtle pointer parallax.
       Falls back to the CSS starfield when WebGL is unavailable.
       ================================================================= */
    function Space3D() {
      const ref = useRef(null);
      useEffect(() => {
        if (!HAS_WEBGL || !ref.current) return;
        const T = window.THREE;
        const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const renderer = new T.WebGLRenderer({ canvas: ref.current, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const scene = new T.Scene();
        const cam = new T.PerspectiveCamera(50, 1, 0.1, 200);
        cam.position.set(0, 0, 6);

        // --- stars ---
        const N = 1500;
        const sg = new T.BufferGeometry();
        const sp = new Float32Array(N * 3);
        for (let i = 0; i < N * 3; i++) sp[i] = (Math.random() - 0.5) * 90;
        sg.setAttribute("position", new T.BufferAttribute(sp, 3));
        const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8 }));
        scene.add(stars);

        // --- Photoreal Earth: NASA-derived maps (day, normal, specular,
        //     night-side city lights) plus a separate rotating cloud layer ---
        const loader = new T.TextureLoader();
        const dayMap    = loader.load("vendor/tex/earth_atmos_2048.jpg");
        const normalMap = loader.load("vendor/tex/earth_normal_2048.jpg");
        const specMap   = loader.load("vendor/tex/earth_specular_2048.jpg");
        const lightsMap = loader.load("vendor/tex/earth_lights_2048.png");
        const cloudsMap = loader.load("vendor/tex/earth_clouds_1024.png");
        const group = new T.Group();
        const earth = new T.Mesh(
          new T.SphereGeometry(1.6, 64, 64),
          new T.MeshPhongMaterial({
            map: dayMap,
            normalMap: normalMap,
            normalScale: new T.Vector2(0.85, 0.85),
            specularMap: specMap,
            specular: new T.Color(0x2a3a4a),
            shininess: 18,
            emissive: new T.Color(0xffdd99),
            emissiveMap: lightsMap,
            emissiveIntensity: 0.55
          })
        );
        group.add(earth);
        const clouds = new T.Mesh(
          new T.SphereGeometry(1.63, 64, 64),
          new T.MeshLambertMaterial({ map: cloudsMap, transparent: true, opacity: 0.85, depthWrite: false })
        );
        group.add(clouds);

        // atmosphere: fresnel-style glow shader on a back-side shell
        const atmo = new T.Mesh(
          new T.SphereGeometry(1.74, 48, 48),
          new T.ShaderMaterial({
            transparent: true, side: T.BackSide, depthWrite: false,
            vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
            fragmentShader: "varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.4); gl_FragColor = vec4(0.29, 0.94, 0.88, 1.0) * i; }"
          })
        );
        group.add(atmo);

        // satellites on inclined orbit rings
        const sats = [];
        [[2.35, 0.5, 0x4AF0E0, 0.85], [2.75, -0.95, 0xF5C842, 0.55], [3.2, 1.25, 0xFF7A45, 0.4]].forEach(([r, inc, col, speed]) => {
          const tiltX = Math.PI / 2 + inc * 0.35;
          const ring = new T.Mesh(
            new T.RingGeometry(r - 0.006, r + 0.006, 90),
            new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: T.DoubleSide })
          );
          ring.rotation.x = tiltX;
          group.add(ring);
          const sat = new T.Mesh(new T.SphereGeometry(0.05, 8, 8), new T.MeshBasicMaterial({ color: col }));
          group.add(sat);
          sats.push({ sat, r, tiltX, speed, phase: Math.random() * 6 });
        });

        group.position.set(2.15, -0.45, 0);
        scene.add(group);
        scene.add(new T.AmbientLight(0x8899bb, 0.55));
        const sun = new T.DirectionalLight(0xffffff, 1.15);
        sun.position.set(-4, 2.5, 3);
        scene.add(sun);

        // HDR bloom post-processing (falls back to a plain render if absent)
        scene.background = new T.Color(0x07090f);
        const useBloom = !!(T.EffectComposer && T.RenderPass && T.UnrealBloomPass);
        let composer = null, bloomPass = null;
        if (useBloom) {
          composer = new T.EffectComposer(renderer);
          composer.addPass(new T.RenderPass(scene, cam));
          bloomPass = new T.UnrealBloomPass(new T.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.7, 0.72);
          composer.addPass(bloomPass);
        }

        let mx = 0, my = 0;
        const onMove = (e) => {
          const px = e.touches ? e.touches[0].clientX : e.clientX;
          const py = e.touches ? e.touches[0].clientY : e.clientY;
          mx = px / window.innerWidth - 0.5;
          my = py / window.innerHeight - 0.5;
        };
        window.addEventListener("pointermove", onMove, { passive: true });
        const onSize = () => {
          const w = window.innerWidth, h = window.innerHeight;
          renderer.setSize(w, h, false);
          if (composer) composer.setSize(w, h);
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
        };
        onSize();
        window.addEventListener("resize", onSize);

        let raf;
        const clock = new T.Clock();
        const euler = new T.Euler();
        const tick = () => {
          const t = clock.getElapsedTime();
          if (!reduced) {
            earth.rotation.y = t * 0.05;
            clouds.rotation.y = t * 0.066;
            stars.rotation.y = t * 0.004;
            sats.forEach(s => {
              const a = s.phase + t * s.speed;
              const p = new T.Vector3(Math.cos(a) * s.r, Math.sin(a) * s.r, 0);
              euler.set(s.tiltX, 0, 0);
              p.applyEuler(euler);
              s.sat.position.copy(p);
            });
          }
          cam.position.x += (mx * 0.55 - cam.position.x) * 0.04;
          cam.position.y += (-my * 0.45 - cam.position.y) * 0.04;
          cam.lookAt(1.2, -0.35, 0);
          if (composer) composer.render(); else renderer.render(scene, cam);
          raf = requestAnimationFrame(tick);
        };
        tick();
        return () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("resize", onSize);
          renderer.dispose();
        };
      }, []);
      if (!HAS_WEBGL) return <StarField />;
      return <canvas ref={ref} className="space3d" aria-hidden="true" />;
    }

    /* =================================================================
       Shared: smooth count-up for animated numeric readouts
       ================================================================= */
    function useCountUp(target, dur = 1000) {
      const [val, setVal] = useState(target);
      const fromRef = useRef(target);
      useEffect(() => {
        const from = fromRef.current;
        const t0 = performance.now();
        let raf;
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          const eased = k * (2 - k); // ease-out
          setVal(from + (target - from) * eased);
          if (k < 1) raf = requestAnimationFrame(tick);
          else fromRef.current = target;
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
      }, [target, dur]);
      return val;
    }

    /* =================================================================
       1) Interactive rocket diagram (Module 1)
       ================================================================= */
    const ROCKET_PARTS = [
      { id: "fairing", name: "Payload Fairing", color: "#4AF0E0",
        plain: "Like the padded box around a delicate gift — it protects what's precious inside.",
        def: "The pointed nose cone that shields the satellite (the payload) from the rushing air during the climb. Jettisoned above ~120 km, where the air is too thin to matter." },
      { id: "second", name: "Second Stage", color: "#F5C842",
        plain: "The closer — a smaller engine that finishes the job once the heavy lifting is done.",
        def: "A smaller stage with a single engine built to fire in the vacuum of space. Its job is to reach orbital velocity, about 7.8 km/s." },
      { id: "interstage", name: "Interstage", color: "#FF7A45",
        plain: "The connector — like the coupling between two train carriages.",
        def: "A structural collar that joins the first and second stages and holds the separation mechanism." },
      { id: "first", name: "First Stage", color: "#52E07C",
        plain: "The muscle — it does the brute-force work of heaving everything off the ground.",
        def: "The heavy lifter, holding most of the propellant. Burns for 2–3 minutes, then drops away once its tanks are empty." },
      { id: "engines", name: "Engine Cluster", color: "#FF7A45",
        plain: "Where the fire happens — like the burners on a stove, but pointed straight down.",
        def: "Nine Aquila engines producing 675 kN of thrust together, burning liquid oxygen and propane and hurling exhaust downward to push the rocket up." }
    ];

    function RocketDiagram() {
      const [sel, setSel] = useState("fairing");
      const part = ROCKET_PARTS.find(p => p.id === sel);
      const styleFor = (id, color) => {
        const isSel = sel === id;
        return {
          cursor: "pointer",
          transition: "opacity .25s ease, filter .25s ease",
          opacity: sel && !isSel ? 0.32 : 1,
          filter: isSel ? `drop-shadow(0 0 7px ${color})` : "none"
        };
      };
      const shape = (id, color) => ({
        fill: sel === id ? color : "#0E1726",
        fillOpacity: sel === id ? 0.85 : 0.55,
        stroke: color, strokeWidth: 1.5
      });
      const label = (id, color, y, text) => (
        <g style={{ pointerEvents: "none", opacity: sel && sel !== id ? 0.3 : 1, transition: "opacity .25s" }}>
          <line x1="112" y1={y} x2="122" y2={y} stroke={color} strokeWidth="1" strokeDasharray="2 2" />
          <text x="108" y={y + 3} textAnchor="end" fill={color} fontFamily="ui-monospace, Menlo, monospace" fontSize="9">{text}</text>
        </g>
      );
      return (
        <div className="gfx rk-wrap">
          <svg className="rk-svg" viewBox="0 0 240 400" role="img" aria-label="Interactive rocket diagram">
            {/* Payload fairing (nose + collar) */}
            <g style={styleFor("fairing", "#4AF0E0")} onClick={() => setSel("fairing")}>
              <path d="M150,14 C172,58 176,84 176,96 L124,96 C124,84 128,58 150,14 Z" {...shape("fairing", "#4AF0E0")} />
              <rect x="124" y="96" width="52" height="24" {...shape("fairing", "#4AF0E0")} />
            </g>
            {/* Second stage */}
            <g style={styleFor("second", "#F5C842")} onClick={() => setSel("second")}>
              <rect x="124" y="120" width="52" height="70" rx="2" {...shape("second", "#F5C842")} />
            </g>
            {/* Interstage */}
            <g style={styleFor("interstage", "#FF7A45")} onClick={() => setSel("interstage")}>
              <rect x="127" y="190" width="46" height="22" {...shape("interstage", "#FF7A45")} />
            </g>
            {/* First stage + fins */}
            <g style={styleFor("first", "#52E07C")} onClick={() => setSel("first")}>
              <rect x="124" y="212" width="52" height="144" rx="2" {...shape("first", "#52E07C")} />
              <path d="M124,330 L104,356 L124,356 Z" {...shape("first", "#52E07C")} />
              <path d="M176,330 L196,356 L176,356 Z" {...shape("first", "#52E07C")} />
            </g>
            {/* Engine cluster */}
            <g style={styleFor("engines", "#FF7A45")} onClick={() => setSel("engines")}>
              <rect x="126" y="354" width="48" height="8" {...shape("engines", "#FF7A45")} />
              <path d="M132,360 L130,386 L144,386 L142,360 Z" {...shape("engines", "#FF7A45")} />
              <path d="M145,360 L143,388 L157,388 L155,360 Z" {...shape("engines", "#FF7A45")} />
              <path d="M158,360 L156,386 L170,386 L168,360 Z" {...shape("engines", "#FF7A45")} />
            </g>
            {/* Labels with leader lines */}
            {label("fairing", "#4AF0E0", 60, "Payload Fairing")}
            {label("second", "#F5C842", 155, "Second Stage")}
            {label("interstage", "#FF7A45", 201, "Interstage")}
            {label("first", "#52E07C", 290, "First Stage")}
            {label("engines", "#FF7A45", 372, "Engine Cluster")}
          </svg>
          <div className="rk-panel" key={sel}>
            <div className="rk-pname" style={{ color: part.color }}>{part.name}</div>
            <p className="rk-plain">{part.plain}</p>
            <p className="rk-def">{part.def}</p>
          </div>
        </div>
      );
    }

    /* =================================================================
       2) Launch sequence animation (Module 2)
       ================================================================= */
    const LAUNCH_PHASES = [
      { t: "T+0", name: "Ignition", desc: "Engines light and the rocket lifts off the pad.", alt: 0, spd: 0, tilt: 0, rise: 0, thrust: "full" },
      { t: "T+10s", name: "Gravity turn", desc: "The rocket tilts slightly; gravity begins curving its path toward horizontal — steering for free.", alt: 2, spd: 0.2, tilt: 14, rise: 0.16, thrust: "full" },
      { t: "T+75s", name: "Max-Q", desc: "Peak aerodynamic stress: speed and still-thick air combine for the roughest part of the ride.", alt: 12, spd: 1.5, tilt: 32, rise: 0.40, thrust: "full", warn: true },
      { t: "T+3min", name: "Stage separation", desc: "The spent first stage drops away and falls back; the second stage takes over.", alt: 80, spd: 2.4, tilt: 52, rise: 0.62, thrust: "second" },
      { t: "T+4min", name: "Fairing jettison", desc: "The nose cone splits in two and drifts off — the satellite no longer needs shielding.", alt: 130, spd: 3.1, tilt: 66, rise: 0.78, thrust: "second" },
      { t: "T+9min", name: "Orbit insertion", desc: "Orbital velocity reached. The satellite separates and begins to circle the Earth.", alt: 300, spd: 7.8, tilt: 82, rise: 0.92, thrust: "off" }
    ];

    function LaunchSequence() {
      const [idx, setIdx] = useState(0);
      const p = LAUNCH_PHASES[idx];
      const alt = useCountUp(p.alt, 900);
      const spd = useCountUp(p.spd, 900);
      const tx = 150 + p.rise * 78;
      const ty = 250 - p.rise * 150;
      const flame = p.thrust === "full" ? 1 : p.thrust === "second" ? 0.5 : 0;

      return (
        <div className="gfx">
          <div className="ls-readout">
            <div className="ls-phase"><span className="ls-time">{p.t}</span> {p.name}</div>
            <div className="ls-meters">
              <span>ALT <b>{Math.round(alt).toLocaleString()}</b> km</span>
              <span>VEL <b>{spd.toFixed(1)}</b> km/s</span>
            </div>
          </div>
          <svg className="ls-svg" viewBox="0 0 300 320" role="img" aria-label="Launch sequence animation">
            <defs>
              <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#02040A" />
                <stop offset="1" stopColor="#0B1626" />
              </linearGradient>
              <radialGradient id="earthG" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#2E6FB0" /><stop offset="1" stopColor="#0E3A66" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="300" height="320" fill="url(#sky)" />
            {/* ground / pad */}
            <rect x="0" y="296" width="300" height="24" fill="#10202E" />
            <rect x="132" y="288" width="36" height="10" fill="#1A2C3E" />
            {/* orbit insertion: Earth limb + orbit path + satellite */}
            {idx >= 5 && (
              <g className="ls-fade">
                <path d="M-40,300 A 240 240 0 0 1 340 300" fill="none" stroke="#22597f" strokeWidth="3" opacity="0.6" />
                <g transform="rotate(-18 210 120)">
                  <ellipse cx="210" cy="120" rx="120" ry="60" fill="none" stroke="#4AF0E0" strokeWidth="1.4" strokeDasharray="4 4" opacity="0.85" />
                  <path id="insPath" d="M210,60 a120,60 0 1,1 0,120 a120,60 0 1,1 0,-120" fill="none" stroke="none" />
                  <g>
                    <rect x="-6" y="-4" width="12" height="8" rx="1.5" fill="#4AF0E0" />
                    <rect x="-12" y="-2" width="5" height="4" fill="#9fe9ff" />
                    <rect x="7" y="-2" width="5" height="4" fill="#9fe9ff" />
                    <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
                      <mpath href="#insPath" />
                    </animateMotion>
                  </g>
                </g>
              </g>
            )}
            {/* falling first stage — only at the separation moment */}
            {idx === 3 && (
              <g className="ls-fall">
                <rect x="-7" y="-26" width="14" height="26" rx="2" fill="#0E1726" stroke="#52E07C" strokeWidth="1.5" />
                <path d="M-7,-6 L-15,2 L-7,2 Z" fill="#0E1726" stroke="#52E07C" strokeWidth="1.2" />
              </g>
            )}
            {/* drifting fairing halves — only at jettison moment */}
            {idx === 4 && (
              <>
                <path className="ls-fairL" d="M0,-30 C-9,-12 -11,-2 -11,4 L0,4 Z" fill="#0E1726" stroke="#4AF0E0" strokeWidth="1.4" />
                <path className="ls-fairR" d="M0,-30 C9,-12 11,-2 11,4 L0,4 Z" fill="#0E1726" stroke="#4AF0E0" strokeWidth="1.4" />
              </>
            )}
            {/* the rocket */}
            <g style={{ transform: `translate(${tx}px, ${ty}px) rotate(${p.tilt}deg)`, transformBox: "fill-box", transition: "transform 1.1s cubic-bezier(.45,.05,.35,1)" }}>
              {/* exhaust */}
              {flame > 0 && (
                <path className="ls-flame" d={`M-6,0 L0,${22 + 26 * flame} L6,0 Z`} fill={flame > 0.7 ? "#FF7A45" : "#F5C842"} opacity={flame} />
              )}
              {/* first stage (hidden once separated) */}
              {idx < 3 && <rect x="-7" y="-32" width="14" height="26" rx="2" fill="#0E1726" stroke="#52E07C" strokeWidth="1.5" />}
              {/* second stage */}
              <rect x="-6" y="-58" width="12" height={idx < 3 ? 26 : 52} rx="2" fill="#0E1726" stroke="#F5C842" strokeWidth="1.5" />
              {/* nose / fairing (gone after jettison; satellite shows instead) */}
              {idx < 4
                ? <path d="M0,-80 L7,-58 L-7,-58 Z" fill="#0E1726" stroke="#4AF0E0" strokeWidth="1.5" />
                : idx < 5 && <rect x="-4" y="-66" width="8" height="8" rx="1" fill="#4AF0E0" />}
              {/* nozzle */}
              <path d="M-7,-6 L-5,2 L5,2 L7,-6 Z" fill="#1A2C3E" stroke="#FF7A45" strokeWidth="1" />
            </g>
            {/* Max-Q warning */}
            {p.warn && (
              <g className="ls-warn">
                <rect x="18" y="18" width="74" height="20" rx="4" fill="rgba(255,77,77,.15)" stroke="#FF4D4D" />
                <text x="55" y="32" textAnchor="middle" fill="#FF4D4D" fontFamily="ui-monospace, Menlo, monospace" fontSize="11">⚠ MAX-Q</text>
              </g>
            )}
          </svg>
          <p className="ls-desc">{p.desc}</p>
          <div className="gfx-controls">
            <button className="btn btn-ghost gfx-btn" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>← Back</button>
            {idx < LAUNCH_PHASES.length - 1
              ? <button className="btn btn-primary gfx-btn" onClick={() => setIdx(idx + 1)}>Next: {LAUNCH_PHASES[idx + 1].name} →</button>
              : <button className="btn btn-primary gfx-btn" onClick={() => setIdx(0)}>↺ Replay launch</button>}
          </div>
        </div>
      );
    }

    /* =================================================================
       2b) 3D launch scene — WebGL upgrade of the launch sequence.
       Same phase data/controls; real-time rocket, particle exhaust,
       camera follow with Max-Q shake, stage separation, orbit deploy.
       ================================================================= */
    const LAUNCH_CLOCK = [0, 10, 75, 180, 240, 540]; // seconds at each phase, for the mission clock

    function Launch3D() {
      const [idx, setIdx] = useState(0);
      const canvasRef = useRef(null);
      const phaseRef = useRef(0);
      const p = LAUNCH_PHASES[idx];
      const alt = useCountUp(p.alt, 1100);
      const spd = useCountUp(p.spd, 1100);
      const clock = useCountUp(LAUNCH_CLOCK[idx], 1100);
      useEffect(() => { phaseRef.current = idx; }, [idx]);

      const RULER_MAX = 300;
      const rulerPct = Math.min(100, (alt / RULER_MAX) * 100);
      const mm = String(Math.floor(clock / 60)).padStart(2, "0");
      const ss = String(Math.floor(clock % 60)).padStart(2, "0");
      const horizonOpacity = [0.55, 0.45, 0.28, 0.08, 0, 0][idx];

      useEffect(() => {
        const T = window.THREE;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const renderer = new T.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const H = 340;
        const scene = new T.Scene();
        scene.background = new T.Color(0x0d1b30);
        scene.fog = new T.Fog(0x0d1b30, 30, 110);
        const cam = new T.PerspectiveCamera(55, 2, 0.1, 300);

        // sky stars (fade in with altitude)
        const sN = 420, sG = new T.BufferGeometry(), sP = new Float32Array(sN * 3);
        for (let i = 0; i < sN; i++) { sP[i*3] = (Math.random()-0.5)*160; sP[i*3+1] = 6 + Math.random()*130; sP[i*3+2] = -30 - Math.random()*60; }
        sG.setAttribute("position", new T.BufferAttribute(sP, 3));
        const starsMat = new T.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.15 });
        scene.add(new T.Points(sG, starsMat));

        // ground + pad (grid fades as the rocket climbs)
        const grid = new T.GridHelper(160, 80, 0x27394f, 0x16243a);
        grid.material.transparent = true;
        scene.add(grid);
        const pad = new T.Mesh(new T.BoxGeometry(3.4, 0.3, 3.4), new T.MeshPhongMaterial({ color: 0x1a2c3e }));
        pad.material.transparent = true;
        pad.position.y = 0.15;
        scene.add(pad);
        const tower = new T.Mesh(new T.BoxGeometry(0.25, 6.5, 0.25), new T.MeshPhongMaterial({ color: 0x223448 }));
        tower.material.transparent = true;
        tower.position.set(-1.5, 3.25, 0);
        scene.add(tower);

        // --- metallic panel-lined body texture (procedural, no assets) ---
        const makeBodyTex = () => {
          const c = document.createElement("canvas"); c.width = 256; c.height = 256;
          const x = c.getContext("2d");
          const gr = x.createLinearGradient(0, 0, 256, 0);
          gr.addColorStop(0, "#75899f"); gr.addColorStop(0.25, "#e6edf5");
          gr.addColorStop(0.5, "#aebdd0"); gr.addColorStop(0.75, "#e6edf5"); gr.addColorStop(1, "#75899f");
          x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
          x.strokeStyle = "rgba(38,54,74,.85)"; x.lineWidth = 3;
          [42, 106, 170, 234].forEach(y => { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); });
          x.strokeStyle = "rgba(38,54,74,.5)"; x.lineWidth = 1.5;
          [64, 128, 192].forEach(vx => { x.beginPath(); x.moveTo(vx, 0); x.lineTo(vx, 256); x.stroke(); });
          x.fillStyle = "rgba(60,80,105,.45)"; x.fillRect(120, 118, 18, 30);
          x.strokeStyle = "rgba(255,255,255,.3)"; x.strokeRect(120, 118, 18, 30);
          const t = new T.CanvasTexture(c);
          t.wrapS = T.RepeatWrapping; t.repeat.set(2, 1);
          return t;
        };
        const bodyTex = makeBodyTex();
        const bodyMat = new T.MeshStandardMaterial({ map: bodyTex, metalness: 0.45, roughness: 0.42 });
        const finMat = new T.MeshStandardMaterial({ color: 0x8fa3ba, metalness: 0.5, roughness: 0.45 });
        const noseMat = new T.MeshStandardMaterial({ color: 0x4af0e0, metalness: 0.5, roughness: 0.3, emissive: 0x0c4a44, emissiveIntensity: 0.55 });

        // rocket
        const rocket = new T.Group();
        const stage1 = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 3.4, 24), bodyMat);
        stage1.position.y = 2.0; rocket.add(stage1);
        const fins = new T.Group();
        for (let i = 0; i < 3; i++) {
          const f = new T.Mesh(new T.BoxGeometry(0.08, 0.9, 0.55), finMat);
          const a = (i / 3) * Math.PI * 2;
          f.position.set(Math.cos(a) * 0.55, 0.75, Math.sin(a) * 0.55);
          f.rotation.y = -a;
          fins.add(f);
        }
        rocket.add(fins);
        const inter = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.3, 24), new T.MeshStandardMaterial({ color: 0xff7a45, metalness: 0.4, roughness: 0.5 }));
        inter.position.y = 3.85; rocket.add(inter);
        const stage2 = new T.Mesh(new T.CylinderGeometry(0.44, 0.5, 1.6, 24), bodyMat);
        stage2.position.y = 4.8; rocket.add(stage2);
        const nose = new T.Mesh(new T.ConeGeometry(0.44, 1.2, 24), noseMat);
        nose.position.y = 6.2; rocket.add(nose);
        const sat = new T.Mesh(new T.BoxGeometry(0.4, 0.3, 0.4), new T.MeshBasicMaterial({ color: 0x4af0e0 }));
        sat.visible = false; sat.position.y = 5.9; rocket.add(sat);
        scene.add(rocket);

        // dropped first stage (tumbles away after separation, with a dying exhaust wisp)
        const dropped = new T.Group();
        dropped.add(stage1.clone(), fins.clone());
        const dropMat = new T.MeshStandardMaterial({ map: bodyTex, metalness: 0.45, roughness: 0.42, emissive: 0x2a3648, emissiveIntensity: 0.85 });
        dropped.traverse(o => { if (o.isMesh) o.material = dropMat; });
        const wisp = new T.Mesh(
          new T.ConeGeometry(0.28, 1.6, 12, 1, true),
          new T.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false })
        );
        wisp.position.y = -0.6; wisp.rotation.x = Math.PI;
        dropped.add(wisp);
        dropped.visible = false;
        scene.add(dropped);
        let dropAV = { x: 0, z: 0 }, wispLife = 0;

        // fairing halves (real half-cone shells that tumble away in 3D)
        const halfGeo = new T.ConeGeometry(0.46, 1.25, 14, 1, true, 0, Math.PI);
        const fairings = [0, 1].map(i => {
          const m = new T.Mesh(halfGeo, new T.MeshStandardMaterial({
            color: 0x4af0e0, metalness: 0.5, roughness: 0.3, emissive: 0x0c4a44, emissiveIntensity: 0.5,
            side: T.DoubleSide, transparent: true, opacity: 1
          }));
          m.visible = false;
          m.userData = { vel: new T.Vector3(), av: new T.Vector3(), life: 0 };
          scene.add(m);
          return m;
        });

        // separation-thruster burst (radial particle puff at the interstage)
        const bN = 40, bG = new T.BufferGeometry();
        const bP = new Float32Array(bN * 3), bV = [], bR = [];
        for (let i = 0; i < bN; i++) { bP[i*3+1] = -999; bV.push(new T.Vector3()); bR.push(new T.Vector3()); }
        bG.setAttribute("position", new T.BufferAttribute(bP, 3));
        const burstMat = new T.PointsMaterial({ color: 0xcfe8ff, size: 0.19, transparent: true, opacity: 0 });
        scene.add(new T.Points(bG, burstMat));
        let burstLife = 0;

        // main exhaust particles
        const PN = 320;
        const pg = new T.BufferGeometry();
        const pp = new Float32Array(PN * 3);
        const spdArr = new Float32Array(PN);
        for (let i = 0; i < PN; i++) { pp[i*3+1] = -999; spdArr[i] = 0.5 + Math.random(); }
        pg.setAttribute("position", new T.BufferAttribute(pp, 3));
        const exVy = new Float32Array(PN);
        const exMat = new T.PointsMaterial({ color: 0xffa050, size: 0.24, transparent: true, opacity: 0.9 });
        scene.add(new T.Points(pg, exMat));

        scene.add(new T.AmbientLight(0x9aabc4, 0.75));
        const sun = new T.DirectionalLight(0xffffff, 1.0);
        sun.position.set(5, 9, 6);
        scene.add(sun);
        const engineLight = new T.PointLight(0xff8844, 0, 9);
        scene.add(engineLight);
        let igniteFlash = 0;

        // HDR bloom (fallback to plain render if the passes didn't load)
        const useBloom = !!(T.EffectComposer && T.RenderPass && T.UnrealBloomPass);
        let composer = null;
        if (useBloom) {
          composer = new T.EffectComposer(renderer);
          composer.addPass(new T.RenderPass(scene, cam));
          composer.addPass(new T.UnrealBloomPass(new T.Vector2(640, H), 0.9, 0.55, 0.7));
        }

        const ALT = [0, 1.6, 6, 26, 42, 70];       // world-space target altitude per phase
        const TILT = [0, 0.14, 0.42, 0.82, 1.05, 1.28];
        const SKY = [0x0d1b30, 0x0a1626, 0x061020, 0x030a16, 0x02060e, 0x01030a].map(h => new T.Color(h));
        const STAR_O = [0.15, 0.25, 0.5, 0.75, 0.88, 0.95];
        let y = 0, x = 0, tilt = 0, dropT = 0, raf, prevPh = 0;
        let lastX = 0, lastY = 0, vehVX = 0, vehVY = 0;
        const dropRel = new T.Vector3();
        const clock3 = new T.Clock();

        const onSize = () => {
          const w = canvas.parentElement ? canvas.parentElement.clientWidth : 640;
          renderer.setSize(w, H, false);
          if (composer) composer.setSize(w, H);
          cam.aspect = w / H;
          cam.updateProjectionMatrix();
        };
        onSize();
        window.addEventListener("resize", onSize);

        const tick = () => {
          const dt = Math.min(clock3.getDelta(), 0.05);
          const ph = phaseRef.current;

          // --- phase-transition events ---
          if (ph !== prevPh) {
            if (ph >= 3 && prevPh < 3) {
              // stage separation: booster detaches with a thruster puff and tumbles
              dropped.visible = true;
              dropped.position.copy(rocket.position);
              dropped.rotation.copy(rocket.rotation);
              dropAV = { x: 0.25 + Math.random() * 0.2, z: -(0.55 + Math.random() * 0.3) };
              dropRel.set(0, 0, 0);
              dropT = 0; wispLife = 1.7; igniteFlash = 1;
              for (let i = 0; i < bN; i++) {
                bR[i].set(0, 0, 0);
                const a = Math.random() * Math.PI * 2, up = (Math.random() - 0.3) * 1.6;
                bV[i].set(Math.cos(a) * (1.6 + Math.random()), up, Math.sin(a) * (1.6 + Math.random()));
              }
              burstLife = 0.6;
            }
            if (ph >= 4 && prevPh < 4) {
              // fairing jettison: two shells peel outward and tumble away
              nose.visible = false;
              const nosePos = new T.Vector3(0, 6.2, 0).applyEuler(rocket.rotation).add(rocket.position);
              fairings.forEach((m, i) => {
                const dir = i === 0 ? 1 : -1;
                m.visible = true;
                m.material.opacity = 1;
                m.scale.set(1, 1, 1);
                m.position.copy(nosePos);
                m.rotation.copy(rocket.rotation);
                m.rotation.y = i === 0 ? 0 : Math.PI;
                m.userData.rel = new T.Vector3(0, 0, 0);
                m.userData.vel.set(dir * (1.4 + Math.random() * 0.5), 0.5, dir * 0.55);
                m.userData.av.set((Math.random() - 0.5) * 2.6, dir * 1.7, dir * (1.9 + Math.random()));
                m.userData.life = 2.8;
              });
            }
            if (ph < 3) { dropped.visible = false; fairings.forEach(m => m.visible = false); }
            if (ph < 4) { fairings.forEach(m => m.visible = false); nose.visible = true; }
            prevPh = ph;
          }

          // --- rocket kinematics ---
          y += (ALT[ph] - y) * Math.min(1, dt * 1.3);
          x += ((ph >= 1 ? y * 0.42 : 0) - x) * Math.min(1, dt * 1.1);
          vehVX = (x - lastX) / Math.max(dt, 1e-4); vehVY = (y - lastY) / Math.max(dt, 1e-4);
          lastX = x; lastY = y;
          tilt += (TILT[ph] - tilt) * Math.min(1, dt * 1.6);
          rocket.position.set(x, y, 0);
          rocket.rotation.z = -tilt;
          stage1.visible = ph < 3; fins.visible = ph < 3; inter.visible = ph < 3;
          sat.visible = ph >= 5;

          // --- altitude atmosphere: sky darkens, stars emerge, ground fades ---
          scene.background.lerp(SKY[ph], Math.min(1, dt * 1.6));
          scene.fog.color.copy(scene.background);
          starsMat.opacity += (STAR_O[ph] - starsMat.opacity) * Math.min(1, dt * 2);
          grid.material.opacity = Math.max(0, 1 - y / 26);
          pad.material.opacity = grid.material.opacity;
          tower.material.opacity = grid.material.opacity;

          // --- dropped booster: tumble, drift back, dying wisp ---
          if (dropped.visible) {
            dropT += dt;
            dropRel.x -= dt * (0.35 + dropT * 0.5);
            dropRel.y -= dt * (0.35 + dropT * 1.9);
            dropped.position.set(x + dropRel.x, y + dropRel.y, 0);
            dropped.rotation.z += dropAV.z * dt;
            dropped.rotation.x += dropAV.x * dt;
            if (wispLife > 0) {
              wispLife -= dt;
              wisp.material.opacity = Math.max(0, wispLife / 1.7) * 0.5;
              wisp.scale.y = 0.5 + wispLife;
            }
            if (dropRel.y < -13) dropped.visible = false;
          }

          // --- separation burst ---
          if (burstLife > 0) {
            burstLife -= dt;
            burstMat.opacity = Math.max(0, burstLife / 0.6) * 0.95;
            const bBase = new T.Vector3(0, 1.7, 0).applyEuler(rocket.rotation).add(rocket.position);
            bBase.x += dropRel.x * 0.5; bBase.y += dropRel.y * 0.5;
            for (let i = 0; i < bN; i++) {
              bR[i].addScaledVector(bV[i], dt);
              bP[i*3] = bBase.x + bR[i].x; bP[i*3+1] = bBase.y + bR[i].y; bP[i*3+2] = bBase.z + bR[i].z;
            }
            bG.attributes.position.needsUpdate = true;
          } else { burstMat.opacity = 0; }

          // --- fairing halves: peel, tumble, shrink, fade ---
          fairings.forEach(m => {
            if (!m.visible) return;
            const u = m.userData;
            u.life -= dt;
            if (u.life <= 0) { m.visible = false; return; }
            u.vel.y -= dt * 2.6;
            u.rel.addScaledVector(u.vel, dt);
            const nw = new T.Vector3(0, 6.2, 0).applyEuler(rocket.rotation).add(rocket.position);
            m.position.copy(nw).add(u.rel);
            m.rotation.x += u.av.x * dt;
            m.rotation.y += u.av.y * dt;
            m.rotation.z += u.av.z * dt;
            m.scale.multiplyScalar(Math.max(0.2, 1 - dt * 0.12));
            m.material.opacity = Math.min(1, u.life / 1.3);
          });

          // --- main exhaust ---
          const thrust = ph < 3 ? 1 : ph < 5 ? 0.55 : 0;
          exMat.color.setHex(ph >= 3 ? 0xf5c842 : 0xffa050);
          const arr = pg.attributes.position.array;
          const nozzle = new T.Vector3(0, ph < 3 ? 0.2 : 4.0, 0).applyEuler(rocket.rotation).add(rocket.position);
          let emit = thrust > 0 ? Math.ceil(thrust * 5) : 0;
          for (let i = 0; i < PN; i++) {
            const alive = arr[i*3+1] > -500;
            if (!alive && emit > 0) {
              arr[i*3]   = nozzle.x + (Math.random() - 0.5) * 0.25;
              arr[i*3+1] = nozzle.y;
              arr[i*3+2] = (Math.random() - 0.5) * 0.25;
              exVy[i] = vehVY * 0.6;
              emit--;
            } else if (alive) {
              exVy[i] -= dt * 40;
              arr[i*3+1] += (exVy[i] - (5 + spdArr[i] * 6)) * dt;
              arr[i*3]   += (Math.random() - 0.5) * dt * 1.6;
              if (cam.position.y - arr[i*3+1] > 17 || nozzle.y - arr[i*3+1] > 10) arr[i*3+1] = -999;
            }
          }
          pg.attributes.position.needsUpdate = true;

          // engine glow + ignition flash at staging
          igniteFlash = Math.max(0, igniteFlash - dt * 2.2);
          engineLight.position.copy(nozzle);
          engineLight.intensity = (thrust > 0 ? thrust * (2.2 + Math.random() * 1.2) : 0) + igniteFlash * 7;

          // camera: chase, rocket held left-of-centre so the HUD never overlaps
          const shake = ph === 2 ? 0.12 : 0;
          cam.position.set(
            x + 6.5 + (Math.random() - 0.5) * shake,
            y + 3.5 + (Math.random() - 0.5) * shake,
            10.5
          );
          cam.lookAt(x + 1.6, y + (ph >= 3 ? 4.6 : 2.2), 0);
          if (composer) composer.render(); else renderer.render(scene, cam);
          raf = requestAnimationFrame(tick);
        };
        tick();
        return () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", onSize);
          renderer.dispose();
        };
      }, []);

      return (
        <div className="gfx">
          <div className="l3d-wrap">
            <canvas ref={canvasRef} className="l3d-canvas" aria-label="3D launch sequence" />
            <div className="l3d-horizon" style={{ opacity: horizonOpacity }} aria-hidden="true" />
            {/* altitude ruler */}
            <div className="l3d-ruler" aria-hidden="true">
              <div className="lr-track">
                {[0, 100, 200, 300].map(v => (
                  <span key={v} className="lr-tick" style={{ bottom: (v / RULER_MAX * 100) + "%" }}>{v}</span>
                ))}
                <span className="lr-karman" style={{ bottom: (100 / RULER_MAX * 100) + "%" }}>SPACE</span>
                <span className="lr-marker" style={{ bottom: rulerPct + "%" }}>▶</span>
              </div>
            </div>
            {/* mission-control telemetry HUD */}
            <div className="l3d-hud">
              <div className="hud-clock">T+{mm}:{ss}</div>
              <div className="hud-phase">{p.name.toUpperCase()}</div>
              <div className="hud-metric"><span>VEL</span><b>{spd.toFixed(2)}</b><i>km/s</i></div>
              <div className="hud-bar"><div style={{ width: Math.min(100, spd / 7.8 * 100) + "%" }} /></div>
              <div className="hud-metric"><span>ALT</span><b>{Math.round(alt)}</b><i>km</i></div>
              <div className="hud-bar"><div style={{ width: rulerPct + "%" }} /></div>
            </div>
            {p.warn && <div className="l3d-warn">⚠ MAX-Q</div>}
          </div>
          <p className="ls-desc">{p.desc}</p>
          <div className="gfx-controls">
            <button className="btn btn-ghost gfx-btn" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>← Back</button>
            {idx < LAUNCH_PHASES.length - 1
              ? <button className="btn btn-primary gfx-btn" onClick={() => { sfx.play("click"); setIdx(idx + 1); }}>Next: {LAUNCH_PHASES[idx + 1].name} →</button>
              : <button className="btn btn-primary gfx-btn" onClick={() => setIdx(0)}>↺ Replay launch</button>}
          </div>
        </div>
      );
    }

    /* =================================================================
       3) Orbit visualiser (Module 3)
       ================================================================= */
    const ORBITS = [
      { id: "LEO", name: "Low Earth Orbit", color: "#4AF0E0", r: 54, dur: 7,  alt: "200–2,000 km", period: "~90 minutes", use: "Starlink, the ISS and Earth-observation — over 90% of all satellites live here." },
      { id: "SSO", name: "Sun-Synchronous Orbit", color: "#F5C842", r: 80, dur: 10, alt: "600–800 km", period: "~100 minutes", use: "Earth observation with consistent lighting. Near-polar, ~97° inclination.", polar: true },
      { id: "MEO", name: "Medium Earth Orbit", color: "#FF7A45", r: 106, dur: 18, alt: "2,000–36,000 km", period: "2–12 hours", use: "Navigation — GPS satellites sit at about 20,200 km." },
      { id: "GEO", name: "Geostationary Orbit", color: "#52E07C", r: 132, dur: 46, alt: "35,786 km", period: "24 hours", use: "TV broadcast & weather — appears fixed over one spot on Earth." }
    ];

    function OrbitVisualiser() {
      const [sel, setSel] = useState(null);
      const C = 150;
      const durFor = (o) => sel ? (o.id === sel ? o.dur * 0.85 : o.dur * 3.4) : o.dur;
      const detail = ORBITS.find(o => o.id === sel);
      const circlePath = (r) => `M${C},${C - r} a${r},${r} 0 1,1 0,${2 * r} a${r},${r} 0 1,1 0,${-2 * r}`;
      const ellipsePath = (rx, ry) => `M${C},${C - ry} a${rx},${ry} 0 1,1 0,${2 * ry} a${rx},${ry} 0 1,1 0,${-2 * ry}`;

      return (
        <div className="gfx ov-wrap">
          <svg className="ov-svg" viewBox="0 0 300 300" role="img" aria-label="Orbit visualiser">
            <defs>
              <radialGradient id="ovEarth" cx="0.42" cy="0.4" r="0.62">
                <stop offset="0" stopColor="#3D7FBE" /><stop offset="0.7" stopColor="#1B4E84" /><stop offset="1" stopColor="#0A2C50" />
              </radialGradient>
            </defs>
            {/* Earth */}
            <g className="ov-earth">
              <circle cx={C} cy={C} r="24" fill="url(#ovEarth)" stroke="#2E6FB0" strokeWidth="0.6" />
              <ellipse cx="144" cy="143" rx="7" ry="4" fill="#3AA66B" opacity="0.85" />
              <ellipse cx="158" cy="152" rx="5" ry="6" fill="#3AA66B" opacity="0.8" />
              <ellipse cx="150" cy="161" rx="4" ry="2.5" fill="#3AA66B" opacity="0.7" />
            </g>
            {ORBITS.map(o => {
              const dim = sel && sel !== o.id;
              const isSel = sel === o.id;
              const pathId = "orb_" + o.id;
              const wrap = o.polar ? { transform: `rotate(24 ${C} ${C})` } : {};
              const d = o.polar ? ellipsePath(o.r * 0.32, o.r) : circlePath(o.r);
              return (
                <g key={o.id} {...wrap}>
                  <path id={pathId} d={d} fill="none"
                    stroke={o.color} strokeWidth={isSel ? 2.4 : 1.2}
                    strokeDasharray={o.polar ? "3 3" : "none"}
                    opacity={dim ? 0.22 : 0.8} style={{ transition: "opacity .3s, stroke-width .3s" }} />
                  {/* fat invisible hit target */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth="15"
                    style={{ cursor: "pointer" }}
                    onClick={() => setSel(isSel ? null : o.id)} />
                  {/* satellite */}
                  <g opacity={dim ? 0.3 : 1} style={{ transition: "opacity .3s" }}>
                    <g>
                      <circle r="3.4" fill={o.color} />
                      <rect x="-7" y="-1" width="3.5" height="2" fill={o.color} opacity="0.7" />
                      <rect x="3.5" y="-1" width="3.5" height="2" fill={o.color} opacity="0.7" />
                      <animateMotion key={o.id + (sel || "")} dur={`${durFor(o)}s`} repeatCount="indefinite">
                        <mpath href={"#" + pathId} />
                      </animateMotion>
                    </g>
                  </g>
                  {/* ring label */}
                  <text x={C} y={C - o.r - 4} textAnchor="middle" fill={o.color}
                    fontFamily="ui-monospace, Menlo, monospace" fontSize="9" opacity={dim ? 0.3 : 0.9}
                    style={{ pointerEvents: "none" }}>{o.id}</text>
                </g>
              );
            })}
          </svg>
          <div className="ov-panel">
            {detail ? (
              <div className="ov-card" key={detail.id} style={{ borderColor: detail.color }}>
                <div className="ov-name" style={{ color: detail.color }}>{detail.id} — {detail.name}</div>
                <div className="ov-row"><span>Altitude</span><b>{detail.alt}</b></div>
                <div className="ov-row"><span>Period</span><b>{detail.period}</b></div>
                <p className="ov-use">{detail.use}</p>
                <button className="reset-btn" onClick={() => setSel(null)}>Show all orbits</button>
              </div>
            ) : (
              <div className="ov-hint">
                <p>Four orbits, four jobs. Notice how the closest satellite races round while the outermost barely moves.</p>
                <p className="muted">Tap any ring to slow it down and read its details.</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    /* =================================================================
       4) Delta-v budget + staging animation (Module 2)
       ================================================================= */
    const DV_MASS = {
      idle:  { prop: 90, str: 6, pay: 4, label: "At lift-off, ~90% of the rocket is propellant." },
      burn1: { prop: 34, str: 6, pay: 4, label: "First stage burning — propellant pouring out." },
      sep:   { prop: 34, str: 2, pay: 4, label: "First stage empty — dropped to shed dead weight." },
      burn2: { prop: 6,  str: 2, pay: 4, label: "Second stage burning in vacuum toward orbital speed." },
      orbit: { prop: 2,  str: 2, pay: 4, label: "Orbit reached — only the payload remains, now circling Earth." }
    };

    function DeltaVBudget() {
      const [phase, setPhase] = useState("idle");
      const [fuel1, setFuel1] = useState(1);
      const [fuel2, setFuel2] = useState(1);
      const [spdTarget, setSpdTarget] = useState(0);
      const [stage1Gone, setStage1Gone] = useState(false);
      const [deployed, setDeployed] = useState(false);
      const timers = useRef([]);
      const spd = useCountUp(spdTarget, 2300);
      const mass = DV_MASS[phase];

      useEffect(() => () => timers.current.forEach(clearTimeout), []);

      const play = () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setStage1Gone(false); setDeployed(false);
        setFuel1(1); setFuel2(1); setSpdTarget(0); setPhase("idle");
        const T = (ms, fn) => timers.current.push(setTimeout(fn, ms));
        T(250, () => { setPhase("burn1"); setFuel1(0); setSpdTarget(2.4); });
        T(2900, () => { setPhase("sep"); setStage1Gone(true); });
        T(4000, () => { setPhase("burn2"); setFuel2(0); setSpdTarget(7.8); });
        T(6600, () => { setPhase("orbit"); setDeployed(true); });
      };
      const running = phase !== "idle" && phase !== "orbit";

      // fuel tank fill geometry (anchored at bottom of each tank)
      const tank1 = { x: 52, y: 150, w: 36, h: 92 };
      const tank2 = { x: 57, y: 78, w: 26, h: 56 };
      const f1h = tank1.h * fuel1, f2h = tank2.h * fuel2;

      return (
        <div className="gfx">
          {/* mass breakdown bar */}
          <div className="dv-barwrap">
            <div className="dv-bar">
              <div className="dv-seg" style={{ width: mass.prop + "%", background: "var(--cyan)" }} />
              <div className="dv-seg" style={{ width: mass.str + "%", background: "var(--orange)" }} />
              <div className="dv-seg" style={{ width: mass.pay + "%", background: "var(--green)" }} />
            </div>
            <div className="dv-legend">
              <span><i style={{ background: "var(--cyan)" }} />Propellant 90%</span>
              <span><i style={{ background: "var(--orange)" }} />Structure & engines 6%</span>
              <span><i style={{ background: "var(--green)" }} />Payload 4%</span>
            </div>
            <p className="dv-status">{mass.label}</p>
          </div>

          <svg className="dv-svg" viewBox="0 0 150 300" role="img" aria-label="Staging animation">
            {/* orbit arc on deploy */}
            {deployed && <ellipse className="ls-fade" cx="100" cy="70" rx="46" ry="24" fill="none" stroke="#4AF0E0" strokeWidth="1.2" strokeDasharray="3 3" transform="rotate(-16 100 70)" />}

            {/* falling first stage */}
            {stage1Gone && (
              <g className="dv-fall">
                <rect x="-18" y="-46" width="36" height="92" rx="3" fill="#0E1726" stroke="#52E07C" strokeWidth="1.5" />
                <path d="M-18,30 L-30,46 L-18,46 Z" fill="#0E1726" stroke="#52E07C" strokeWidth="1.2" />
                <path d="M18,30 L30,46 L18,46 Z" fill="#0E1726" stroke="#52E07C" strokeWidth="1.2" />
              </g>
            )}

            {/* exhaust */}
            {phase === "burn1" && <path className="ls-flame" d="M58,242 L70,290 L82,242 Z" fill="#FF7A45" />}
            {phase === "burn2" && <path className="ls-flame" d="M64,134 L70,168 L76,134 Z" fill="#F5C842" />}

            {/* rocket: payload + second stage (+ first stage until gone) */}
            <g style={{ transition: "transform 1s", transform: deployed ? "translateY(-14px)" : "none", transformBox: "fill-box" }}>
              {/* payload */}
              <path d="M70,40 L78,62 L62,62 Z" fill={deployed ? "#0E1726" : "#0E1726"} stroke="#52E07C" strokeWidth="1.6" />
              {/* second stage tank */}
              <rect x={tank2.x} y={tank2.y} width={tank2.w} height={tank2.h} rx="2" fill="#0E1726" stroke="#F5C842" strokeWidth="1.6" />
              <rect x={tank2.x} y={tank2.y + (tank2.h - f2h)} width={tank2.w} height={f2h} rx="2" fill="#F5C842" opacity="0.5" style={{ transition: "height 2.4s linear, y 2.4s linear" }} />
              {/* interstage */}
              <rect x="55" y="134" width="30" height="14" fill="#0E1726" stroke="#FF7A45" strokeWidth="1.3" />
              {/* first stage tank */}
              {!stage1Gone && <>
                <rect x={tank1.x} y={tank1.y} width={tank1.w} height={tank1.h} rx="3" fill="#0E1726" stroke="#52E07C" strokeWidth="1.6" />
                <rect x={tank1.x} y={tank1.y + (tank1.h - f1h)} width={tank1.w} height={f1h} rx="3" fill="#4AF0E0" opacity="0.5" style={{ transition: "height 2.6s linear, y 2.6s linear" }} />
                <path d="M52,222 L40,242 L52,242 Z" fill="#0E1726" stroke="#52E07C" strokeWidth="1.3" />
                <path d="M88,222 L100,242 L88,242 Z" fill="#0E1726" stroke="#52E07C" strokeWidth="1.3" />
                <path d="M58,242 L62,250 L78,250 L82,242 Z" fill="#1A2C3E" stroke="#FF7A45" strokeWidth="1" />
              </>}
            </g>
          </svg>

          <div className="dv-speed">VELOCITY <b>{spd.toFixed(1)}</b> km/s {spd >= 7.7 && <span className="dv-orbit">✓ orbit</span>}</div>
          <div className="gfx-controls">
            <button className="btn btn-primary gfx-btn" onClick={play} disabled={running}>
              {running ? "Launching…" : phase === "orbit" ? "↺ Replay staging" : "▶ Play staging"}
            </button>
          </div>
        </div>
      );
    }

    /* =================================================================
       Lesson block renderer
       ================================================================= */
    function Block({ b }) {
      switch (b.type) {
        case "h": return <h3 className="lesson-h">{b.text}</h3>;
        case "p": return <p className="lesson-p">{b.text}</p>;
        case "analogy":
          return <div className="box analogy"><span className="box-label">Everyday analogy</span><p>{b.text}</p></div>;
        case "insight":
          return <div className="box insight"><span className="box-label">Key insight</span><p>{b.text}</p></div>;
        case "warning":
          return <div className="box warning"><span className="box-label">Watch out</span><p>{b.text}</p></div>;
        case "term":
          return (
            <div className="term">
              <div className="term-name">{b.term}</div>
              <p className="term-plain">{b.plain}</p>
              <p className="term-def" dangerouslySetInnerHTML={{ __html: b.def }} />
            </div>
          );
        case "list":
          return <ul className="lesson-list">{b.items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
        case "specs":
          return (
            <div className="specs">
              {b.items.map((it, i) => (
                <div className="spec-row" key={i}>
                  <div className="spec-k">{it.k}</div>
                  <div className="spec-v">{it.v}</div>
                </div>
              ))}
            </div>
          );
        case "timeline":
          return (
            <div className="timeline">
              {b.items.map((it, i) => (
                <div className="tl-item" key={i}>
                  <div className="tl-time">{it.t}</div>
                  <div className="tl-text">{it.v}</div>
                </div>
              ))}
            </div>
          );
        case "parts":
          return (
            <div className="parts">
              {b.items.map((it, i) => (
                <div className="part" key={i}>
                  <div className="part-name">{it.k}</div>
                  <div className="part-text">{it.v}</div>
                </div>
              ))}
            </div>
          );
        case "rocketDiagram": return <RocketDiagram />;
        case "launchAnim": return HAS_WEBGL ? <Launch3D /> : <LaunchSequence />;
        case "orbitViz": return <OrbitVisualiser />;
        case "deltaVViz": return <DeltaVBudget />;
        default: return null;
      }
    }

    /* =================================================================
       Lesson view (tabs + start quiz)
       ================================================================= */
    function LessonView({ module, onStartQuiz }) {
      const [tab, setTab] = useState(0);
      useEffect(() => { setTab(0); }, [module.id]);
      const lesson = module.lessons[tab];
      return (
        <div>
          <div className="tabs">
            {module.lessons.map((l, i) => (
              <button key={i} className={"tab" + (i === tab ? " active" : "")} onClick={() => setTab(i)}>
                {l.tab}
              </button>
            ))}
          </div>
          <div className="card">
            {lesson.blocks.map((b, i) => <Block key={i} b={b} />)}
          </div>
          <div className="cta-row">
            {tab < module.lessons.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setTab(tab + 1)}>Next lesson →</button>
            ) : (
              <button className="btn btn-primary" onClick={onStartQuiz}>Take the quiz →</button>
            )}
            {tab > 0 && (
              <button className="btn btn-ghost" onClick={() => setTab(tab - 1)}>← Back</button>
            )}
          </div>
        </div>
      );
    }

    /* =================================================================
       Quiz
       ================================================================= */
    function Quiz({ module, onFinish, onExit, onAnswer }) {
      // Shuffle question order and the options within each question, fresh per attempt.
      const deck = useMemo(() => {
        const shuffle = (arr) => {
          const a = arr.slice();
          for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
          }
          return a;
        };
        return shuffle(module.quiz).map(q => ({
          q: q.q,
          explain: q.explain,
          options: shuffle(q.options.map((text, i) => ({ text, correct: i === q.answer })))
        }));
      }, [module]);

      const [idx, setIdx] = useState(0);
      const [picked, setPicked] = useState(null);
      const [correct, setCorrect] = useState(0);
      const total = deck.length;
      const question = deck[idx];

      function choose(i) {
        if (picked !== null) return;
        setPicked(i);
        const ok = question.options[i].correct;
        if (ok) setCorrect(c => c + 1);
        if (onAnswer) onAnswer(ok);
      }
      function next() {
        if (idx + 1 < total) { setIdx(idx + 1); setPicked(null); }
        else { onFinish(correct, total); }
      }

      const letters = ["A", "B", "C", "D"];
      const isRight = picked !== null && question.options[picked].correct;
      return (
        <div>
          <div className="quiz-head">
            <span className="q-count">QUESTION {idx + 1} / {total}</span>
            <button className="reset-btn" onClick={onExit}>← Back to lessons</button>
          </div>
          <div className="card">
            <h2 className="q-text">{question.q}</h2>
            <div className="options">
              {question.options.map((opt, i) => {
                let cls = "opt";
                if (picked !== null) {
                  if (opt.correct) cls += " correct";
                  else if (i === picked) cls += " wrong";
                }
                return (
                  <button key={i} className={cls} disabled={picked !== null} onClick={() => choose(i)}>
                    <span className="opt-key">{letters[i]}</span>
                    <span>{opt.text}</span>
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className={"feedback " + (isRight ? "right" : "wrong-fb")}>
                <span className="fb-label">{isRight ? "Correct" : "Not quite"}</span>
                <p>{question.explain}</p>
              </div>
            )}
          </div>
          {picked !== null && (
            <div className="cta-row">
              <button className="btn btn-primary" onClick={next}>
                {idx + 1 < total ? "Next question →" : "See results →"}
              </button>
            </div>
          )}
        </div>
      );
    }

    /* =================================================================
       Results
       ================================================================= */
    function Results({ module, score, total, hasNext, onRetry, onContinue, onReview, xpEarned, newBadge }) {
      const pct = Math.round((score / total) * 100);
      const passed = score / total >= PASS;
      const deg = Math.round((score / total) * 360);
      const ringColor = passed ? "var(--green)" : "var(--orange)";
      const starCount = score === total ? 3 : passed ? 2 : score / total >= 0.6 ? 1 : 0;
      return (
        <div className="card results">
          <div className="mission-tag">{passed ? "MISSION COMPLETE" : "MISSION FAILED — RETRY AVAILABLE"}</div>
          <div className="score-ring" style={{ "--ring-deg": deg + "deg", "--ring-color": ringColor }}>
            <div className="score-inner">
              <span className="score-pct">{pct}%</span>
              <span className="score-frac">{score} / {total}</span>
            </div>
          </div>
          <div className="stars-earned" aria-label={starCount + " of 3 stars"}>
            {[0, 1, 2].map(i => <span key={i} className={"star-slot" + (i < starCount ? " lit" : "")}>★</span>)}
          </div>
          {passed ? (
            <>
              <h2>Mission complete! 🚀</h2>
              <p className="r-sub">
                You scored {pct}% — above the 80% needed to advance.
                {hasNext ? " The next mission is now unlocked." : " That was the final mission — you've completed Orbit Academy!"}
              </p>
              {(xpEarned > 0 || newBadge) && (
                <div className="reward-row">
                  {xpEarned > 0 && <span className="reward-chip xp-chip">+{xpEarned} XP</span>}
                  {newBadge && <span className="reward-chip badge-chip">{newBadge.icon} Badge: {newBadge.name}</span>}
                </div>
              )}
              <div className="cta-row" style={{ justifyContent: "center" }}>
                {hasNext
                  ? <button className="btn btn-primary" onClick={onContinue}>Continue to next module →</button>
                  : <button className="btn btn-primary" onClick={onReview}>Review this module</button>}
                <button className="btn btn-ghost" onClick={onRetry}>Retake quiz</button>
              </div>
            </>
          ) : (
            <>
              <h2>Not quite there yet</h2>
              <p className="r-sub">
                You scored {pct}%. You need 80% (at least {Math.ceil(total * PASS)} of {total}) to unlock the next module.
                Review the lessons and try again — you've got this.
              </p>
              <div className="cta-row" style={{ justifyContent: "center" }}>
                <button className="btn btn-primary" onClick={onRetry}>Try again</button>
                <button className="btn btn-ghost" onClick={onReview}>Review lessons</button>
              </div>
            </>
          )}
        </div>
      );
    }

    /* =================================================================
       App
       ================================================================= */
    function App() {
      const [progress, setProgress] = useState(loadProgress);
      const [currentId, setCurrentId] = useState(1);
      const [mode, setMode] = useState("lesson"); // lesson | quiz | results
      const [result, setResult] = useState(null);  // { score, total, xpEarned, newBadge }
      const [profile, setProfile] = useState(loadProfile);
      const [toasts, setToasts] = useState([]);
      const toastId = useRef(0);

      useEffect(() => { saveProgress(progress); }, [progress]);
      useEffect(() => { saveProfile(profile); }, [profile]);

      const rank = rankFor(profile.xp);
      const nextRankPct = rank.next
        ? Math.round(((profile.xp - rank.xp) / (rank.next.xp - rank.xp)) * 100)
        : 100;

      function pushToast(text, kind) {
        const id = ++toastId.current;
        setToasts(t => [...t, { id, text, kind }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
      }

      function addXP(amount, label) {
        setProfile(prev => {
          const before = rankFor(prev.xp);
          const xp = prev.xp + amount;
          const after = rankFor(xp);
          if (after.index > before.index) {
            if (!prev.muted) sfx.play("levelup");
            pushToast("RANK UP — " + after.name + "!", "rankup");
          }
          return { ...prev, xp };
        });
        if (label) pushToast(label, "xp");
      }

      function handleAnswer(ok) {
        if (!profile.muted) sfx.play(ok ? "correct" : "wrong");
        if (ok) addXP(20, "+20 XP — correct answer");
      }

      function toggleMute() {
        setProfile(prev => ({ ...prev, muted: !prev.muted }));
      }

      const module = MODULES.find(m => m.id === currentId);
      const completedCount = MODULES.filter(m => progress[m.id] && progress[m.id].completed).length;
      const pctComplete = Math.round((completedCount / MODULES.length) * 100);

      function selectModule(id) {
        if (!isUnlocked(id, progress)) return;
        setCurrentId(id);
        setMode("lesson");
        setResult(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      function finishQuiz(score, total) {
        const passed = score / total >= PASS;
        let xpEarned = 0;
        let newBadge = null;
        if (passed) {
          if (!profile.muted) sfx.play("complete");
          xpEarned += 50;                          // mission-pass bonus
          if (score === total) xpEarned += 30;     // perfect-score bonus
          const firstClear = !(progress[currentId] && progress[currentId].completed);
          if (firstClear) {
            xpEarned += 100;                       // first-clearance bonus
            newBadge = MODULE_BADGES[currentId];
            setProfile(prev => prev.badges.includes(currentId)
              ? prev
              : { ...prev, badges: [...prev.badges, currentId] });
            if (!profile.muted) sfx.play("badge");
          }
          addXP(xpEarned, null);
          setProgress(prev => {
            const next = { ...prev };
            const prevBest = (next[currentId] && next[currentId].best) || 0;
            next[currentId] = { completed: true, best: Math.max(prevBest, score) };
            return next;
          });
        }
        setResult({ score, total, xpEarned, newBadge });
        setMode("results");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      function continueNext() {
        const nextId = currentId + 1;
        if (MODULES.some(m => m.id === nextId)) selectModule(nextId);
      }

      function resetProgress() {
        if (window.confirm("Reset all progress? This will re-lock every module.")) {
          setProgress({});
          setCurrentId(1);
          setMode("lesson");
          setResult(null);
        }
      }

      const hasNext = MODULES.some(m => m.id === currentId + 1);

      return (
        <>
          <Space3D />
          {/* Toast notifications (XP, rank-ups, badges) */}
          <div className="toast-stack" aria-live="polite">
            {toasts.map(t => (
              <div key={t.id} className={"toast toast-" + t.kind}>{t.text}</div>
            ))}
          </div>
          <div className="app" style={{ "--accent": module.accent }}>
            {/* Header */}
            <header className="header">
              <div className="header-inner">
                <div className="brand">
                  <div className="logo">🛰️</div>
                  <div>
                    <h1>Orbit Academy</h1>
                    <div className="tag">Learn the rocket industry</div>
                  </div>
                </div>
                <div className="progress-wrap">
                  <div className="progress-label">
                    <span className="rank-name">{rank.icon} {rank.name.toUpperCase()}</span>
                    <span>{profile.xp} XP{rank.next ? " · next rank " + rank.next.xp : " · MAX RANK"}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: nextRankPct + "%" }} />
                  </div>
                  <div className="progress-label sub">
                    <span>COURSE {pctComplete}%</span>
                    <span>{completedCount}/{MODULES.length} missions</span>
                  </div>
                </div>
                <button className="mute-btn" onClick={toggleMute} title={profile.muted ? "Unmute sounds" : "Mute sounds"} aria-label="Toggle sound">
                  {profile.muted ? "🔇" : "🔊"}
                </button>
              </div>
            </header>

            {/* Layout */}
            <div className="layout">
              {/* Sidebar */}
              <aside className="sidebar">
                <p className="sidebar-title">Modules</p>
                <div className="nav-list">
                  {MODULES.map(m => {
                    const unlocked = isUnlocked(m.id, progress);
                    const done = progress[m.id] && progress[m.id].completed;
                    const active = m.id === currentId;
                    let cls = "nav-item";
                    if (active) cls += " active";
                    if (done) cls += " done";
                    if (!unlocked) cls += " locked";
                    return (
                      <button key={m.id} className={cls}
                        style={{ "--accent": m.accent }}
                        onClick={() => selectModule(m.id)}
                        disabled={!unlocked}>
                        <span className="nav-num">{done ? "✓" : m.id}</span>
                        <span className="nav-body">
                          <span className="nav-name">{m.title}</span>
                          <span className="nav-meta">
                            {!unlocked ? "🔒 Locked" : done ? "Completed · best " + progress[m.id].best + "/" + m.quiz.length : (active ? "In progress" : "Unlocked")}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {profile.badges.length > 0 && (
                  <div className="badge-shelf">
                    <p className="sidebar-title">Badges</p>
                    <div className="badge-row">
                      {profile.badges.map(id => (
                        <span key={id} className="badge-pip" title={MODULE_BADGES[id].name}>
                          {MODULE_BADGES[id].icon}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="sidebar-footer">
                  <button className="reset-btn" onClick={resetProgress}>Reset progress</button>
                </div>
              </aside>

              {/* Main */}
              <main className="main">
                <div className="module-head">
                  <div className="module-kicker">MISSION 0{module.id} / 0{MODULES.length}{progress[module.id] && progress[module.id].completed ? " — CLEARED" : ""}</div>
                  <h2 className="module-title">{module.title}</h2>
                  <p className="module-sub">{module.subtitle}</p>
                </div>

                {mode === "lesson" && (
                  <LessonView module={module} onStartQuiz={() => { setMode("quiz"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                )}
                {mode === "quiz" && (
                  <Quiz module={module}
                    onFinish={finishQuiz}
                    onAnswer={handleAnswer}
                    onExit={() => setMode("lesson")} />
                )}
                {mode === "results" && result && (
                  <Results module={module} score={result.score} total={result.total}
                    hasNext={hasNext}
                    xpEarned={result.xpEarned}
                    newBadge={result.newBadge}
                    onRetry={() => { setMode("quiz"); setResult(null); }}
                    onContinue={continueNext}
                    onReview={() => setMode("lesson")} />
                )}
              </main>
            </div>
          </div>
        </>
      );
    }

    ReactDOM.createRoot(document.getElementById("root")).render(<App />);
  