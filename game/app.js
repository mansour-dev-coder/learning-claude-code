"use strict";
const { useState, useEffect, useMemo, useRef } = React;
/* =================================================================
   GAMIFICATION — ranks, XP, badges, sound, profile persistence
   ================================================================= */
const RANKS = [
    { xp: 0, name: "Cadet", icon: "▮" },
    { xp: 200, name: "Flight Trainee", icon: "▮▮" },
    { xp: 450, name: "Pilot", icon: "▮▮▮" },
    { xp: 800, name: "Mission Specialist", icon: "◆" },
    { xp: 1150, name: "Commander", icon: "◆◆" },
    { xp: 1500, name: "Flight Director", icon: "★" }
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
    RANKS.forEach((r, i) => { if (xp >= r.xp)
        idx = i; });
    return { ...RANKS[idx], index: idx, next: RANKS[idx + 1] || null };
}
const PROFILE_KEY = "orbitAcademyProfile.v1";
function loadProfile() {
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (raw)
            return { xp: 0, badges: [], muted: false, ...JSON.parse(raw) };
    }
    catch (e) { }
    return { xp: 0, badges: [], muted: false };
}
function saveProfile(p) {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    }
    catch (e) { }
}
/* Tiny WebAudio synth — no audio files needed */
const sfx = (() => {
    let ctx = null;
    const SEQ = {
        correct: [[660, 0, 0.10, "triangle"], [880, 0.09, 0.16, "triangle"]],
        wrong: [[170, 0, 0.22, "sawtooth"], [120, 0.1, 0.2, "sawtooth"]],
        click: [[520, 0, 0.05, "triangle"]],
        levelup: [[523, 0, 0.1, "triangle"], [659, 0.1, 0.1, "triangle"], [784, 0.2, 0.1, "triangle"], [1047, 0.3, 0.28, "triangle"]],
        complete: [[392, 0, 0.14, "triangle"], [523, 0.12, 0.14, "triangle"], [659, 0.24, 0.14, "triangle"], [784, 0.36, 0.34, "triangle"]],
        badge: [[880, 0, 0.09, "sine"], [1174, 0.09, 0.2, "sine"]]
    };
    function play(name) {
        try {
            ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === "suspended")
                ctx.resume();
            const now = ctx.currentTime;
            (SEQ[name] || []).forEach(([f, off, dur, type]) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = type;
                o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, now + off);
                g.gain.exponentialRampToValueAtTime(0.14, now + off + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, now + off + dur);
                o.connect(g);
                g.connect(ctx.destination);
                o.start(now + off);
                o.stop(now + off + dur + 0.05);
            });
        }
        catch (e) { }
    }
    return { play };
})();
/* WebGL + three.js availability (3D scenes fall back to SVG/CSS without it) */
const HAS_WEBGL = (() => {
    try {
        if (!window.THREE)
            return false;
        const c = document.createElement("canvas");
        return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
    }
    catch (e) {
        return false;
    }
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
                        ] },
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
                        ] },
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
                        ] },
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
                        ] },
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
                        ] },
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
                        ] },
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
                        ] },
                    { type: "h", text: "What customers actually care about (in order)" },
                    { type: "list", items: [
                            "1. Reliability — will my satellite actually reach orbit?",
                            "2. Schedule certainty — will it launch when promised?",
                            "3. Exact orbit — does it go precisely where my satellite needs to be?",
                            "4. Price — how much per kilogram?",
                            "5. Responsiveness — how easy is the provider to work with?"
                        ] },
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
                        ] },
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
                        ] },
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
        if (raw)
            return JSON.parse(raw);
    }
    catch (e) { }
    return {}; // { [id]: { completed: bool, best: number } }
}
function saveProgress(p) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    }
    catch (e) { }
}
function isUnlocked(id, progress) {
    if (id === 1)
        return true;
    const prev = progress[id - 1];
    return !!(prev && prev.completed);
}
/* =================================================================
   Star field
   ================================================================= */
