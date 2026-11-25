import React from "react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="container" style={{ paddingTop: 60 }}>
      <div className="panel" style={{ maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            color: "#d4a038",
            lineHeight: 1,
            marginBottom: 8,
          }}
        >
          404
        </div>
        <h1 className="section-heading" style={{ marginBottom: 8 }}>
          Page Not Found
        </h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          The page or route you requested does not exist on IIIT Trichy Sports.
        </p>
        <Link to="/" className="action-btn" style={{ textDecoration: "none" }}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
