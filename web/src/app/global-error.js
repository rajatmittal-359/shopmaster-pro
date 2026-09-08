'use client';

/**
 * When the ROOT layout throws.
 *
 * error.js cannot help here: the layout that would have rendered it is the
 * thing that failed, so this file has to supply its own <html> and <body>. It
 * is deliberately plain - no shared components, because whatever they import
 * may be the reason we are here.
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en-IN">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          maxWidth: '32rem',
          margin: '6rem auto',
          padding: '0 1rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>ShopMaster Pro is having a moment</h1>
        <p style={{ marginTop: '0.5rem', color: '#555' }}>
          The whole page failed to load. Trying again usually works.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: '1.5rem',
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            border: 0,
            background: '#5B4BE8',
            color: '#FFFFFF',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        {error?.digest && (
          <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#777' }}>
            Reference {error.digest}
          </p>
        )}
      </body>
    </html>
  );
}