function StarField() {
    const stars = useMemo(() => Array.from({ length: 110 }, () => ({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2 + 1,
        dur: (2 + Math.random() * 3).toFixed(2) + "s",
        delay: (Math.random() * 4).toFixed(2) + "s"
    })), []);
    return (React.createElement("div", { className: "starfield", "aria-hidden": "true" }, stars.map((s, i) => (React.createElement("span", { key: i, className: "star", style: {
            top: s.top + "%", left: s.left + "%",
            width: s.size + "px", height: s.size + "px",
            "--dur": s.dur, animationDelay: s.delay
        } })))));
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
        if (!HAS_WEBGL || !ref.current)
            return;
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
        for (let i = 0; i < N * 3; i++)
            sp[i] = (Math.random() - 0.5) * 90;
        sg.setAttribute("position", new T.BufferAttribute(sp, 3));
        const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.8 }));
        scene.add(stars);
        // --- Photoreal Earth: NASA-derived maps (day, normal, specular,
        //     night-side city lights) plus a separate rotating cloud layer ---
        const loader = new T.TextureLoader();
        const dayMap = loader.load("vendor/tex/earth_atmos_2048.jpg");
        const normalMap = loader.load("vendor/tex/earth_normal_2048.jpg");
        const specMap = loader.load("vendor/tex/earth_specular_2048.jpg");
        const lightsMap = loader.load("vendor/tex/earth_lights_2048.png");
        const cloudsMap = loader.load("vendor/tex/earth_clouds_1024.png");
        const group = new T.Group();
        const earth = new T.Mesh(new T.SphereGeometry(1.6, 64, 64), new T.MeshPhongMaterial({
            map: dayMap,
            normalMap: normalMap,
            normalScale: new T.Vector2(0.85, 0.85),
            specularMap: specMap,
            specular: new T.Color(0x2a3a4a),
            shininess: 18,
            emissive: new T.Color(0xffdd99),
            emissiveMap: lightsMap,
            emissiveIntensity: 0.55
        }));
        group.add(earth);
        const clouds = new T.Mesh(new T.SphereGeometry(1.63, 64, 64), new T.MeshLambertMaterial({ map: cloudsMap, transparent: true, opacity: 0.85, depthWrite: false }));
        group.add(clouds);
        // atmosphere: fresnel-style glow shader on a back-side shell
        const atmo = new T.Mesh(new T.SphereGeometry(1.74, 48, 48), new T.ShaderMaterial({
            transparent: true, side: T.BackSide, depthWrite: false,
            vertexShader: "varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
            fragmentShader: "varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.4); gl_FragColor = vec4(0.29, 0.94, 0.88, 1.0) * i; }"
        }));
        group.add(atmo);
        // satellites on inclined orbit rings
        const sats = [];
        [[2.35, 0.5, 0x4AF0E0, 0.85], [2.75, -0.95, 0xF5C842, 0.55], [3.2, 1.25, 0xFF7A45, 0.4]].forEach(([r, inc, col, speed]) => {
            const tiltX = Math.PI / 2 + inc * 0.35;
            const ring = new T.Mesh(new T.RingGeometry(r - 0.006, r + 0.006, 90), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: T.DoubleSide }));
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
            if (composer)
                composer.setSize(w, h);
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
            if (composer)
                composer.render();
            else
                renderer.render(scene, cam);
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
    if (!HAS_WEBGL)
        return React.createElement(StarField, null);
    return React.createElement("canvas", { ref: ref, className: "space3d", "aria-hidden": "true" });
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
            if (k < 1)
                raf = requestAnimationFrame(tick);
            else
                fromRef.current = target;
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
    const label = (id, color, y, text) => (React.createElement("g", { style: { pointerEvents: "none", opacity: sel && sel !== id ? 0.3 : 1, transition: "opacity .25s" } },
        React.createElement("line", { x1: "112", y1: y, x2: "122", y2: y, stroke: color, strokeWidth: "1", strokeDasharray: "2 2" }),
        React.createElement("text", { x: "108", y: y + 3, textAnchor: "end", fill: color, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "9" }, text)));
    return (React.createElement("div", { className: "gfx rk-wrap" },
        React.createElement("svg", { className: "rk-svg", viewBox: "0 0 240 400", role: "img", "aria-label": "Interactive rocket diagram" },
            React.createElement("g", { style: styleFor("fairing", "#4AF0E0"), onClick: () => setSel("fairing") },
                React.createElement("path", { d: "M150,14 C172,58 176,84 176,96 L124,96 C124,84 128,58 150,14 Z", ...shape("fairing", "#4AF0E0") }),
                React.createElement("rect", { x: "124", y: "96", width: "52", height: "24", ...shape("fairing", "#4AF0E0") })),
            React.createElement("g", { style: styleFor("second", "#F5C842"), onClick: () => setSel("second") },
                React.createElement("rect", { x: "124", y: "120", width: "52", height: "70", rx: "2", ...shape("second", "#F5C842") })),
            React.createElement("g", { style: styleFor("interstage", "#FF7A45"), onClick: () => setSel("interstage") },
                React.createElement("rect", { x: "127", y: "190", width: "46", height: "22", ...shape("interstage", "#FF7A45") })),
            React.createElement("g", { style: styleFor("first", "#52E07C"), onClick: () => setSel("first") },
                React.createElement("rect", { x: "124", y: "212", width: "52", height: "144", rx: "2", ...shape("first", "#52E07C") }),
                React.createElement("path", { d: "M124,330 L104,356 L124,356 Z", ...shape("first", "#52E07C") }),
                React.createElement("path", { d: "M176,330 L196,356 L176,356 Z", ...shape("first", "#52E07C") })),
            React.createElement("g", { style: styleFor("engines", "#FF7A45"), onClick: () => setSel("engines") },
                React.createElement("rect", { x: "126", y: "354", width: "48", height: "8", ...shape("engines", "#FF7A45") }),
                React.createElement("path", { d: "M132,360 L130,386 L144,386 L142,360 Z", ...shape("engines", "#FF7A45") }),
                React.createElement("path", { d: "M145,360 L143,388 L157,388 L155,360 Z", ...shape("engines", "#FF7A45") }),
                React.createElement("path", { d: "M158,360 L156,386 L170,386 L168,360 Z", ...shape("engines", "#FF7A45") })),
            label("fairing", "#4AF0E0", 60, "Payload Fairing"),
            label("second", "#F5C842", 155, "Second Stage"),
            label("interstage", "#FF7A45", 201, "Interstage"),
            label("first", "#52E07C", 290, "First Stage"),
            label("engines", "#FF7A45", 372, "Engine Cluster")),
        React.createElement("div", { className: "rk-panel", key: sel },
            React.createElement("div", { className: "rk-pname", style: { color: part.color } }, part.name),
            React.createElement("p", { className: "rk-plain" }, part.plain),
            React.createElement("p", { className: "rk-def" }, part.def))));
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
    return (React.createElement("div", { className: "gfx" },
        React.createElement("div", { className: "ls-readout" },
            React.createElement("div", { className: "ls-phase" },
                React.createElement("span", { className: "ls-time" }, p.t),
                " ",
                p.name),
            React.createElement("div", { className: "ls-meters" },
                React.createElement("span", null,
                    "ALT ",
                    React.createElement("b", null, Math.round(alt).toLocaleString()),
                    " km"),
                React.createElement("span", null,
                    "VEL ",
                    React.createElement("b", null, spd.toFixed(1)),
                    " km/s"))),
        React.createElement("svg", { className: "ls-svg", viewBox: "0 0 300 320", role: "img", "aria-label": "Launch sequence animation" },
            React.createElement("defs", null,
                React.createElement("linearGradient", { id: "sky", x1: "0", y1: "0", x2: "0", y2: "1" },
                    React.createElement("stop", { offset: "0", stopColor: "#02040A" }),
                    React.createElement("stop", { offset: "1", stopColor: "#0B1626" })),
                React.createElement("radialGradient", { id: "earthG", cx: "0.5", cy: "0.5", r: "0.5" },
                    React.createElement("stop", { offset: "0", stopColor: "#2E6FB0" }),
                    React.createElement("stop", { offset: "1", stopColor: "#0E3A66" }))),
            React.createElement("rect", { x: "0", y: "0", width: "300", height: "320", fill: "url(#sky)" }),
            React.createElement("rect", { x: "0", y: "296", width: "300", height: "24", fill: "#10202E" }),
            React.createElement("rect", { x: "132", y: "288", width: "36", height: "10", fill: "#1A2C3E" }),
            idx >= 5 && (React.createElement("g", { className: "ls-fade" },
                React.createElement("path", { d: "M-40,300 A 240 240 0 0 1 340 300", fill: "none", stroke: "#22597f", strokeWidth: "3", opacity: "0.6" }),
                React.createElement("g", { transform: "rotate(-18 210 120)" },
                    React.createElement("ellipse", { cx: "210", cy: "120", rx: "120", ry: "60", fill: "none", stroke: "#4AF0E0", strokeWidth: "1.4", strokeDasharray: "4 4", opacity: "0.85" }),
                    React.createElement("path", { id: "insPath", d: "M210,60 a120,60 0 1,1 0,120 a120,60 0 1,1 0,-120", fill: "none", stroke: "none" }),
                    React.createElement("g", null,
                        React.createElement("rect", { x: "-6", y: "-4", width: "12", height: "8", rx: "1.5", fill: "#4AF0E0" }),
                        React.createElement("rect", { x: "-12", y: "-2", width: "5", height: "4", fill: "#9fe9ff" }),
                        React.createElement("rect", { x: "7", y: "-2", width: "5", height: "4", fill: "#9fe9ff" }),
                        React.createElement("animateMotion", { dur: "6s", repeatCount: "indefinite", rotate: "auto" },
                            React.createElement("mpath", { href: "#insPath" })))))),
            idx === 3 && (React.createElement("g", { className: "ls-fall" },
                React.createElement("rect", { x: "-7", y: "-26", width: "14", height: "26", rx: "2", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.5" }),
                React.createElement("path", { d: "M-7,-6 L-15,2 L-7,2 Z", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.2" }))),
            idx === 4 && (React.createElement(React.Fragment, null,
                React.createElement("path", { className: "ls-fairL", d: "M0,-30 C-9,-12 -11,-2 -11,4 L0,4 Z", fill: "#0E1726", stroke: "#4AF0E0", strokeWidth: "1.4" }),
                React.createElement("path", { className: "ls-fairR", d: "M0,-30 C9,-12 11,-2 11,4 L0,4 Z", fill: "#0E1726", stroke: "#4AF0E0", strokeWidth: "1.4" }))),
            React.createElement("g", { style: { transform: `translate(${tx}px, ${ty}px) rotate(${p.tilt}deg)`, transformBox: "fill-box", transition: "transform 1.1s cubic-bezier(.45,.05,.35,1)" } },
                flame > 0 && (React.createElement("path", { className: "ls-flame", d: `M-6,0 L0,${22 + 26 * flame} L6,0 Z`, fill: flame > 0.7 ? "#FF7A45" : "#F5C842", opacity: flame })),
                idx < 3 && React.createElement("rect", { x: "-7", y: "-32", width: "14", height: "26", rx: "2", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.5" }),
                React.createElement("rect", { x: "-6", y: "-58", width: "12", height: idx < 3 ? 26 : 52, rx: "2", fill: "#0E1726", stroke: "#F5C842", strokeWidth: "1.5" }),
                idx < 4
                    ? React.createElement("path", { d: "M0,-80 L7,-58 L-7,-58 Z", fill: "#0E1726", stroke: "#4AF0E0", strokeWidth: "1.5" })
                    : idx < 5 && React.createElement("rect", { x: "-4", y: "-66", width: "8", height: "8", rx: "1", fill: "#4AF0E0" }),
                React.createElement("path", { d: "M-7,-6 L-5,2 L5,2 L7,-6 Z", fill: "#1A2C3E", stroke: "#FF7A45", strokeWidth: "1" })),
            p.warn && (React.createElement("g", { className: "ls-warn" },
                React.createElement("rect", { x: "18", y: "18", width: "74", height: "20", rx: "4", fill: "rgba(255,77,77,.15)", stroke: "#FF4D4D" }),
                React.createElement("text", { x: "55", y: "32", textAnchor: "middle", fill: "#FF4D4D", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "11" }, "\u26A0 MAX-Q")))),
        React.createElement("p", { className: "ls-desc" }, p.desc),
        React.createElement("div", { className: "gfx-controls" },
            React.createElement("button", { className: "btn btn-ghost gfx-btn", onClick: () => setIdx(Math.max(0, idx - 1)), disabled: idx === 0 }, "\u2190 Back"),
            idx < LAUNCH_PHASES.length - 1
                ? React.createElement("button", { className: "btn btn-primary gfx-btn", onClick: () => setIdx(idx + 1) },
                    "Next: ",
                    LAUNCH_PHASES[idx + 1].name,
                    " \u2192")
                : React.createElement("button", { className: "btn btn-primary gfx-btn", onClick: () => setIdx(0) }, "\u21BA Replay launch"))));
}
/* =================================================================
   2b) 3D launch scene — WebGL upgrade of the launch sequence.
   Same phase data/controls; real-time rocket, particle exhaust,
   camera follow with Max-Q shake, stage separation, orbit deploy.
   ================================================================= */
function Launch3D() {
    const [idx, setIdx] = useState(0);
    const canvasRef = useRef(null);
    const phaseRef = useRef(0);
    const p = LAUNCH_PHASES[idx];
    const alt = useCountUp(p.alt, 900);
    const spd = useCountUp(p.spd, 900);
    useEffect(() => { phaseRef.current = idx; }, [idx]);
    useEffect(() => {
        const T = window.THREE;
        const canvas = canvasRef.current;
        if (!canvas)
            return;
        const renderer = new T.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        const H = 340;
        const scene = new T.Scene();
        scene.background = new T.Color(0x02040a);
        scene.fog = new T.Fog(0x02040a, 30, 110);
        const cam = new T.PerspectiveCamera(55, 2, 0.1, 300);
        // sky stars
        const sN = 400, sG = new T.BufferGeometry(), sP = new Float32Array(sN * 3);
        for (let i = 0; i < sN; i++) {
            sP[i * 3] = (Math.random() - 0.5) * 160;
            sP[i * 3 + 1] = 10 + Math.random() * 120;
            sP[i * 3 + 2] = -30 - Math.random() * 60;
        }
        sG.setAttribute("position", new T.BufferAttribute(sP, 3));
        scene.add(new T.Points(sG, new T.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.7 })));
        // ground + pad
        scene.add(new T.GridHelper(160, 80, 0x1e2a3c, 0x121e2e));
        const pad = new T.Mesh(new T.BoxGeometry(3.4, 0.3, 3.4), new T.MeshPhongMaterial({ color: 0x1a2c3e }));
        pad.position.y = 0.15;
        scene.add(pad);
        const tower = new T.Mesh(new T.BoxGeometry(0.25, 6.5, 0.25), new T.MeshPhongMaterial({ color: 0x223448 }));
        tower.position.set(-1.5, 3.25, 0);
        scene.add(tower);
        // rocket
        const mat = (c) => new T.MeshPhongMaterial({ color: c, shininess: 40 });
        const rocket = new T.Group();
        const stage1 = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 3.4, 20), mat(0xdfe8f2));
        stage1.position.y = 2.0;
        rocket.add(stage1);
        const fins = new T.Group();
        for (let i = 0; i < 3; i++) {
            const f = new T.Mesh(new T.BoxGeometry(0.08, 0.9, 0.55), mat(0x9fb2c8));
            const a = (i / 3) * Math.PI * 2;
            f.position.set(Math.cos(a) * 0.55, 0.75, Math.sin(a) * 0.55);
            f.rotation.y = -a;
            fins.add(f);
        }
        rocket.add(fins);
        const inter = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 0.3, 20), mat(0xff7a45));
        inter.position.y = 3.85;
        rocket.add(inter);
        const stage2 = new T.Mesh(new T.CylinderGeometry(0.44, 0.5, 1.6, 20), mat(0xc9d6e6));
        stage2.position.y = 4.8;
        rocket.add(stage2);
        const nose = new T.Mesh(new T.ConeGeometry(0.44, 1.2, 20), mat(0x4af0e0));
        nose.position.y = 6.2;
        rocket.add(nose);
        const sat = new T.Mesh(new T.BoxGeometry(0.4, 0.3, 0.4), new T.MeshBasicMaterial({ color: 0x4af0e0 }));
        sat.visible = false;
        rocket.add(sat);
        sat.position.y = 5.9;
        scene.add(rocket);
        // dropped first stage (clone shown falling after separation)
        const dropped = new T.Group();
        dropped.add(stage1.clone(), fins.clone());
        dropped.visible = false;
        scene.add(dropped);
        // exhaust particles
        const PN = 320;
        const pg = new T.BufferGeometry();
        const pp = new Float32Array(PN * 3);
        const spdArr = new Float32Array(PN);
        for (let i = 0; i < PN; i++) {
            pp[i * 3 + 1] = -999;
            spdArr[i] = 0.5 + Math.random();
        }
        pg.setAttribute("position", new T.BufferAttribute(pp, 3));
        const exhaust = new T.Points(pg, new T.PointsMaterial({ color: 0xffa050, size: 0.2, transparent: true, opacity: 0.9 }));
        scene.add(exhaust);
        scene.add(new T.AmbientLight(0x8899bb, 0.6));
        const sun = new T.DirectionalLight(0xffffff, 1.0);
        sun.position.set(5, 9, 6);
        scene.add(sun);
        // flickering engine glow
        const engineLight = new T.PointLight(0xff8844, 0, 9);
        scene.add(engineLight);
        // HDR bloom (fallback to plain render if the passes didn't load)
        const useBloom = !!(T.EffectComposer && T.RenderPass && T.UnrealBloomPass);
        let composer = null;
        if (useBloom) {
            composer = new T.EffectComposer(renderer);
            composer.addPass(new T.RenderPass(scene, cam));
            composer.addPass(new T.UnrealBloomPass(new T.Vector2(640, H), 1.0, 0.6, 0.6));
        }
        const ALT = [0, 1.6, 6, 26, 42, 70]; // world-space target altitude per phase
        const TILT = [0, 0.14, 0.42, 0.82, 1.05, 1.28];
        let y = 0, x = 0, tilt = 0, dropT = 0, raf;
        const clock = new T.Clock();
        const onSize = () => {
            const w = canvas.parentElement ? canvas.parentElement.clientWidth : 640;
            renderer.setSize(w, H, false);
            if (composer)
                composer.setSize(w, H);
            cam.aspect = w / H;
            cam.updateProjectionMatrix();
        };
        onSize();
        window.addEventListener("resize", onSize);
        const tick = () => {
            const dt = Math.min(clock.getDelta(), 0.05);
            const ph = phaseRef.current;
            y += (ALT[ph] - y) * Math.min(1, dt * 1.3);
            x += ((ph >= 1 ? y * 0.42 : 0) - x) * Math.min(1, dt * 1.1);
            tilt += (TILT[ph] - tilt) * Math.min(1, dt * 1.6);
            rocket.position.set(x, y, 0);
            rocket.rotation.z = -tilt;
            // stage separation
            stage1.visible = ph < 3;
            fins.visible = ph < 3;
            inter.visible = ph < 3;
            if (ph >= 3 && !dropped.visible && ph < 5) {
                dropped.visible = true;
                dropped.position.copy(rocket.position);
                dropped.rotation.copy(rocket.rotation);
                dropT = 0;
            }
            if (dropped.visible) {
                dropT += dt;
                dropped.position.y -= dt * (2 + 8 * dropT * 0.4);
                dropped.rotation.z -= dt * 0.7;
                if (dropped.position.y < -6)
                    dropped.visible = false;
            }
            nose.visible = ph < 4;
            sat.visible = ph >= 5;
            // exhaust spray from the nozzle
            const thrust = ph < 3 ? 1 : ph < 5 ? 0.55 : 0;
            const arr = pg.attributes.position.array;
            const nozzle = new T.Vector3(0, 0.2, 0).applyEuler(rocket.rotation).add(rocket.position);
            for (let i = 0; i < PN; i++) {
                let py = arr[i * 3 + 1];
                if (thrust > 0 && (py < -500 || Math.random() < 0.10 * thrust)) {
                    arr[i * 3] = nozzle.x + (Math.random() - 0.5) * 0.25;
                    arr[i * 3 + 1] = nozzle.y;
                    arr[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
                }
                else if (py > -500) {
                    arr[i * 3 + 1] -= dt * (5 + spdArr[i] * 6);
                    arr[i * 3] += (Math.random() - 0.5) * dt * 1.4;
                    if (arr[i * 3 + 1] < -2)
                        arr[i * 3 + 1] = -999;
                }
                if (thrust === 0 && py > -500 && Math.random() < 0.1)
                    arr[i * 3 + 1] = -999;
            }
            pg.attributes.position.needsUpdate = true;
            // engine glow follows the nozzle, flickering with thrust
            engineLight.position.copy(nozzle);
            engineLight.intensity = thrust > 0 ? thrust * (2.2 + Math.random() * 1.2) : 0;
            // camera: chase with shake at Max-Q
            const shake = ph === 2 ? 0.12 : 0;
            cam.position.set(x + 6.5 + (Math.random() - 0.5) * shake, y + 3.5 + (Math.random() - 0.5) * shake, 10.5);
            cam.lookAt(x, y + 2.2, 0);
            if (composer)
                composer.render();
            else
                renderer.render(scene, cam);
            raf = requestAnimationFrame(tick);
        };
        tick();
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onSize);
            renderer.dispose();
        };
    }, []);
    return (React.createElement("div", { className: "gfx" },
        React.createElement("div", { className: "ls-readout" },
            React.createElement("div", { className: "ls-phase" },
                React.createElement("span", { className: "ls-time" }, p.t),
                " ",
                p.name),
            React.createElement("div", { className: "ls-meters" },
                React.createElement("span", null,
                    "ALT ",
                    React.createElement("b", null, Math.round(alt).toLocaleString()),
                    " km"),
                React.createElement("span", null,
                    "VEL ",
                    React.createElement("b", null, spd.toFixed(1)),
                    " km/s"))),
        React.createElement("div", { className: "l3d-wrap" },
            React.createElement("canvas", { ref: canvasRef, className: "l3d-canvas", "aria-label": "3D launch sequence" }),
            p.warn && React.createElement("div", { className: "l3d-warn" }, "\u26A0 MAX-Q")),
        React.createElement("p", { className: "ls-desc" }, p.desc),
        React.createElement("div", { className: "gfx-controls" },
            React.createElement("button", { className: "btn btn-ghost gfx-btn", onClick: () => setIdx(Math.max(0, idx - 1)), disabled: idx === 0 }, "\u2190 Back"),
            idx < LAUNCH_PHASES.length - 1
                ? React.createElement("button", { className: "btn btn-primary gfx-btn", onClick: () => { sfx.play("click"); setIdx(idx + 1); } },
                    "Next: ",
                    LAUNCH_PHASES[idx + 1].name,
                    " \u2192")
                : React.createElement("button", { className: "btn btn-primary gfx-btn", onClick: () => setIdx(0) }, "\u21BA Replay launch"))));
}
/* =================================================================
   3) Orbit visualiser (Module 3)
   ================================================================= */
