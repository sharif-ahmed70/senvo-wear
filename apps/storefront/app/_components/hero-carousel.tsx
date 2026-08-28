"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

const slides = [
  {
    description:
      "Quietly confident clothing, shaped for real days and the moments that stay with you.",
    image: "/senvo-hero.png",
    kicker: "The foundation collection / 2026",
    title: "Made to move\nwith your life.",
  },
  {
    description:
      "Modern silhouettes inspired by the architecture, energy and warmth of Dhaka.",
    image: "/senvo-hero-urban.png",
    kicker: "City forms / Limited edit",
    title: "Confidence,\ncut with purpose.",
  },
  {
    description:
      "Airy layers, calm colour and effortless tailoring for long, sunlit days.",
    image: "/senvo-hero-summer.png",
    kicker: "Summer edit / First look",
    title: "Lightness\nin every line.",
  },
] as const;

export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const slide = slides[active] ?? slides[0];

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      6200,
    );
    return () => window.clearInterval(timer);
  }, [paused, reduceMotion]);

  const move = (direction: number) =>
    setActive(
      (current) => (current + direction + slides.length) % slides.length,
    );

  return (
    <section
      aria-label="SENVO featured collections"
      aria-roledescription="carousel"
      className="hero-carousel"
      id="top"
      onBlurCapture={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence initial={false}>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="hero-image"
          exit={{ opacity: 0 }}
          initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
          key={slide.image}
          style={{ backgroundImage: `url(${slide.image})` }}
          transition={{ duration: reduceMotion ? 0 : 0.9 }}
        />
      </AnimatePresence>
      <div className="hero-shade" />
      <div aria-atomic="true" aria-live="polite" className="hero-copy">
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            key={slide.title}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="eyebrow light">{slide.kicker}</p>
            <h1>
              {slide.title.split("\n").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p>{slide.description}</p>
            <a className="hero-cta" href="#collection">
              Explore the collection <ArrowRight size={17} />
            </a>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="hero-controls">
        <button aria-label="Previous campaign" onClick={() => move(-1)}>
          <ArrowLeft size={18} />
        </button>
        <div aria-label="Choose campaign" role="tablist">
          {slides.map((item, index) => (
            <button
              aria-label={`Show campaign ${index + 1}`}
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              key={item.image}
              onClick={() => setActive(index)}
              role="tab"
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i />
            </button>
          ))}
        </div>
        <button aria-label="Next campaign" onClick={() => move(1)}>
          <ArrowRight size={18} />
        </button>
      </div>
      <div className="hero-proof">
        <strong>Current</strong>
        <span>price and availability checked at checkout</span>
      </div>
    </section>
  );
}
