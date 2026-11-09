(function () {
  const root = document.documentElement;
  root.classList.add("js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  setupHeader();
  setupRoute();
  setupTabs();
  setupMap();
  setupForms();

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

    select(lanes[0]);
    startCycle();
    play();
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