const ORBITS = [
    { id: "LEO", name: "Low Earth Orbit", color: "#4AF0E0", r: 54, dur: 7, alt: "200–2,000 km", period: "~90 minutes", use: "Starlink, the ISS and Earth-observation — over 90% of all satellites live here." },
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
    return (React.createElement("div", { className: "gfx ov-wrap" },
        React.createElement("svg", { className: "ov-svg", viewBox: "0 0 300 300", role: "img", "aria-label": "Orbit visualiser" },
            React.createElement("defs", null,
                React.createElement("radialGradient", { id: "ovEarth", cx: "0.42", cy: "0.4", r: "0.62" },
                    React.createElement("stop", { offset: "0", stopColor: "#3D7FBE" }),
                    React.createElement("stop", { offset: "0.7", stopColor: "#1B4E84" }),
                    React.createElement("stop", { offset: "1", stopColor: "#0A2C50" }))),
            React.createElement("g", { className: "ov-earth" },
                React.createElement("circle", { cx: C, cy: C, r: "24", fill: "url(#ovEarth)", stroke: "#2E6FB0", strokeWidth: "0.6" }),
                React.createElement("ellipse", { cx: "144", cy: "143", rx: "7", ry: "4", fill: "#3AA66B", opacity: "0.85" }),
                React.createElement("ellipse", { cx: "158", cy: "152", rx: "5", ry: "6", fill: "#3AA66B", opacity: "0.8" }),
                React.createElement("ellipse", { cx: "150", cy: "161", rx: "4", ry: "2.5", fill: "#3AA66B", opacity: "0.7" })),
            ORBITS.map(o => {
                const dim = sel && sel !== o.id;
                const isSel = sel === o.id;
                const pathId = "orb_" + o.id;
                const wrap = o.polar ? { transform: `rotate(24 ${C} ${C})` } : {};
                const d = o.polar ? ellipsePath(o.r * 0.32, o.r) : circlePath(o.r);
                return (React.createElement("g", { key: o.id, ...wrap },
                    React.createElement("path", { id: pathId, d: d, fill: "none", stroke: o.color, strokeWidth: isSel ? 2.4 : 1.2, strokeDasharray: o.polar ? "3 3" : "none", opacity: dim ? 0.22 : 0.8, style: { transition: "opacity .3s, stroke-width .3s" } }),
                    React.createElement("path", { d: d, fill: "none", stroke: "transparent", strokeWidth: "15", style: { cursor: "pointer" }, onClick: () => setSel(isSel ? null : o.id) }),
                    React.createElement("g", { opacity: dim ? 0.3 : 1, style: { transition: "opacity .3s" } },
                        React.createElement("g", null,
                            React.createElement("circle", { r: "3.4", fill: o.color }),
                            React.createElement("rect", { x: "-7", y: "-1", width: "3.5", height: "2", fill: o.color, opacity: "0.7" }),
                            React.createElement("rect", { x: "3.5", y: "-1", width: "3.5", height: "2", fill: o.color, opacity: "0.7" }),
                            React.createElement("animateMotion", { key: o.id + (sel || ""), dur: `${durFor(o)}s`, repeatCount: "indefinite" },
                                React.createElement("mpath", { href: "#" + pathId })))),
                    React.createElement("text", { x: C, y: C - o.r - 4, textAnchor: "middle", fill: o.color, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "9", opacity: dim ? 0.3 : 0.9, style: { pointerEvents: "none" } }, o.id)));
            })),
        React.createElement("div", { className: "ov-panel" }, detail ? (React.createElement("div", { className: "ov-card", key: detail.id, style: { borderColor: detail.color } },
            React.createElement("div", { className: "ov-name", style: { color: detail.color } },
                detail.id,
                " \u2014 ",
                detail.name),
            React.createElement("div", { className: "ov-row" },
                React.createElement("span", null, "Altitude"),
                React.createElement("b", null, detail.alt)),
            React.createElement("div", { className: "ov-row" },
                React.createElement("span", null, "Period"),
                React.createElement("b", null, detail.period)),
            React.createElement("p", { className: "ov-use" }, detail.use),
            React.createElement("button", { className: "reset-btn", onClick: () => setSel(null) }, "Show all orbits"))) : (React.createElement("div", { className: "ov-hint" },
            React.createElement("p", null, "Four orbits, four jobs. Notice how the closest satellite races round while the outermost barely moves."),
            React.createElement("p", { className: "muted" }, "Tap any ring to slow it down and read its details."))))));
}
/* =================================================================
   4) Delta-v budget + staging animation (Module 2)
   ================================================================= */
