"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";

const slideDuration = 6200;

const slides = [
  {
    description:
      "Quietly confident clothing, shaped for real days and the moments that stay with you.",
    image: "/senvo-hero.png",
    kicker: "The foundation collection, 2026",
    title: "Made to move\nwith your life.",
  },
  {
    description:
      "Modern silhouettes inspired by the architecture, energy and warmth of Dhaka.",
    image: "/senvo-hero-urban.png",
    kicker: "City forms, limited edit",
    title: "Confidence,\ncut with purpose.",
  },
  {
    description:
      "Airy layers, calm colour and effortless tailoring for long, sunlit days.",
    image: "/senvo-hero-summer.png",
    kicker: "Summer edit, first look",
    title: "Lightness\nin every line.",
  },
] as const;

export function HeroCarousel() {
  const [active, setActive] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [stopped, setStopped] = useState(false);
  const reduceMotion = useReducedMotion();
  const slide = slides[active] ?? slides[0];
  const playing = !stopped && !hovered && !reduceMotion;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setActive((current) => (current + 1) % slides.length),
      slideDuration,
    );
    return () => window.clearTimeout(timer);
  }, [active, playing]);

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
      onBlurCapture={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence initial={false}>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="hero-image"
          exit={{ opacity: 0 }}
          initial={reduceMotion ? false : { opacity: 0, scale: 1.06 }}
          key={slide.image}
          style={{ backgroundImage: `url(${slide.image})` }}
          transition={{ duration: reduceMotion ? 0 : 1.1, ease: "easeOut" }}
        />
      </AnimatePresence>
      <div className="hero-shade" />
      <div aria-atomic="true" aria-live="polite" className="hero-copy">
        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            initial={reduceMotion ? false : { opacity: 0, y: 28 }}
            key={slide.title}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="hero-kicker">{slide.kicker}</p>
            <h1>
              {slide.title.split("\n").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p className="hero-description">{slide.description}</p>
          </motion.div>
        </AnimatePresence>
        <div className="hero-actions">
          <a className="hero-cta" href="#collection">
            Shop new arrivals <ArrowRight size={16} />
          </a>
          <a className="hero-link" href="#journal">
            Our story
          </a>
        </div>
      </div>
      <div className="hero-controls">
        <p className="hero-counter" aria-hidden="true">
          <strong>{String(active + 1).padStart(2, "0")}</strong>
          <span>/ {String(slides.length).padStart(2, "0")}</span>
        </p>
        <div aria-label="Choose campaign" className="hero-tabs" role="tablist">
          {slides.map((item, index) => (
            <button
              aria-label={`Show campaign ${index + 1}: ${item.kicker}`}
              aria-selected={index === active}
              className={index === active ? "active" : ""}
              key={item.image}
              onClick={() => setActive(index)}
              role="tab"
              type="button"
            >
              <span className="hero-tab-track">
                {index === active ? (
                  <motion.i
                    animate={{ scaleX: 1 }}
                    initial={{ scaleX: playing ? 0 : 1 }}
                    key={`${active}-${playing}`}
                    transition={{
                      duration: playing ? slideDuration / 1000 : 0,
                      ease: "linear",
                    }}
                  />
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <div className="hero-buttons">
          {reduceMotion ? null : (
            <button
              aria-label={stopped ? "Play slideshow" : "Pause slideshow"}
              onClick={() => setStopped((current) => !current)}
              type="button"
            >
              {stopped ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
          <button
            aria-label="Previous campaign"
            onClick={() => move(-1)}
            type="button"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label="Next campaign"
            onClick={() => move(1)}
            type="button"
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
