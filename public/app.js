(function () {
  const root = document.documentElement;
  root.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  setupHeader();
  setupRoute();
  setupTabs();
  setupMap();
  setupForms();
  setupDemo();
  setupAutopilot();
  setupNav();

  /* Header: solid background once the page scrolls */
  function setupHeader() {
    const header = document.querySelector("[data-header]");
    if (!header) return;
    const update = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  /* How it works: the route line fills as you scroll past each stop */
  function setupRoute() {
    const route = document.querySelector(".route");
    if (!route) return;
    const stops = Array.from(route.querySelectorAll(".stop"));
    let queued = false;
    const update = () => {
      queued = false;
      const mark = window.innerHeight * 0.6;
      const rect = route.getBoundingClientRect();
      const progress = Math.min(Math.max((mark - rect.top) / rect.height, 0), 1);
      route.style.setProperty("--route-progress", `${(progress * 100).toFixed(1)}%`);
      stops.forEach((stop) => {
        const icon = stop.querySelector(".stop-icon").getBoundingClientRect();
        stop.classList.toggle("is-passed", icon.top + icon.height / 2 < mark);
      });
    };
    const queue = () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
  }

  /* Modes: accessible tabs */
  function setupTabs() {
    document.querySelectorAll("[data-tabs]").forEach((wrap) => {
      const tabs = Array.from(wrap.querySelectorAll('[role="tab"]'));
      const select = (tab, focus) => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
          document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
        });
        if (focus) tab.focus();
      };
      tabs.forEach((tab, i) => {
        tab.addEventListener("click", () => select(tab, false));
        tab.addEventListener("keydown", (event) => {
          let next = null;
          if (event.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
          if (event.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
          if (event.key === "Home") next = tabs[0];
          if (event.key === "End") next = tabs[tabs.length - 1];
          if (next) {
            event.preventDefault();
            select(next, true);
          }
        });
      });
    });
  }

  /* Hero: animated map of example European lanes */
  function setupMap() {
    const host = document.querySelector("[data-map]");
    const stage = document.querySelector("[data-map-stage]");
    const data = window.QP_MAP;
    if (!host || !stage || !data) {
      if (host) host.hidden = true;
      return;
    }

    const NS = "http://www.w3.org/2000/svg";
    const el = (name, attrs, parent) => {
      const node = document.createElementNS(NS, name);
      Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
      if (parent) parent.appendChild(node);
      return node;
    };

    const svg = el("svg", {
      class: "map-svg",
      viewBox: `0 0 ${data.width} ${data.height}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
    });
    el("path", { class: "map-land", d: data.dots }, svg);
    const laneLayer = el("g", {}, svg);
    const hubLayer = el("g", {}, svg);
    stage.appendChild(svg);

    const SHAPES = {
      road: "M-7 -3.6h9.2v7.2h-9.2zM3 -2.8h2.6l2 2.2v3.2H3z",
      sea: "M-8 -3.2h11.5l4.5 3.2-4.5 3.2H-8z",
      air: "M8.5 0L2.5-1.3-1.5-7.5h-2.2l1.6 6.2h-4.3L-8-3.8h-1.4l.9 3.8-.9 3.8H-8l1.6-2.5h4.3l-1.6 6.2h2.2l4-6.2z",
    };
    const SPEED = { road: 34, sea: 22, air: 64 };
    const MODE_LABEL = { road: "Road", sea: "Sea", air: "Air" };

    const lanePath = (lane) => {
      const pts = lane.points;
      if (lane.arc !== null && pts.length === 2) {
        const [a, b] = pts;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const cx = (a[0] + b[0]) / 2 - dy * lane.arc;
        const cy = (a[1] + b[1]) / 2 + dx * lane.arc;
        return `M${a[0]} ${a[1]}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0]} ${b[1]}`;
      }
      // Catmull-Rom through the waypoints, as cubic Beziers.
      let d = `M${pts[0][0]} ${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[i - 1] || pts[i];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[i + 2] || p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
      }
      return d;
    };

    const lanes = data.lanes.map((lane, index) => {
      const d = lanePath(lane);
      const group = el("g", { class: `lane-group mode-${lane.mode}` }, laneLayer);
      el("path", { class: `map-glow mode-${lane.mode}`, d }, group);
      const line = el("path", { class: `map-lane mode-${lane.mode}`, d }, group);
      const hit = el("path", { class: "map-hit", d }, group);
      const length = line.getTotalLength();
      const count = length > 260 ? 2 : 1;
      const vehicles = [];
      for (let v = 0; v < count; v += 1) {
        const g = el("g", { class: `vehicle mode-${lane.mode}` }, group);
        el("circle", { class: "vehicle-halo", r: 9 }, g);
        el("path", { class: "vehicle-body", d: SHAPES[lane.mode] }, g);
        vehicles.push({ g, offset: (v / count + index * 0.137) % 1 });
      }
      return { ...lane, index, group, line, hit, length, vehicles };
    });

    const hubs = Object.entries(data.hubs).map(([code, hub]) => {
      const [x, y] = hub.xy;
      const g = el("g", { class: `hub${hub.home ? " is-home" : ""}`, transform: `translate(${x} ${y})` }, hubLayer);
      el("circle", { class: "hub-ring", r: 4 }, g);
      el("circle", { class: "hub-dot", r: hub.home ? 4.5 : 3.4 }, g);
      // Labels sit to the right by default; a few crowded hubs go left or below.
      const side = { FXT: "left", DUB: "left", LEH: "left", MAD: "left", ANR: "below", GOA: "below" }[code];
      const flip = side === "left" || x > data.width * 0.86;
      const label = el(
        "text",
        side === "below"
          ? { class: "hub-label", x: 0, y: 17, "text-anchor": "middle" }
          : { class: "hub-label", x: flip ? -9 : 9, y: 4, "text-anchor": flip ? "end" : "start" },
        g,
      );
      label.textContent = hub.name;
      return { code, ...hub, g };
    });
    const hubByCode = Object.fromEntries(hubs.map((h) => [h.code, h]));

    // Lane card and selection
    const card = host.querySelector("[data-lane-card]");
    const field = (name) => host.querySelector(`[data-lane-${name}]`);
    const steps = Array.from(host.querySelectorAll("[data-lane-steps] li"));
    const chips = Array.from(host.querySelectorAll("[data-mode]"));
    let filter = "all";
    let active = null;
    let stepTimers = [];
    let cycleTimer = null;
    let resumeTimer = null;

    const visibleLanes = () => lanes.filter((l) => filter === "all" || l.mode === filter);

    const applyClasses = () => {
      lanes.forEach((l) => {
        const shown = filter === "all" || l.mode === filter;
        l.group.classList.toggle("is-dim", !shown);
        l.group.classList.toggle("is-active", l === active);
      });
      hubs.forEach((h) => {
        const lit = active && (active.from === h.code || active.to === h.code);
        h.g.classList.toggle("is-lit", Boolean(lit));
      });
    };

    const select = (lane) => {
      if (!lane) return;
      active = lane;
      // Bring the active lane to the top of the stack
      laneLayer.appendChild(lane.group);
      applyClasses();
      card.dataset.mode = lane.mode;
      field("mode").textContent = MODE_LABEL[lane.mode];
      field("from").textContent = hubByCode[lane.from].name;
      field("to").textContent = hubByCode[lane.to].name;
      field("load").textContent = lane.load;
      field("basis").textContent = lane.basis;
      stepTimers.forEach(clearTimeout);
      steps.forEach((s) => s.classList.remove("is-done"));
      if (reduceMotion) {
        steps.forEach((s) => s.classList.add("is-done"));
      } else {
        stepTimers = steps.map((s, i) => setTimeout(() => s.classList.add("is-done"), 250 + i * 950));
      }
    };

    const next = () => {
      const list = visibleLanes();
      if (!list.length) return;
      const i = active ? list.indexOf(active) : -1;
      select(list[(i + 1) % list.length]);
    };

    const startCycle = () => {
      clearInterval(cycleTimer);
      if (reduceMotion) return;
      cycleTimer = setInterval(next, 4600);
    };

    const pauseCycle = () => {
      clearInterval(cycleTimer);
      clearTimeout(resumeTimer);
    };

    const resumeLater = () => {
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(startCycle, 3500);
    };

    lanes.forEach((lane) => {
      lane.hit.addEventListener("mouseenter", () => {
        if (filter !== "all" && lane.mode !== filter) return;
        pauseCycle();
        select(lane);
      });
      lane.hit.addEventListener("mouseleave", resumeLater);
      lane.hit.addEventListener("click", () => {
        if (filter !== "all" && lane.mode !== filter) return;
        pauseCycle();
        select(lane);
        resumeLater();
      });
    });

    hubs.forEach((hub) => {
      const pick = () => {
        const list = visibleLanes().filter((l) => l.from === hub.code || l.to === hub.code);
        if (!list.length) return;
        pauseCycle();
        const i = list.indexOf(active);
        select(list[(i + 1) % list.length]);
      };
      hub.g.addEventListener("mouseenter", pick);
      hub.g.addEventListener("click", pick);
      hub.g.addEventListener("mouseleave", resumeLater);
    });

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        filter = chip.dataset.mode;
        chips.forEach((c) => {
          const on = c === chip;
          c.classList.toggle("is-active", on);
          c.setAttribute("aria-pressed", String(on));
        });
        const list = visibleLanes();
        select(list.includes(active) ? active : list[0]);
        startCycle();
      });
    });

    // Vehicle animation
    let running = false;
    let last = 0;
    let clock = 0;

    const place = (lane, vehicle, t) => {
      const len = lane.length;
      const at = t * len;
      const p = lane.line.getPointAtLength(at);
      const q = lane.line.getPointAtLength(Math.min(at + 1, len));
      const r = at + 1 > len ? lane.line.getPointAtLength(Math.max(at - 1, 0)) : null;
      const angle = r
        ? Math.atan2(p.y - r.y, p.x - r.x)
        : Math.atan2(q.y - p.y, q.x - p.x);
      vehicle.g.setAttribute(
        "transform",
        `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`,
      );
      const edge = Math.min(t, 1 - t);
      vehicle.g.style.opacity = edge < 0.04 ? String(edge / 0.04) : "";
    };

    const frame = (now) => {
      if (!running) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      clock += dt;
      lanes.forEach((lane) => {
        const cycle = lane.length / SPEED[lane.mode];
        lane.vehicles.forEach((v) => place(lane, v, (clock / cycle + v.offset) % 1));
      });
      requestAnimationFrame(frame);
    };

    const play = () => {
      if (running || reduceMotion) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
    };

    // Static placement first, so vehicles show even with reduced motion.
    lanes.forEach((lane) => lane.vehicles.forEach((v) => place(lane, v, 0.15 + v.offset * 0.7)));

    let onScreen = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[0].isIntersecting;
        if (onScreen && !document.hidden) play();
        else stop();
      }).observe(host);
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (onScreen) play();
    });

    select(lanes.find((lane) => lane.mode === "sea") || lanes[0]);
    startCycle();
    play();
  }

  /* How it works: a sample request becomes a draft quote. Sample data only. */
  function setupDemo() {
    const demo = document.querySelector("[data-demo]");
    if (!demo) return;
    const fallback = document.querySelector("[data-demo-fallback]");
    // Sample figures only. They show how a quote is built and are not real rates.
    const MARGIN = 0.15;
    const SAMPLES = {
      email: {
        kind: "email",
        head: "Subject: Rate request, Shanghai to Rotterdam",
        body: [
          "Hello, please quote ",
          ["1 x 40' high cube", 2],
          " from ",
          ["Shanghai", 0],
          " to ",
          ["Rotterdam", 1],
          ", cargo ready ",
          ["12 December", 3],
          ". ",
          ["General cargo", 4],
          ", port to port. Thanks.",
        ],
        fields: [["From", "Shanghai"], ["To", "Rotterdam"], ["Load", "FCL, 1 x 40' high cube"], ["Ready", "12 December"], ["Cargo", "General cargo"]],
        lines: [
          ["Ocean freight", "1 x 40' HC, your FCL tariff", 2100],
          ["BAF", "per container", 320],
          ["ETS", "per container", 60],
          ["Terminal handling", "Rotterdam, per container", 260],
          ["Documentation", "per shipment", 60],
        ],
      },
      excel: {
        kind: "excel",
        head: "request.xlsx",
        rows: [
          ["Origin", ["Ningbo", 0]],
          ["Destination", ["Felixstowe", 1]],
          ["Service", ["LCL", 2]],
          ["Volume", ["6.2 cbm", 3]],
          ["Gross weight", ["2,100 kg", 4]],
        ],
        fields: [["From", "Ningbo"], ["To", "Felixstowe"], ["Service", "Sea, LCL"], ["Volume", "6.2 cbm"], ["Weight", "2,100 kg"], ["Dangerous goods", null]],
        ask: "The sheet doesn't say whether this is dangerous goods. Is it?",
        answers: ["No", "Yes"],
        lines: [
          ["Ocean freight", "6.2 w/m x \u20ac68, your LCL tariff", 421.6],
          ["BAF", "6.2 w/m x \u20ac9", 55.8],
          ["ETS", "6.2 w/m x \u20ac3", 18.6],
          ["Destination charges", "6.2 w/m x \u20ac32", 198.4],
          ["Documentation", "per shipment", 55],
        ],
      },
      pdf: {
        kind: "pdf",
        head: "BOOKING REQUEST (scan)",
        rows: [
          ["Load port", ["Rotterdam", 0]],
          ["Discharge", ["Dublin", 1]],
          ["Equipment", ["2 x 20' standard", 2]],
          ["Cargo", ["Machine parts", 3]],
          ["Gross", ["18,400 kg", 4]],
        ],
        fields: [["From", "Rotterdam"], ["To", "Dublin"], ["Load", "FCL, 2 x 20' standard"], ["Cargo", "Machine parts"], ["Weight", "18,400 kg"]],
        lines: [
          ["Ocean freight", "2 x \u20ac780, your FCL tariff", 1560],
          ["BAF", "2 x \u20ac95", 190],
          ["ETS", "2 x \u20ac25", 50],
          ["Terminal handling", "Dublin, 2 x \u20ac180", 360],
          ["Documentation", "per shipment", 40],
        ],
      },
    };
    const money = (value) =>
      "\u20ac" + value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const request = demo.querySelector("[data-demo-request]");
    const out = demo.querySelector("[data-demo-out]");
    const fieldsEl = demo.querySelector("[data-demo-fields]");
    const linesEl = demo.querySelector("[data-demo-lines]");
    const run = demo.querySelector("[data-demo-run]");
    const approve = demo.querySelector("[data-demo-approve]");
    const reset = demo.querySelector("[data-demo-reset]");
    const status = demo.querySelector("[data-demo-status]");
    const tabs = Array.from(demo.querySelectorAll("[data-sample]"));
    let current = "email";
    let timers = [];
    let marks = [];

    const make = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text != null) node.textContent = text;
      return node;
    };
    const later = (fn, ms) => {
      if (reduceMotion) fn();
      else timers.push(setTimeout(fn, ms));
    };
    const mark = (pair) => {
      const node = make("mark", "demo-mark", pair[0]);
      marks[pair[1]] = node;
      return node;
    };

    const show = (name) => {
      timers.forEach(clearTimeout);
      timers = [];
      marks = [];
      current = name;
      const sample = SAMPLES[name];
      tabs.forEach((tab) => {
        const on = tab.dataset.sample === name;
        tab.classList.toggle("is-active", on);
        tab.setAttribute("aria-pressed", String(on));
      });
      request.textContent = "";
      request.className = `demo-request is-${sample.kind}`;
      request.appendChild(make("p", "demo-request-head", sample.head));
      if (sample.body) {
        const para = make("p", "demo-request-body");
        sample.body.forEach((part) => {
          para.appendChild(typeof part === "string" ? document.createTextNode(part) : mark(part));
        });
        request.appendChild(para);
      } else {
        const table = make("dl", "demo-sheet");
        sample.rows.forEach((row) => {
          const wrap = make("div");
          wrap.appendChild(make("dt", "", row[0]));
          const dd = make("dd");
          dd.appendChild(mark(row[1]));
          wrap.appendChild(dd);
          table.appendChild(wrap);
        });
        request.appendChild(table);
      }
      out.hidden = true;
      run.hidden = false;
      reset.hidden = true;
      approve.disabled = true;
      approve.hidden = false;
      status.textContent = "";
      demo.classList.remove("is-sent");
    };

    const finish = (sample, confirmed) => {
      approve.disabled = false;
      status.textContent = confirmed
        ? "Thanks. The draft is ready. Nothing goes out until you approve it."
        : "The draft is ready. Nothing goes out until you approve it.";
    };

    const start = () => {
      const sample = SAMPLES[current];
      run.hidden = true;
      out.hidden = false;
      fieldsEl.textContent = "";
      linesEl.textContent = "";
      status.textContent = "Reading the request...";
      let t = 150;
      let pending = null;
      sample.fields.forEach((field, i) => {
        later(() => {
          if (marks[i]) marks[i].classList.add("is-read");
          const wrap = make("div", field[1] === null ? "is-unsure" : "");
          wrap.appendChild(make("dt", "", field[0]));
          const dd = make("dd");
          if (field[1] === null) {
            dd.appendChild(make("span", "demo-flag", "Not stated"));
            pending = dd;
          } else {
            dd.textContent = field[1];
            dd.appendChild(make("span", "demo-ok", "ok"));
          }
          wrap.appendChild(dd);
          fieldsEl.appendChild(wrap);
        }, t);
        t += 320;
      });
      later(() => {
        status.textContent = "Pricing it on your sea freight tariff...";
      }, t);
      t += 250;
      const cost = sample.lines.reduce((sum, line) => sum + line[2], 0);
      const margin = Math.round(cost * MARGIN * 100) / 100;
      const rows = sample.lines.concat([
        ["Margin", "15% on the lines above", margin],
        ["Total", "indication", cost + margin],
      ]);
      rows.forEach((line, i) => {
        later(() => {
          const li = make("li", i === rows.length - 1 ? "is-total" : "");
          const name = make("span", "demo-line-name");
          name.appendChild(make("span", "", line[0]));
          name.appendChild(make("small", "", line[1]));
          li.appendChild(name);
          li.appendChild(make("span", "dots"));
          li.appendChild(make("span", "demo-amount", money(line[2])));
          linesEl.appendChild(li);
        }, t);
        t += 240;
      });
      later(() => {
        if (!sample.ask) {
          finish(sample, false);
          return;
        }
        status.textContent = sample.ask;
        const yes = make("button", "chip demo-answer", sample.answers[0]);
        const no = make("button", "chip demo-answer", sample.answers[1]);
        [yes, no].forEach((button) => {
          button.type = "button";
          button.addEventListener("click", () => {
            pending.textContent = button.textContent;
            pending.appendChild(make("span", "demo-ok", "you confirmed"));
            pending.parentNode.classList.remove("is-unsure");
            finish(sample, true);
          });
        });
        pending.appendChild(yes);
        pending.appendChild(no);
      }, t);
    };

    tabs.forEach((tab) => tab.addEventListener("click", () => show(tab.dataset.sample)));
    run.addEventListener("click", start);
    approve.addEventListener("click", () => {
      approve.hidden = true;
      reset.hidden = false;
      demo.classList.add("is-sent");
      status.textContent = "Sent, because you approved it. That click is step three, and in the pilot every quote needs it.";
      reset.focus();
    });
    reset.addEventListener("click", () => {
      const order = ["email", "excel", "pdf"];
      show(order[(order.indexOf(current) + 1) % order.length]);
      run.focus();
    });

    show("email");
    demo.hidden = false;
    if (fallback) fallback.hidden = true;
  }

  /* Modes: the autopilot switch is a preview of a future option */
  function setupAutopilot() {
    const toggle = document.querySelector("[data-autopilot]");
    const text = document.querySelector("[data-autopilot-text]");
    if (!toggle || !text) return;
    const off = text.textContent;
    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", String(on));
      text.textContent = on
        ? "That's the idea: one switch, and only you can flip it. It isn't part of the pilot, so this one is just for show."
        : off;
    });
  }

  /* Header: mark the section you are reading */
  function setupNav() {
    const links = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    if (!links.length || !("IntersectionObserver" in window)) return;
    const byId = new Map(links.map((link) => [link.getAttribute("href").slice(1), link]));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => link.removeAttribute("aria-current"));
          const link = byId.get(entry.target.id);
          if (link) link.setAttribute("aria-current", "true");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    byId.forEach((link, id) => {
      const section = document.getElementById(id);
      if (section) io.observe(section);
    });
  }

  /* Waitlist forms */
  function setupForms() {
    const forms = document.querySelectorAll("[data-waitlist-form]");

    forms.forEach((form) => {
      form.noValidate = true;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submitForm(form);
      });

      const reset = form.querySelector("[data-reset]");
      if (reset) {
        reset.addEventListener("click", () => {
          const fields = form.querySelector("[data-fields]");
          const success = form.querySelector("[data-success]");
          fields.hidden = false;
          success.hidden = true;
          const email = form.querySelector('input[name="email"]');
          if (email) email.focus();
        });
      }
    });
  }

  function clearErrors(form) {
    const banner = form.querySelector("[data-banner]");
    banner.hidden = true;
    banner.textContent = "";
    form.querySelectorAll("[data-error-for]").forEach((node) => {
      node.hidden = true;
      node.textContent = "";
    });
    form.querySelectorAll("[aria-invalid='true']").forEach((node) => {
      node.removeAttribute("aria-invalid");
    });
  }

  function reveal(node) {
    if (!node) return;
    const header = document.querySelector(".site-header");
    const offset = (header ? header.getBoundingClientRect().bottom : 0) + 16;
    const rect = node.getBoundingClientRect();
    if (rect.top < offset) {
      window.scrollBy(0, rect.top - offset);
    } else if (rect.bottom > window.innerHeight - 16) {
      window.scrollBy(0, rect.bottom - window.innerHeight + 16);
    }
  }

  function showErrors(form, message, errors) {
    const banner = form.querySelector("[data-banner]");
    banner.textContent = message || "Check the form and try again.";
    banner.hidden = false;
    if (errors && typeof errors === "object") {
      Object.entries(errors).forEach(([name, text]) => {
        if (typeof text !== "string" || !text) return;
        const node = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
        const field = form.querySelector(`[name="${CSS.escape(name)}"]`);
        if (node) {
          node.textContent = text;
          node.hidden = false;
        }
        if (field) field.setAttribute("aria-invalid", "true");
      });
    }
    const firstInvalid = form.querySelector("[aria-invalid='true']");
    if (firstInvalid) firstInvalid.focus({ preventScroll: true });
    else banner.focus({ preventScroll: true });
    reveal(banner);
  }

  function clientErrors(payload) {
    const errors = {};
    const email = String(payload.email || "").trim();
    if (!email) errors.email = "Enter your work email.";
    else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "That email does not look complete.";
    }
    return errors;
  }

  async function submitForm(form) {
    if (form.dataset.submitting === "true") return;
    clearErrors(form);

    const data = new FormData(form);
    const payload = {
      email: data.get("email") ?? "",
      name: data.get("name") ?? "",
      company: data.get("company") ?? "",
      country: data.get("country") ?? "",
      mode: data.get("mode") ?? "",
      qp_leave_blank: data.get("qp_leave_blank") ?? "",
    };

    const localErrors = clientErrors(payload);
    if (Object.keys(localErrors).length > 0) {
      showErrors(form, "Check the form and try again.", localErrors);
      return;
    }

    const button = form.querySelector("[type='submit']");
    const idleLabel = button.textContent;
    form.dataset.submitting = "true";
    button.disabled = true;
    button.textContent = "Sending...";
    form.setAttribute("aria-busy", "true");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.ok && body && body.ok === true) {
        const success = form.querySelector("[data-success]");
        const message = form.querySelector("[data-success-message]");
        const title = form.querySelector("[data-success-title]");
        message.textContent =
          body.message || "You're on the pilot waitlist. We'll write to the work email you gave.";
        form.querySelector("[data-fields]").hidden = true;
        success.hidden = false;
        title.focus({ preventScroll: true });
        reveal(success);
        return;
      }

      showErrors(
        form,
        (body && body.message) ||
          "We could not save your details. Try again, or email cathal@autopilotconsultants.com.",
        body && body.errors,
      );
    } catch {
      showErrors(
        form,
        "We could not reach the waitlist. Try again, or email cathal@autopilotconsultants.com.",
      );
    } finally {
      form.dataset.submitting = "false";
      button.disabled = false;
      button.textContent = idleLabel;
      form.removeAttribute("aria-busy");
    }
  }
})();