const DV_MASS = {
    idle: { prop: 90, str: 6, pay: 4, label: "At lift-off, ~90% of the rocket is propellant." },
    burn1: { prop: 34, str: 6, pay: 4, label: "First stage burning — propellant pouring out." },
    sep: { prop: 34, str: 2, pay: 4, label: "First stage empty — dropped to shed dead weight." },
    burn2: { prop: 6, str: 2, pay: 4, label: "Second stage burning in vacuum toward orbital speed." },
    orbit: { prop: 2, str: 2, pay: 4, label: "Orbit reached — only the payload remains, now circling Earth." }
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
        setStage1Gone(false);
        setDeployed(false);
        setFuel1(1);
        setFuel2(1);
        setSpdTarget(0);
        setPhase("idle");
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
    return (React.createElement("div", { className: "gfx" },
        React.createElement("div", { className: "dv-barwrap" },
            React.createElement("div", { className: "dv-bar" },
                React.createElement("div", { className: "dv-seg", style: { width: mass.prop + "%", background: "var(--cyan)" } }),
                React.createElement("div", { className: "dv-seg", style: { width: mass.str + "%", background: "var(--orange)" } }),
                React.createElement("div", { className: "dv-seg", style: { width: mass.pay + "%", background: "var(--green)" } })),
            React.createElement("div", { className: "dv-legend" },
                React.createElement("span", null,
                    React.createElement("i", { style: { background: "var(--cyan)" } }),
                    "Propellant 90%"),
                React.createElement("span", null,
                    React.createElement("i", { style: { background: "var(--orange)" } }),
                    "Structure & engines 6%"),
                React.createElement("span", null,
                    React.createElement("i", { style: { background: "var(--green)" } }),
                    "Payload 4%")),
            React.createElement("p", { className: "dv-status" }, mass.label)),
        React.createElement("svg", { className: "dv-svg", viewBox: "0 0 150 300", role: "img", "aria-label": "Staging animation" },
            deployed && React.createElement("ellipse", { className: "ls-fade", cx: "100", cy: "70", rx: "46", ry: "24", fill: "none", stroke: "#4AF0E0", strokeWidth: "1.2", strokeDasharray: "3 3", transform: "rotate(-16 100 70)" }),
            stage1Gone && (React.createElement("g", { className: "dv-fall" },
                React.createElement("rect", { x: "-18", y: "-46", width: "36", height: "92", rx: "3", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.5" }),
                React.createElement("path", { d: "M-18,30 L-30,46 L-18,46 Z", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.2" }),
                React.createElement("path", { d: "M18,30 L30,46 L18,46 Z", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.2" }))),
            phase === "burn1" && React.createElement("path", { className: "ls-flame", d: "M58,242 L70,290 L82,242 Z", fill: "#FF7A45" }),
            phase === "burn2" && React.createElement("path", { className: "ls-flame", d: "M64,134 L70,168 L76,134 Z", fill: "#F5C842" }),
            React.createElement("g", { style: { transition: "transform 1s", transform: deployed ? "translateY(-14px)" : "none", transformBox: "fill-box" } },
                React.createElement("path", { d: "M70,40 L78,62 L62,62 Z", fill: deployed ? "#0E1726" : "#0E1726", stroke: "#52E07C", strokeWidth: "1.6" }),
                React.createElement("rect", { x: tank2.x, y: tank2.y, width: tank2.w, height: tank2.h, rx: "2", fill: "#0E1726", stroke: "#F5C842", strokeWidth: "1.6" }),
                React.createElement("rect", { x: tank2.x, y: tank2.y + (tank2.h - f2h), width: tank2.w, height: f2h, rx: "2", fill: "#F5C842", opacity: "0.5", style: { transition: "height 2.4s linear, y 2.4s linear" } }),
                React.createElement("rect", { x: "55", y: "134", width: "30", height: "14", fill: "#0E1726", stroke: "#FF7A45", strokeWidth: "1.3" }),
                !stage1Gone && React.createElement(React.Fragment, null,
                    React.createElement("rect", { x: tank1.x, y: tank1.y, width: tank1.w, height: tank1.h, rx: "3", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.6" }),
                    React.createElement("rect", { x: tank1.x, y: tank1.y + (tank1.h - f1h), width: tank1.w, height: f1h, rx: "3", fill: "#4AF0E0", opacity: "0.5", style: { transition: "height 2.6s linear, y 2.6s linear" } }),
                    React.createElement("path", { d: "M52,222 L40,242 L52,242 Z", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.3" }),
                    React.createElement("path", { d: "M88,222 L100,242 L88,242 Z", fill: "#0E1726", stroke: "#52E07C", strokeWidth: "1.3" }),
                    React.createElement("path", { d: "M58,242 L62,250 L78,250 L82,242 Z", fill: "#1A2C3E", stroke: "#FF7A45", strokeWidth: "1" })))),
        React.createElement("div", { className: "dv-speed" },
            "VELOCITY ",
            React.createElement("b", null, spd.toFixed(1)),
            " km/s ",
            spd >= 7.7 && React.createElement("span", { className: "dv-orbit" }, "\u2713 orbit")),
        React.createElement("div", { className: "gfx-controls" },
            React.createElement("button", { className: "btn btn-primary gfx-btn", onClick: play, disabled: running }, running ? "Launching…" : phase === "orbit" ? "↺ Replay staging" : "▶ Play staging"))));
}
/* =================================================================
   Lesson block renderer
   ================================================================= */
function Block({ b }) {
    switch (b.type) {
        case "h": return React.createElement("h3", { className: "lesson-h" }, b.text);
        case "p": return React.createElement("p", { className: "lesson-p" }, b.text);
        case "analogy":
            return React.createElement("div", { className: "box analogy" },
                React.createElement("span", { className: "box-label" }, "Everyday analogy"),
                React.createElement("p", null, b.text));
        case "insight":
            return React.createElement("div", { className: "box insight" },
                React.createElement("span", { className: "box-label" }, "Key insight"),
                React.createElement("p", null, b.text));
        case "warning":
            return React.createElement("div", { className: "box warning" },
                React.createElement("span", { className: "box-label" }, "Watch out"),
                React.createElement("p", null, b.text));
        case "term":
            return (React.createElement("div", { className: "term" },
                React.createElement("div", { className: "term-name" }, b.term),
                React.createElement("p", { className: "term-plain" }, b.plain),
                React.createElement("p", { className: "term-def", dangerouslySetInnerHTML: { __html: b.def } })));
        case "list":
            return React.createElement("ul", { className: "lesson-list" }, b.items.map((it, i) => React.createElement("li", { key: i }, it)));
        case "specs":
            return (React.createElement("div", { className: "specs" }, b.items.map((it, i) => (React.createElement("div", { className: "spec-row", key: i },
                React.createElement("div", { className: "spec-k" }, it.k),
                React.createElement("div", { className: "spec-v" }, it.v))))));
        case "timeline":
            return (React.createElement("div", { className: "timeline" }, b.items.map((it, i) => (React.createElement("div", { className: "tl-item", key: i },
                React.createElement("div", { className: "tl-time" }, it.t),
                React.createElement("div", { className: "tl-text" }, it.v))))));
        case "parts":
            return (React.createElement("div", { className: "parts" }, b.items.map((it, i) => (React.createElement("div", { className: "part", key: i },
                React.createElement("div", { className: "part-name" }, it.k),
                React.createElement("div", { className: "part-text" }, it.v))))));
        case "rocketDiagram": return React.createElement(RocketDiagram, null);
        case "launchAnim": return HAS_WEBGL ? React.createElement(Launch3D, null) : React.createElement(LaunchSequence, null);
        case "orbitViz": return React.createElement(OrbitVisualiser, null);
        case "deltaVViz": return React.createElement(DeltaVBudget, null);
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
    return (React.createElement("div", null,
        React.createElement("div", { className: "tabs" }, module.lessons.map((l, i) => (React.createElement("button", { key: i, className: "tab" + (i === tab ? " active" : ""), onClick: () => setTab(i) }, l.tab)))),
        React.createElement("div", { className: "card" }, lesson.blocks.map((b, i) => React.createElement(Block, { key: i, b: b }))),
        React.createElement("div", { className: "cta-row" },
            tab < module.lessons.length - 1 ? (React.createElement("button", { className: "btn btn-primary", onClick: () => setTab(tab + 1) }, "Next lesson \u2192")) : (React.createElement("button", { className: "btn btn-primary", onClick: onStartQuiz }, "Take the quiz \u2192")),
            tab > 0 && (React.createElement("button", { className: "btn btn-ghost", onClick: () => setTab(tab - 1) }, "\u2190 Back")))));
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
        if (picked !== null)
            return;
        setPicked(i);
        const ok = question.options[i].correct;
        if (ok)
            setCorrect(c => c + 1);
        if (onAnswer)
            onAnswer(ok);
    }
    function next() {
        if (idx + 1 < total) {
            setIdx(idx + 1);
            setPicked(null);
        }
        else {
            onFinish(correct, total);
        }
    }
    const letters = ["A", "B", "C", "D"];
    const isRight = picked !== null && question.options[picked].correct;
    return (React.createElement("div", null,
        React.createElement("div", { className: "quiz-head" },
            React.createElement("span", { className: "q-count" },
                "QUESTION ",
                idx + 1,
                " / ",
                total),
            React.createElement("button", { className: "reset-btn", onClick: onExit }, "\u2190 Back to lessons")),
        React.createElement("div", { className: "card" },
            React.createElement("h2", { className: "q-text" }, question.q),
            React.createElement("div", { className: "options" }, question.options.map((opt, i) => {
                let cls = "opt";
                if (picked !== null) {
                    if (opt.correct)
                        cls += " correct";
                    else if (i === picked)
                        cls += " wrong";
                }
                return (React.createElement("button", { key: i, className: cls, disabled: picked !== null, onClick: () => choose(i) },
                    React.createElement("span", { className: "opt-key" }, letters[i]),
                    React.createElement("span", null, opt.text)));
            })),
            picked !== null && (React.createElement("div", { className: "feedback " + (isRight ? "right" : "wrong-fb") },
                React.createElement("span", { className: "fb-label" }, isRight ? "Correct" : "Not quite"),
                React.createElement("p", null, question.explain)))),
        picked !== null && (React.createElement("div", { className: "cta-row" },
            React.createElement("button", { className: "btn btn-primary", onClick: next }, idx + 1 < total ? "Next question →" : "See results →")))));
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
    return (React.createElement("div", { className: "card results" },
        React.createElement("div", { className: "mission-tag" }, passed ? "MISSION COMPLETE" : "MISSION FAILED — RETRY AVAILABLE"),
        React.createElement("div", { className: "score-ring", style: { "--ring-deg": deg + "deg", "--ring-color": ringColor } },
            React.createElement("div", { className: "score-inner" },
                React.createElement("span", { className: "score-pct" },
                    pct,
                    "%"),
                React.createElement("span", { className: "score-frac" },
                    score,
                    " / ",
                    total))),
        React.createElement("div", { className: "stars-earned", "aria-label": starCount + " of 3 stars" }, [0, 1, 2].map(i => React.createElement("span", { key: i, className: "star-slot" + (i < starCount ? " lit" : "") }, "\u2605"))),
        passed ? (React.createElement(React.Fragment, null,
            React.createElement("h2", null, "Mission complete! \uD83D\uDE80"),
            React.createElement("p", { className: "r-sub" },
                "You scored ",
                pct,
                "% \u2014 above the 80% needed to advance.",
                hasNext ? " The next mission is now unlocked." : " That was the final mission — you've completed Orbit Academy!"),
            (xpEarned > 0 || newBadge) && (React.createElement("div", { className: "reward-row" },
                xpEarned > 0 && React.createElement("span", { className: "reward-chip xp-chip" },
                    "+",
                    xpEarned,
                    " XP"),
                newBadge && React.createElement("span", { className: "reward-chip badge-chip" },
                    newBadge.icon,
                    " Badge: ",
                    newBadge.name))),
            React.createElement("div", { className: "cta-row", style: { justifyContent: "center" } },
                hasNext
                    ? React.createElement("button", { className: "btn btn-primary", onClick: onContinue }, "Continue to next module \u2192")
                    : React.createElement("button", { className: "btn btn-primary", onClick: onReview }, "Review this module"),
                React.createElement("button", { className: "btn btn-ghost", onClick: onRetry }, "Retake quiz")))) : (React.createElement(React.Fragment, null,
            React.createElement("h2", null, "Not quite there yet"),
            React.createElement("p", { className: "r-sub" },
                "You scored ",
                pct,
                "%. You need 80% (at least ",
                Math.ceil(total * PASS),
                " of ",
                total,
                ") to unlock the next module. Review the lessons and try again \u2014 you've got this."),
            React.createElement("div", { className: "cta-row", style: { justifyContent: "center" } },
                React.createElement("button", { className: "btn btn-primary", onClick: onRetry }, "Try again"),
                React.createElement("button", { className: "btn btn-ghost", onClick: onReview }, "Review lessons"))))));
}
/* =================================================================
   App
   ================================================================= */
function App() {
    const [progress, setProgress] = useState(loadProgress);
    const [currentId, setCurrentId] = useState(1);
    const [mode, setMode] = useState("lesson"); // lesson | quiz | results
    const [result, setResult] = useState(null); // { score, total, xpEarned, newBadge }
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
                if (!prev.muted)
                    sfx.play("levelup");
                pushToast("RANK UP — " + after.name + "!", "rankup");
            }
            return { ...prev, xp };
        });
        if (label)
            pushToast(label, "xp");
    }
    function handleAnswer(ok) {
        if (!profile.muted)
            sfx.play(ok ? "correct" : "wrong");
        if (ok)
            addXP(20, "+20 XP — correct answer");
    }
    function toggleMute() {
        setProfile(prev => ({ ...prev, muted: !prev.muted }));
    }
    const module = MODULES.find(m => m.id === currentId);
    const completedCount = MODULES.filter(m => progress[m.id] && progress[m.id].completed).length;
    const pctComplete = Math.round((completedCount / MODULES.length) * 100);
    function selectModule(id) {
        if (!isUnlocked(id, progress))
            return;
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
            if (!profile.muted)
                sfx.play("complete");
            xpEarned += 50; // mission-pass bonus
            if (score === total)
                xpEarned += 30; // perfect-score bonus
            const firstClear = !(progress[currentId] && progress[currentId].completed);
            if (firstClear) {
                xpEarned += 100; // first-clearance bonus
                newBadge = MODULE_BADGES[currentId];
                setProfile(prev => prev.badges.includes(currentId)
                    ? prev
                    : { ...prev, badges: [...prev.badges, currentId] });
                if (!profile.muted)
                    sfx.play("badge");
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
        if (MODULES.some(m => m.id === nextId))
            selectModule(nextId);
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
    return (React.createElement(React.Fragment, null,
        React.createElement(Space3D, null),
        React.createElement("div", { className: "toast-stack", "aria-live": "polite" }, toasts.map(t => (React.createElement("div", { key: t.id, className: "toast toast-" + t.kind }, t.text)))),
        React.createElement("div", { className: "app", style: { "--accent": module.accent } },
            React.createElement("header", { className: "header" },
                React.createElement("div", { className: "header-inner" },
                    React.createElement("div", { className: "brand" },
                        React.createElement("div", { className: "logo" }, "\uD83D\uDEF0\uFE0F"),
                        React.createElement("div", null,
                            React.createElement("h1", null, "Orbit Academy"),
                            React.createElement("div", { className: "tag" }, "Learn the rocket industry"))),
                    React.createElement("div", { className: "progress-wrap" },
                        React.createElement("div", { className: "progress-label" },
                            React.createElement("span", { className: "rank-name" },
                                rank.icon,
                                " ",
                                rank.name.toUpperCase()),
                            React.createElement("span", null,
                                profile.xp,
                                " XP",
                                rank.next ? " · next rank " + rank.next.xp : " · MAX RANK")),
                        React.createElement("div", { className: "progress-track" },
                            React.createElement("div", { className: "progress-fill", style: { width: nextRankPct + "%" } })),
                        React.createElement("div", { className: "progress-label sub" },
                            React.createElement("span", null,
                                "COURSE ",
                                pctComplete,
                                "%"),
                            React.createElement("span", null,
                                completedCount,
                                "/",
                                MODULES.length,
                                " missions"))),
                    React.createElement("button", { className: "mute-btn", onClick: toggleMute, title: profile.muted ? "Unmute sounds" : "Mute sounds", "aria-label": "Toggle sound" }, profile.muted ? "🔇" : "🔊"))),
            React.createElement("div", { className: "layout" },
                React.createElement("aside", { className: "sidebar" },
                    React.createElement("p", { className: "sidebar-title" }, "Modules"),
                    React.createElement("div", { className: "nav-list" }, MODULES.map(m => {
                        const unlocked = isUnlocked(m.id, progress);
                        const done = progress[m.id] && progress[m.id].completed;
                        const active = m.id === currentId;
                        let cls = "nav-item";
                        if (active)
                            cls += " active";
                        if (done)
                            cls += " done";
                        if (!unlocked)
                            cls += " locked";
                        return (React.createElement("button", { key: m.id, className: cls, style: { "--accent": m.accent }, onClick: () => selectModule(m.id), disabled: !unlocked },
                            React.createElement("span", { className: "nav-num" }, done ? "✓" : m.id),
                            React.createElement("span", { className: "nav-body" },
                                React.createElement("span", { className: "nav-name" }, m.title),
                                React.createElement("span", { className: "nav-meta" }, !unlocked ? "🔒 Locked" : done ? "Completed · best " + progress[m.id].best + "/" + m.quiz.length : (active ? "In progress" : "Unlocked")))));
                    })),
                    profile.badges.length > 0 && (React.createElement("div", { className: "badge-shelf" },
                        React.createElement("p", { className: "sidebar-title" }, "Badges"),
                        React.createElement("div", { className: "badge-row" }, profile.badges.map(id => (React.createElement("span", { key: id, className: "badge-pip", title: MODULE_BADGES[id].name }, MODULE_BADGES[id].icon)))))),
                    React.createElement("div", { className: "sidebar-footer" },
                        React.createElement("button", { className: "reset-btn", onClick: resetProgress }, "Reset progress"))),
                React.createElement("main", { className: "main" },
                    React.createElement("div", { className: "module-head" },
                        React.createElement("div", { className: "module-kicker" },
                            "MISSION 0",
                            module.id,
                            " / 0",
                            MODULES.length,
                            progress[module.id] && progress[module.id].completed ? " — CLEARED" : ""),
                        React.createElement("h2", { className: "module-title" }, module.title),
                        React.createElement("p", { className: "module-sub" }, module.subtitle)),
                    mode === "lesson" && (React.createElement(LessonView, { module: module, onStartQuiz: () => { setMode("quiz"); window.scrollTo({ top: 0, behavior: "smooth" }); } })),
                    mode === "quiz" && (React.createElement(Quiz, { module: module, onFinish: finishQuiz, onAnswer: handleAnswer, onExit: () => setMode("lesson") })),
                    mode === "results" && result && (React.createElement(Results, { module: module, score: result.score, total: result.total, hasNext: hasNext, xpEarned: result.xpEarned, newBadge: result.newBadge, onRetry: () => { setMode("quiz"); setResult(null); }, onContinue: continueNext, onReview: () => setMode("lesson") })))))));
}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App, null));
