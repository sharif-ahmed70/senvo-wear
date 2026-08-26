"use client";

export default function MovementDetailError({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: 24 }}>
      <section
        role="alert"
        style={{
          maxWidth: 720,
          margin: "48px auto",
          padding: 24,
          border: "1px solid #e4ddd5",
          borderRadius: 14,
          background: "#fffdfa",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Movement details could not render</h1>
        <p>The route hit an unexpected UI error. No inventory data was changed.</p>
        <button onClick={reset} type="button">Try again</button>
      </section>
    </main>
  );
}
